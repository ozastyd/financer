import "server-only";

import sharp from "sharp";
import { z } from "zod";
import type { Category } from "./types";

// Reads receipts, bank-app screenshots and bank-statement PDFs into
// transactions with Groq's vision model (OpenAI-compatible API). Nothing is
// stored: the file is processed in memory and only the extracted rows return.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const VISION_MODEL = process.env.SCAN_MODEL || "qwen/qwen3.8-27b";

export const scanEnabled = Boolean(GROQ_KEY);

/** Long side in px. Token cost grows with pixels; 1280 keeps small receipt text readable. */
const MAX_SIDE = 1280;
/** Chars of statement text per request (stays well inside the free tier's tokens per minute). */
const TEXT_CHUNK = 4500;
const MAX_TEXT = 40_000;

export class ScanError extends Error {
  constructor(
    public code: "busy" | "unreadable" | "password" | "too_big" | "failed",
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// model output
// ---------------------------------------------------------------------------

const intish = z.coerce.number().transform((n) => Math.round(Math.abs(n)));
const dateish = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

const rawSchema = z.object({
  kind: z.enum(["receipt", "statement", "other"]).catch("other"),
  merchant: z.string().max(80).nullable().catch(null),
  date: dateish,
  date_clear: z.boolean().catch(false),
  total: intish.nullable().catch(null),
  category: z.string().nullable().catch(null),
  items: z
    .array(z.object({ name: z.string().max(80), qty: z.coerce.number().nullable().catch(null), amount: z.coerce.number(), category: z.string().nullable().catch(null) }))
    .catch([]),
  transactions: z
    .array(
      z.object({
        date: dateish,
        description: z.string().max(120).catch(""),
        amount: z.coerce.number(),
        type: z.enum(["income", "expense"]).nullable().catch(null),
        category: z.string().nullable().catch(null),
      }),
    )
    .catch([]),
});

const DISCOUNT_RE = /diskon|discount|disc\b|potongan|hemat|promo|voucher|cashback/i;

export interface ScanItem {
  name: string;
  qty: number | null;
  /** Negative for discount lines. */
  amount: number;
  category_id: string;
}

export interface ScanTx {
  date: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id: string;
}

export interface ScanResult {
  kind: "receipt" | "statement" | "other";
  merchant: string | null;
  date: string | null;
  dateClear: boolean;
  total: number | null;
  category_id: string | null;
  items: ScanItem[];
  transactions: ScanTx[];
  /** Set when a long PDF could only be partly read. */
  partial?: { read: number; of: number };
}

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

/** Short codes (e1, i1, …) keep the prompt small; they map back to category ids. */
function categoryCodes(categories: Category[]) {
  const codes = new Map<string, string>();
  const lines: string[] = [];
  for (const type of ["expense", "income"] as const) {
    categories
      .filter((c) => c.type === type)
      .forEach((c, i) => {
        const code = `${type === "expense" ? "e" : "i"}${i + 1}`;
        codes.set(code, c.id);
        lines.push(`${code} = ${c.name} (${type === "expense" ? "pengeluaran" : "pemasukan"})`);
      });
  }
  return { codes, list: lines.join("\n") };
}

function instructions(categoryList: string, today: string, source: "image" | "text") {
  return `Kamu membaca ${source === "image" ? "gambar" : "teks"} keuangan dari pengguna di Indonesia: struk belanja, screenshot mutasi/riwayat transaksi aplikasi bank atau e-wallet, atau rekening koran.
Hari ini ${today}. Kalau tahun tidak tertulis, pakai tahun yang paling masuk akal (tidak di masa depan).

Kategori pengguna (pakai KODE-nya):
${categoryList}

Balas HANYA JSON dengan bentuk:
{"kind":"receipt"|"statement"|"other","merchant":string|null,"date":"YYYY-MM-DD"|null,"date_clear":boolean,"total":number|null,"category":KODE|null,"items":[{"name":string,"qty":number|null,"amount":number,"category":KODE}],"transactions":[{"date":"YYYY-MM-DD"|null,"description":string,"amount":number,"type":"income"|"expense","category":KODE}]}

Aturan:
- Semua angka dalam rupiah utuh tanpa titik/koma ribuan (Rp86.500 -> 86500).
- receipt: isi merchant, date, total (yang dibayar setelah diskon, bukan uang tunai/kembalian), category paling cocok untuk struk, dan items (harga baris = qty x harga satuan, diskon dikurangkan dari barang terkait kalau jelas). transactions kosong.
- statement: isi transactions untuk setiap baris mutasi. amount selalu positif; type income untuk uang masuk (kredit/CR/+), expense untuk uang keluar (debit/DB/-). Abaikan baris saldo awal/akhir dan total. description singkat dari keterangan baris. items kosong.
- date_clear true hanya kalau tanggal tercetak jelas.
- Kalau bukan dokumen keuangan atau tidak terbaca, kind "other" dan isi yang sempat terbaca saja (misalnya total).
- Jangan mengarang angka yang tidak ada.`;
}

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

async function callGroq(content: unknown, maxTokens: number): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json", "user-agent": "financer-server" },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.1,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 429) {
      const wait = Math.ceil(Number(res.headers.get("retry-after") ?? "20"));
      // Short waits are worth absorbing; long ones go back to the user.
      if (attempt === 0 && wait <= 20) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw new ScanError("busy", "Layanan scan sedang ramai.", wait);
    }
    if (!res.ok) {
      console.error("scan: groq error", res.status);
      throw new ScanError("failed", "Gagal membaca file. Coba lagi.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    } catch {
      throw new ScanError("unreadable", "Hasil baca tidak bisa dipahami.");
    }
  }
}

