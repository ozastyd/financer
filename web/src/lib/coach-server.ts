import { createHash } from "node:crypto";
import { type FinancialSummary, suggestQuestions, summaryFromDashboard } from "./coach";
import { formatShort } from "./money";
import { dashboardArgs, parseDashboard } from "./dashboard";
import { startOfMonth, todayJakarta } from "./date";
import { dashboard, getFinancialProfile, listCategories, listGoals } from "./db";

/** The user's figures for this month, as the AI Coach reads them (totals from the database, never the full history). */
export function loadSummary(uid: string): FinancialSummary {
  const today = todayJakarta();
  return summaryFromDashboard(
    { financial: getFinancialProfile(uid), categories: listCategories(uid), goals: listGoals(uid, startOfMonth(today)) },
    parseDashboard(dashboard(uid, dashboardArgs("month", today))),
    today,
  );
}

const SUGGEST_PROMPT = `Kamu menyiapkan 3 contoh pertanyaan yang bisa diketuk pengguna untuk memulai obrolan dengan AI Coach keuangan di aplikasi Financer (anak muda Indonesia).
Aturan:
- Ditulis sebagai pengguna, bahasa Indonesia santai dan wajar seperti chat ke teman (pakai "aku"), maksimal 50 karakter, diakhiri tanda tanya.
- Minta saran, penilaian, atau rencana (gimana, perlu nggak, aman nggak, cukup nggak, kapan bisa). Jangan pertanyaan yang jawabannya cuma angka yang sudah terlihat di aplikasi (misalnya "berapa pengeluaranku", "berapa saldoku").
- Terasa personal: pakai fakta yang diberikan (kategori, nama tujuan, utang, angka). Tulis angka persis seperti di fakta (misalnya "1,25 jt", "450 rb"); jangan pakai "M", "k", atau "juta" untuk angka itu. Jangan mengarang tujuan, kategori, atau angka lain.
- Bahasa harus benar dan alami; hindari singkatan aneh atau kata yang salah eja.
- Tiga topik berbeda, misalnya: pengeluaran terbesar, tujuan atau tabungan, utang atau dana darurat atau rencana bulan depan.
- Kalau belum ada transaksi bulan ini, pakai fakta profil saja, dan jangan menyinggung soal belum mencatat, transaksi, atau data.
Contoh gaya (jangan disalin, sesuaikan dengan data): "Makan 1,2 jt bulan ini, kebanyakan nggak?", "Kapan Liburan ke Bali bisa kesampaian?", "Utang 2 jt mending dilunasin dulu?"
Balas hanya JSON: {"questions":["...","...","..."]}`;

