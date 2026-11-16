import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { COACH_SYSTEM_PROMPT, type FinancialSummary, fallbackReply, summaryFromDashboard } from "@/lib/coach";
import { dashboardArgs, parseDashboard } from "@/lib/dashboard";
import { todayJakarta } from "@/lib/date";
import { dashboard, getFinancialProfile, listCategories, listGoals } from "@/lib/db";
import { coachRequest } from "@/lib/schemas";
import { type SearchResult, searchEnabled, webSearch } from "@/lib/search";
import { requireUser } from "@/lib/server";

// Server-only: the AI key is read here and never sent to the browser.
// Any OpenAI-compatible chat-completions endpoint works (AI_BASE_URL + AI_API_KEY).
const AI_BASE_URL = (process.env.AI_BASE_URL || "").replace(/\/+$/, "");
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "zai-org/GLM-5.3-Flash";
// Long hidden reasoning made answers take minutes on the router; "low" keeps it short.
// Set AI_REASONING_EFFORT=none to omit the parameter for providers that reject it.
const AI_REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "low";

// The router sometimes stalls. A request is abandoned when no data arrives for
// IDLE_TIMEOUT_MS. Until a request starts producing output, a second identical
// one is started after HEDGE_AFTER_MS and the first to produce output wins.
const IDLE_TIMEOUT_MS = 15_000;
const HEDGE_AFTER_MS = 12_000;
const ATTEMPTS = 3;
// Whole-answer budget. The reply is streamed, so Cloudflare's 100 s limit
// (time to first byte) no longer applies once the first event is sent.
const TOTAL_BUDGET_MS = 150_000;
/** Rounds of tool use before the model must answer. */
const MAX_TOOL_ROUNDS = 2;
const MAX_SEARCHES = 3;

// Simple in-memory limit per user (resets on server restart).
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 30;
const hits = new Map<string, number[]>();
/** Seconds until the user may ask again, or 0 when under the limit. */
function rateLimited(key: string): number {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  return 0;
}

class AiError extends Error {
  constructor(public status: number) {
    super(`AI request failed (${status})`);
  }
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Cari di internet secara real-time. Pakai untuk harga produk terkini, perbandingan toko/marketplace di Indonesia, spesifikasi, promo, atau info terbaru lain yang tidak ada di ringkasan data pengguna.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci pencarian, sebaiknya dalam bahasa Indonesia dan spesifik, misalnya 'harga iPhone 16 128GB iBox Tokopedia'." },
      },
      required: ["query"],
    },
  },
} as const;

const SEARCH_PROMPT = `

Kamu punya alat web_search untuk mencari di internet secara real-time.
- Sumber angka ada dua dan jangan dicampur: angka keuangan pengguna hanya dari ringkasan JSON; harga produk, promo, dan info pasar hanya dari hasil web_search. Jangan menebak harga dari ingatan.
- Pakai web_search kalau pengguna tanya soal membeli produk tertentu, harga, perbandingan toko, promo, atau info terbaru. Cukup 1–2 pencarian yang spesifik.
- Untuk rencana beli barang: sebutkan kisaran harga termurah–termahal yang kamu temukan beserta nama tokonya, lalu hubungkan dengan angka di ringkasan (mampu atau tidak, dampak ke tujuan, alternatif lebih hemat seperti varian lain, barang second, atau menunggu promo).
- Tandai harga sebagai "hasil pencarian, bisa berubah". Jangan menulis URL; daftar sumber ditampilkan otomatis oleh aplikasi.
- Pertanyaan yang tidak butuh internet (misalnya ringkasan pengeluaran atau tips umum) jawab langsung tanpa mencari.`;

/** Visible text of a reply: drops <think>…</think> blocks, including one still open. */
function visibleText(raw: string): string {
  const closed = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = closed.search(/<think>/i);
  return (open >= 0 ? closed.slice(0, open) : closed).replace(/^\s+/, "");
}

interface TurnResult {
  content: string;
  tool_calls: ToolCall[];
}

/**
 * Streams one chat completion. onOutput fires on the first content or
 * tool-call data (so the caller can pick this request), onText with the
 * visible text so far.
 */