function normalize(raw: unknown, codes: Map<string, string>, categories: Category[]): ScanResult {
  const r = rawSchema.parse(raw);
  const fallback = (type: "income" | "expense") =>
    categories.find((c) => c.type === type && c.name === "Lainnya")?.id ?? categories.find((c) => c.type === type)?.id ?? "";
  const pick = (code: string | null, type: "income" | "expense") => {
    const id = code ? codes.get(code.trim()) : undefined;
    const cat = id ? categories.find((c) => c.id === id) : undefined;
    return cat && cat.type === type ? cat.id : fallback(type);
  };
  return {
    kind: r.kind,
    merchant: r.merchant?.trim() || null,
    date: r.date,
    dateClear: r.date_clear && Boolean(r.date),
    total: r.total && r.total > 0 ? r.total : null,
    category_id: r.kind === "receipt" ? pick(r.category, "expense") : null,
    // Discount lines count against the total (the model may give them as positive numbers).
    items: r.items
      .filter((i) => Number.isFinite(i.amount) && Math.round(i.amount) !== 0 && i.name.trim())
      .map((i) => {
        const amount = Math.round(Math.abs(i.amount));
        const discount = i.amount < 0 || DISCOUNT_RE.test(i.name);
        return { name: i.name.trim(), qty: i.qty && i.qty > 1 ? Math.round(i.qty) : null, amount: discount ? -amount : amount, category_id: pick(i.category ?? r.category, "expense") };
      }),
    transactions: r.transactions
      .filter((t) => Number.isFinite(t.amount) && Math.abs(t.amount) > 0)
      .map((t) => {
        const type = t.type ?? (t.amount < 0 ? "expense" : "income");
        return { date: t.date, description: t.description.trim().slice(0, 120) || (type === "income" ? "Pemasukan" : "Pengeluaran"), amount: Math.round(Math.abs(t.amount)), type, category_id: pick(t.category, type) };
      }),
  };
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

export async function scanImage(file: Buffer, categories: Category[], today: string): Promise<ScanResult> {
  let jpeg: Buffer;
  try {
    jpeg = await sharp(file, { limitInputPixels: 60_000_000 }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    throw new ScanError("unreadable", "Format gambar ini belum bisa dibaca. Coba JPG atau PNG.");
  }
  const { codes, list } = categoryCodes(categories);
  const raw = await callGroq(
    [
      { type: "text", text: instructions(list, today, "image") },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
    ],
    2500,
  );
  return normalize(raw, codes, categories);
}

export async function scanPdf(file: Buffer, password: string | undefined, categories: Category[], today: string, deadline: number): Promise<ScanResult> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file), { password });
    const out = await extractText(pdf, { mergePages: true });
    text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") {
      throw new ScanError("password", password ? "Kata sandi PDF salah." : "PDF ini dikunci kata sandi.");
    }
    throw new ScanError("unreadable", "PDF ini tidak bisa dibuka.");
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) {
    throw new ScanError("unreadable", "PDF ini berupa gambar hasil scan. Coba unggah foto atau screenshot halamannya.");
  }
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

  // Split on line breaks into chunks the free tier can take one at a time.
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > TEXT_CHUNK && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += `${line}\n`;
  }
  if (cur.trim()) chunks.push(cur);

  const { codes, list } = categoryCodes(categories);
  const merged: ScanResult = { kind: "statement", merchant: null, date: null, dateClear: false, total: null, category_id: null, items: [], transactions: [] };
  let read = 0;
  for (const [i, chunk] of chunks.entries()) {
    if (i > 0 && Date.now() > deadline) break;
    try {
      const part = normalize(
        await callGroq(`${instructions(list, today, "text")}\n\nIni teks rekening koran (bagian ${i + 1} dari ${chunks.length}):\n"""\n${chunk}\n"""`, 3000),
        codes,
        categories,
      );
      merged.transactions.push(...part.transactions);
      read++;
    } catch (e) {
      // Keep what was read so far when later parts hit the rate limit.
      if (read > 0 && e instanceof ScanError && e.code === "busy") break;
      throw e;
    }
  }
  if (read < chunks.length) merged.partial = { read, of: chunks.length };
  if (!merged.transactions.length) merged.kind = "other";
  return merged;
}
