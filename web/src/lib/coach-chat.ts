"use client";

// The AI Coach conversation lives here, outside the page component, so a
// reply that is still being written keeps streaming when the user switches
// tabs and is on screen when they come back. Messages are also kept in
// sessionStorage, so they survive a reload of the same browser tab.
import { useSyncExternalStore } from "react";

export interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: "ai" | "fallback";
  notice?: string;
  sources?: { title: string; url: string }[];
}

export interface CoachState {
  uid: string | null;
  messages: Msg[];
  /** What is typed in the composer (kept across tab switches). */
  input: string;
  loading: boolean;
  status: string;
  streaming: string;
  error: string | null;
  limitedUntil: number | null;
  limitText: string;
}

type CoachEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "reset" }
  | { type: "done"; source: "ai" | "fallback"; reply?: string; notice?: string; sources?: { title: string; url: string }[] };

/** What send() needs from the app at the moment of sending. */
export interface SendContext {
  notifySessionExpired: () => void;
  /** A local answer from the numbers on screen when the network fails, or null. */
  fallback: (question: string) => Msg | null;
  offlineMessage: () => string;
}

const EMPTY: CoachState = { uid: null, messages: [], input: "", loading: false, status: "", streaming: "", error: null, limitedUntil: null, limitText: "" };

let state: CoachState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<CoachState>) {
  state = { ...state, ...patch };
  if ("messages" in patch) save();
  listeners.forEach((l) => l());
}

const key = (uid: string | null) => `financer:coach:${uid ?? "anon"}`;

function save() {
  try {
    if (state.messages.length) window.sessionStorage.setItem(key(state.uid), JSON.stringify(state.messages.slice(-40)));
    else window.sessionStorage.removeItem(key(state.uid));
  } catch {
    /* optional */
  }
}

function load(uid: string | null): Msg[] {
  try {
    const raw = window.sessionStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as Msg[]).slice(-40) : [];
  } catch {
    return [];
  }
}

/** Points the store at this account (another account never sees the conversation). */
export function selectAccount(uid: string | undefined) {
  const id = uid ?? null;
  if (state.uid !== id && !state.loading) {
    state = { ...EMPTY, uid: id, messages: load(id) };
    listeners.forEach((l) => l());
  }
}

/** The current conversation; re-renders on every change. */
export function useCoachChat(): CoachState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export const setInput = (input: string) => set({ input });

// A question handed over from another screen (e.g. Beranda's spending card),
// sent as soon as the Coach page opens.
let pendingAsk: string | null = null;
export function queueAsk(question: string) {
  pendingAsk = question;
}
export function takePendingAsk(): string | null {
  const q = pendingAsk;
  pendingAsk = null;
  return q;
}

// The request in flight, so the user can stop it.
let inFlight: AbortController | null = null;
/** Stops the answer being written; the question goes back to the composer. */
export function cancel() {
  inFlight?.abort(new DOMException("cancelled", "AbortError"));
}

/** No sign of life from the server for this long: stop waiting. */
const STALL_MS = 35_000;
/** Longest a whole answer may take before the user gets the automatic one. */
const MAX_MS = 75_000;
export const newChat = () => {
  if (!state.loading) set({ messages: [], error: null });
};
export const clearLimit = () => set({ limitedUntil: null, limitText: "" });

/** The chat bubble shows plain text: drop markdown bold/italic markers and headings. */
export function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/\*\*$/, "");
}

/**
 * The last question has no answer (the tab was reloaded or closed mid-reply).
 * Removes it so it can be sent again.
 */
export function takeUnanswered(): string | null {
  const last = state.messages[state.messages.length - 1];
  if (state.loading || !last || last.role !== "user") return null;
  set({ messages: state.messages.slice(0, -1) });
  return last.content;
}

export async function send(text: string, ctx: SendContext) {
  const q = text.trim();
  const limited = state.limitedUntil !== null && state.limitedUntil > Date.now();
  if (!q || state.loading || limited) return;
  if (q.length > 2000) return set({ error: "Pertanyaan terlalu panjang (maksimal 2000 karakter)." });
  const next: Msg[] = [...state.messages, { role: "user", content: q }];
  set({ messages: next, input: "", error: null, loading: true, status: "", streaming: "" });
  // Put the question back in the composer and drop it from the conversation.
  const giveBack = (patch: Partial<CoachState>) => set({ messages: next.slice(0, -1), input: q, ...patch });
  const ctrl = new AbortController();
  inFlight = ctrl;
  let stall: ReturnType<typeof setTimeout> | undefined;
  const alive = () => {
    clearTimeout(stall);
    stall = setTimeout(() => ctrl.abort(new DOMException("stalled", "TimeoutError")), STALL_MS);
  };
  alive();
  const cap = setTimeout(() => ctrl.abort(new DOMException("too long", "TimeoutError")), MAX_MS);
  // While nothing new arrives, say it's still working.
  const patience = setTimeout(() => {
    if (state.loading && !state.streaming) set({ status: "Masih menyiapkan jawaban…" });
  }, 12_000);
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: next.slice(-12).map(({ role, content }) => ({ role, content })) }),
      signal: ctrl.signal,
    });
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
      const json = (await res.json().catch(() => ({}))) as { error?: string; retry_after?: number };
      if (res.status === 429) {
        // E2: limit reached; keep the question so it can be sent later
        const wait = Number(res.headers.get("retry-after") ?? json.retry_after ?? 3600);
        giveBack({ limitedUntil: Date.now() + wait * 1000, limitText: json.error ?? "Kuota pertanyaan sudah habis." });
      } else if (res.status === 401) {
        ctx.notifySessionExpired();
        giveBack({});
      } else {
        giveBack({ error: json.error ?? "Gagal menghubungi AI Coach. Coba lagi." });
      }
      return;
    }

    // Server-Sent Events: status lines, the answer as it is written, then "done".
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done: Extract<CoachEvent, { type: "done" }> | null = null;
    let streamed = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      alive();
      buf += decoder.decode(chunk.value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const line = block.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let e: CoachEvent;
        try {
          e = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        if (e.type === "status") set({ status: e.text });
        else if (e.type === "text") {
          streamed = e.text;
          set({ streaming: plain(streamed) });
        } else if (e.type === "reset") {
          streamed = "";
          set({ streaming: "" });
        } else if (e.type === "done") done = e;
      }
    }
    const reply = done?.reply ?? streamed;
    if (!done || !reply) throw new Error("stream ended early");
    set({ messages: [...next, { role: "assistant", content: plain(reply).trim(), source: done.source, notice: done.notice, sources: done.sources }] });
  } catch (e) {
    const reason = ctrl.signal.reason;
    if (!(reason instanceof DOMException)) console.warn("coach: request failed", e);
    if (reason instanceof DOMException && reason.message === "cancelled") {
      // Stopped by the user: back to how it was before sending.
      giveBack({});
      return;
    }
    // Too slow or no connection: answer locally from the totals on screen, if any.
    const slow = reason instanceof DOMException && reason.name === "TimeoutError";
    const local = ctx.fallback(q);
    if (local) set({ messages: [...next, slow ? { ...local, notice: "AI Coach terlalu lama merespons, jadi ini jawaban otomatis dari angkamu." } : local] });
    else giveBack({ error: slow ? "AI Coach tidak merespons. Coba lagi sebentar lagi." : ctx.offlineMessage() });
  } finally {
    clearTimeout(stall);
    clearTimeout(cap);
    clearTimeout(patience);
    if (inFlight === ctrl) inFlight = null;
    set({ loading: false, status: "", streaming: "" });
  }
}