async function streamTurn(
  messages: ChatMessage[],
  withTools: boolean,
  signal: AbortSignal,
  onOutput: () => boolean,
  onText: (visible: string) => void,
): Promise<TurnResult> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort(signal.reason);
  if (signal.aborted) stop();
  signal.addEventListener("abort", stop, { once: true });
  let idle = setTimeout(() => ctrl.abort(new DOMException("idle", "TimeoutError")), IDLE_TIMEOUT_MS);
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(new DOMException("idle", "TimeoutError")), IDLE_TIMEOUT_MS);
  };
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${AI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        // Answers are ~120 words; the cap also bounds time on a slow stream.
        max_tokens: 1000,
        stream: true,
        ...(AI_REASONING_EFFORT !== "none" ? { reasoning_effort: AI_REASONING_EFFORT } : {}),
        messages,
        ...(withTools ? { tools: [SEARCH_TOOL], tool_choice: "auto" } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new AiError(res.status);

    let raw = "";
    let chosen = false;
    const calls: ToolCall[] = [];
    let buf = "";
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      touch();
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: { choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        const hasOutput = Boolean(delta.content) || Boolean(delta.tool_calls?.length);
        if (hasOutput && !chosen) {
          // Another request already won this turn: give up quietly.
          if (!onOutput()) throw new DOMException("superseded", "AbortError");
          chosen = true;
        }
        if (delta.content) {
          raw += delta.content;
          onText(visibleText(raw));
        }
        for (const tc of delta.tool_calls ?? []) {
          const i = tc.index ?? calls.length;
          calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
          if (tc.id) calls[i].id = tc.id;
          if (tc.function?.name) calls[i].function.name += tc.function.name;
          if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
        }
      }
    }
    if (!chosen && !onOutput()) throw new DOMException("superseded", "AbortError");
    return { content: visibleText(raw).trim(), tool_calls: calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}` })) };
  } finally {
    clearTimeout(idle);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * One model turn with hedging and retries. Text is passed to onText only from
 * the request that produced output first; if that request then fails,
 * onReset clears what was shown and a fresh request takes over.
 */
function runTurn(
  messages: ChatMessage[],
  withTools: boolean,
  deadline: number,
  outer: AbortSignal,
  onText: (visible: string) => void,
  onReset: () => void,
): Promise<TurnResult> {
  return new Promise((resolve, reject) => {
    let started = 0;
    let running = 0;
    let winner = 0;
    let settled = false;
    let lastErr: unknown = new DOMException("budget", "TimeoutError");
    const controllers = new Map<number, AbortController>();
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const budgetTimer = setTimeout(() => controllers.forEach((c) => c.abort(new DOMException("budget", "TimeoutError"))), Math.max(0, deadline - Date.now()));

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(budgetTimer);
      controllers.forEach((c) => c.abort(new DOMException("done", "AbortError")));
      fn();
    };
    const armHedge = () => {
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(() => {
        if (!winner && running > 0) launch();
      }, HEDGE_AFTER_MS);
    };

    function launch(): boolean {
      if (settled || outer.aborted || started >= ATTEMPTS || deadline - Date.now() < 5_000) return false;
      const n = ++started;
      running++;
      const ctrl = new AbortController();
      controllers.set(n, ctrl);
      outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
      const t0 = Date.now();
      streamTurn(
        messages,
        withTools,
        ctrl.signal,
        () => {
          if (winner && winner !== n) return false;
          if (!winner) {
            winner = n;
            clearTimeout(hedgeTimer);
            controllers.forEach((c, k) => k !== n && c.abort(new DOMException("superseded", "AbortError")));
          }
          return true;
        },
        (visible) => {
          if (winner === n) onText(visible);
        },
      ).then(
        (r) => {
          running--;
          console.log(`coach: model ${Date.now() - t0}ms request ${n}, tool calls ${r.tool_calls.length}`);
          finish(() => resolve(r));
        },
        (err) => {
          running--;
          controllers.delete(n);
          if (settled) return;
          const superseded = err instanceof DOMException && err.message === "superseded";
          if (superseded) return;
          const why = err instanceof AiError ? err.status : err instanceof Error ? `${err.name} ${err.message}` : "";
          console.log(`coach: model failed after ${Date.now() - t0}ms request ${n}: ${why}`);
          lastErr = err;
          if (winner === n) {
            // The request whose text was on screen died: clear it and start over.
            winner = 0;
            onReset();
          }
          const retryable = !(err instanceof AiError) || err.status === 429 || err.status >= 500;
          if (!retryable) {
            if (running === 0) finish(() => reject(err));
            return;
          }
          const delay = err instanceof AiError && err.status === 429 ? 1500 : 0;
          setTimeout(() => {
            if (settled) return;
            if (running === 0 || !winner) {
              if (launch()) armHedge();
              else if (running === 0) finish(() => reject(lastErr));
            }
          }, delay);
        },
      );
      return true;
    }

    if (!launch()) return reject(lastErr);
    armHedge();
  });
}

interface SourceLink {
  title: string;
  url: string;
}

type CoachEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "reset" }
  | { type: "done"; source: "ai" | "fallback"; reply?: string; notice?: string; sources?: SourceLink[] };

/** Runs the conversation, searching the web when the model asks to, and streams events. */
async function converse(messages: ChatMessage[], send: (e: CoachEvent) => void, signal: AbortSignal): Promise<{ text: string; sources: SourceLink[] }> {
  const sources = new Map<string, SourceLink>();
  let searches = 0;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (let round = 0; ; round++) {
    const canSearch = searchEnabled && round < MAX_TOOL_ROUNDS && searches < MAX_SEARCHES && deadline - Date.now() > 50_000;
    let shown = false;
    const msg = await runTurn(
      messages,
      canSearch,
      deadline,
      signal,
      (visible) => {
        shown = visible.length > 0;
        send({ type: "text", text: visible });
      },
      () => {
        shown = false;
        send({ type: "reset" });
      },
    );
    if (!canSearch || msg.tool_calls.length === 0) return { text: msg.content, sources: [...sources.values()].slice(0, 6) };

    // The model wants to search: anything it wrote before the call is not the answer.
    if (shown) send({ type: "reset" });
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
    const queries = msg.tool_calls.map((call) => {
      try {
        return String((JSON.parse(call.function.arguments || "{}") as { query?: string }).query ?? "").trim();
      } catch {
        return "";
      }
    });
    const shownQueries = queries.filter(Boolean).slice(0, 2);
    send({ type: "status", text: shownQueries.length ? `Mencari: ${shownQueries.join(" · ")}` : "Mencari di internet…" });
    const results = await Promise.all(
      msg.tool_calls.map(async (call, i) => {
        const query = queries[i];
        if (call.function?.name !== "web_search" || searches >= MAX_SEARCHES) return "Alat tidak tersedia. Jawab dengan data yang sudah ada.";
        searches++;
        if (!query) return "Kata kunci pencarian kosong.";
        try {
          const found: SearchResult[] = await webSearch(query);
          for (const r of found) if (!sources.has(r.url)) sources.set(r.url, { title: r.title, url: r.url });
          if (!found.length) return `Tidak ada hasil untuk "${query}".`;
          return JSON.stringify(found.map((r) => ({ judul: r.title, url: r.url, tanggal: r.published, isi: r.text })));
        } catch (e) {
          console.error("coach: search failed", e instanceof Error ? e.message : "");
          return "Pencarian gagal. Jawab tanpa data internet dan bilang ke pengguna bahwa harga terkini belum bisa dicek.";
        }
      }),
    );
    msg.tool_calls.forEach((call, i) => messages.push({ role: "tool", tool_call_id: call.id, content: results[i] }));
    send({ type: "status", text: "Menyusun jawaban…" });
  }
}

// Reads only totals computed by the database, never the full transaction history.
function loadSummary(uid: string): FinancialSummary {
  const today = todayJakarta();
  return summaryFromDashboard(
    { financial: getFinancialProfile(uid), categories: listCategories(uid), goals: listGoals(uid) },
    parseDashboard(dashboard(uid, dashboardArgs("month", today))),
    today,
  );
}

/**
 * Replies as a Server-Sent Events stream: "status" lines while working,
 * "text" with the full visible answer so far, "reset" to clear it, and a
 * final "done" (with sources, or a fallback reply when the AI failed).
 * Errors before streaming starts (validation, rate limit) are plain JSON.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = await parseBody(req, coachRequest);
  if (body instanceof NextResponse) return body;

  let summary: FinancialSummary;
  try {
    summary = loadSummary(auth.uid);
  } catch {
    return NextResponse.json({ error: "Gagal membaca datamu. Coba lagi." }, { status: 502 });
  }

  const wait = rateLimited(auth.uid);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Kamu sudah bertanya ${LIMIT} kali dalam sejam terakhir.`, retry_after: wait },
      { status: 429, headers: { "retry-after": String(wait) } },
    );
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user" || body.messages[0].role !== "user") return NextResponse.json({ error: "Format percakapan tidak valid." }, { status: 400 });
  const question = last.content;
  const today = todayJakarta();
  const messages: ChatMessage[] = [
    { role: "system", content: `${COACH_SYSTEM_PROMPT}${searchEnabled ? SEARCH_PROMPT : ""}\n\nTanggal hari ini: ${today} (Asia/Jakarta).` },
    { role: "user", content: `Ringkasan data keuangan pengguna (JSON):\n${JSON.stringify(summary)}` },
    { role: "assistant", content: "Oke, aku sudah baca ringkasannya." },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: CoachEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false;
        }
      };
      // Keeps Cloudflare and the browser from treating a quiet stretch as a dead connection.
      const ping = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          open = false;
        }
      }, 10_000);
      const fallback = (notice: string) => {
        send({ type: "reset" });
        send({ type: "done", source: "fallback", reply: fallbackReply(question, summary), notice });
      };

      try {
        if (!AI_BASE_URL || !AI_API_KEY) {
          fallback("AI Coach sedang tidak tersedia, jadi ini jawaban otomatis dari angkamu.");
        } else {
          send({ type: "status", text: "Lagi mikir…" });
          try {
            const { text, sources } = await converse(messages, send, req.signal);
            if (!text) fallback("AI tidak memberi jawaban, jadi ini jawaban otomatis dari angkamu.");
            else send({ type: "done", source: "ai", reply: text, sources: sources.length ? sources : undefined });
          } catch (err) {
            if (req.signal.aborted) return;
            let notice = "Layanan AI sedang tidak tersedia, jadi ini jawaban otomatis dari angkamu.";
            if (err instanceof AiError && (err.status === 401 || err.status === 403)) notice = "Kunci layanan AI ditolak, jadi ini jawaban otomatis dari angkamu.";
            else if (err instanceof AiError && err.status === 429) notice = "Layanan AI sedang sibuk, jadi ini jawaban otomatis dari angkamu.";
            console.error("coach: AI request failed", err instanceof AiError ? err.status : err instanceof Error ? err.name : "");
            fallback(notice);
          }
        }
      } finally {
        clearInterval(ping);
        open = false;
        try {
          controller.close();
        } catch {
          // already closed (client went away)
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