/** The user's figures as short Indonesian facts, amounts already written the way the questions should show them. */
export function suggestFacts(s: FinancialSummary): string {
  const f: string[] = [];
  const m = s.this_month;
  const p = s.profile;
  if (m.transactions > 0) {
    f.push(`Bulan ini: pemasukan ${formatShort(m.income)}, pengeluaran ${formatShort(m.expense)}, ${m.net < 0 ? `minus ${formatShort(-m.net)}` : `sisa ${formatShort(m.net)}`}.`);
    const cats = m.top_expense_categories.filter((c) => c.amount > 0).map((c) => `${c.name} ${formatShort(c.amount)}`);
    if (cats.length) f.push(`Pengeluaran terbesar: ${cats.join(", ")}.`);
    if (s.last_month.expense > 0) f.push(`Pengeluaran bulan lalu: ${formatShort(s.last_month.expense)}.`);
  } else {
    f.push("Belum ada transaksi tercatat bulan ini.");
  }
  if (p) {
    if (p.monthly_income > 0) f.push(`Pemasukan bulanan (dari profil): ${formatShort(p.monthly_income + p.additional_income)}.`);
    if (p.existing_debt > 0) f.push(`Utang: ${formatShort(p.existing_debt)}.`);
    if (p.monthly_obligations > 0) f.push(`Cicilan atau kewajiban per bulan: ${formatShort(p.monthly_obligations)}.`);
    if (p.emergency_fund_status) f.push(`Dana darurat: ${p.emergency_fund_status === "belum_ada" ? "belum ada" : p.emergency_fund_status === "sebagian" ? "baru sebagian" : "sudah cukup"}.`);
    if (p.uses_paylater && p.uses_paylater !== "tidak") f.push(`Pakai paylater: ${p.uses_paylater}.`);
    if (p.biggest_challenge) f.push(`Tantangan terbesar menurut pengguna: ${p.biggest_challenge.slice(0, 120)}.`);
  }
  for (const g of s.goals.filter((g) => g.status === "active").slice(0, 3)) {
    f.push(`Tujuan "${g.title}": target ${formatShort(g.target)}, ${g.saved > 0 ? `sudah terkumpul ${formatShort(g.saved)}` : "belum ada yang terkumpul"}${g.monthly_plan ? `, rencana ${formatShort(g.monthly_plan)}/bulan` : ""}.`);
  }
  if (!s.goals.some((g) => g.status === "active")) f.push("Belum punya tujuan tabungan.");
  return f.map((x) => `- ${x}`).join("\n");
}

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const MODELS = (process.env.COACH_SUGGEST_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = 6_000;
const TTL_MS = 12 * 60 * 60 * 1000;

export function cleanSuggestions(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { questions?: unknown }).questions)) return null;
  const qs = ((raw as { questions: unknown[] }).questions)
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.replace(/\s+/g, " ").replace(/^\s*(?:\d+[.)]\s+|[-•*]\s*)?["'“]?|["'”]+$/g, "").trim())
    .filter((q) => q.length >= 8 && q.length <= 70)
    // Units the facts never use: "6M" for 6 juta, "750k", "2jt" without a space.
    .filter((q) => !/\d\s?(M|k|K)\b|\d(jt|rb)\b/.test(q))
    // A slip like "dulu dulu".
    .filter((q) => !/\b(\p{L}+)\s+\1\b/iu.test(q))
    .map((q) => (/[?？]$/.test(q) ? q : `${q}?`));
  const unique = [...new Set(qs)];
  return unique.length >= 3 ? unique.slice(0, 3) : null;
}

async function ask(model: string, summary: FinancialSummary): Promise<string[] | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      reasoning_effort: "low",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SUGGEST_PROMPT },
        { role: "user", content: `Fakta keuangan pengguna:\n${suggestFacts(summary)}` },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return cleanSuggestions(JSON.parse(text));
  } catch {
    return null;
  }
}

// Kept per user until their figures change (a new record, goal or profile edit) or half a day passes.
const cache = new Map<string, { key: string; at: number; questions: string[]; source: "ai" | "rules" }>();
const inflight = new Map<string, Promise<{ questions: string[]; source: "ai" | "rules" }>>();

/** Three questions for the Coach's empty state, written by the AI from the user's own figures. */
export async function coachSuggestions(uid: string, summary: FinancialSummary): Promise<{ questions: string[]; source: "ai" | "rules" }> {
  const key = createHash("sha256").update(JSON.stringify(summary)).digest("hex");
  const hit = cache.get(uid);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return { questions: hit.questions, source: hit.source };
  const running = inflight.get(uid);
  if (running) return running;

  const work = (async () => {
    let questions: string[] | null = null;
    if (GROQ_KEY) {
      for (const model of MODELS) {
        try {
          questions = await ask(model, summary);
          if (questions) break;
        } catch (err) {
          console.error("coach-suggest:", model, err instanceof Error ? err.message : "failed");
        }
      }
    }
    const result = questions ? { questions, source: "ai" as const } : { questions: suggestQuestions(summary), source: "rules" as const };
    // A failed AI call is retried on the next open rather than kept for half a day.
    if (result.source === "ai") cache.set(uid, { key, at: Date.now(), ...result });
    return result;
  })();
  inflight.set(uid, work);
  try {
    return await work;
  } finally {
    inflight.delete(uid);
  }
}
