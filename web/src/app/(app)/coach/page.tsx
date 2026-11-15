"use client";

import { ArrowRight, Clock, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Spinner } from "@/components/ui/controls";
import { fallbackReply, summaryFromDashboard } from "@/lib/coach";
import { MESSAGES, isOffline } from "@/lib/errors";
import { useDashboard } from "@/lib/queries";

interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: "ai" | "fallback";
  notice?: string;
  sources?: { title: string; url: string }[];
}

/** The chat bubble shows plain text: drop markdown bold/italic markers and headings. */
function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/\*\*$/, "");
}

type CoachEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "reset" }
  | { type: "done"; source: "ai" | "fallback"; reply?: string; notice?: string; sources?: { title: string; url: string }[] };

const SUGGESTIONS = ["Gimana cara nabung lebih banyak bulan ini?", "Aku mampu beli HP Rp5 juta nggak?", "Ke mana uangku paling banyak keluar?"];

/** Wall-clock time, read only from event handlers and timers. */
function currentTime(): number {
  return Date.now();
}

export default function CoachPage() {
  const { data, today, notifySessionExpired } = useApp();
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const [limitText, setLimitText] = useState("");
  const [now, setNow] = useState(0);
  const dashQuery = useDashboard("month", today);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);
  const limited = limitedUntil !== null && limitedUntil > now;

  useEffect(() => {
    if (limitedUntil === null) return;
    const t = window.setInterval(() => setNow(currentTime()), 30_000);
    return () => window.clearInterval(t);
  }, [limitedUntil]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, streaming, status]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading || limited) return;
    if (q.length > 2000) return setError("Pertanyaan terlalu panjang (maksimal 2000 karakter).");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string; retry_after?: number };
        if (res.status === 429) {
          // E2: limit reached; keep the question so it can be sent later
          const wait = Number(res.headers.get("retry-after") ?? json.retry_after ?? 3600);
          const stamp = currentTime();
          setLimitedUntil(stamp + wait * 1000);
          setNow(stamp);
          setLimitText(json.error ?? "Kuota pertanyaan sudah habis.");
        } else if (res.status === 401) {
          notifySessionExpired();
        } else {
          setError(json.error ?? "Gagal menghubungi AI Coach. Coba lagi.");
        }
        setMessages(next.slice(0, -1));
        setInput(q);
        return;
      }

      // Server-Sent Events: status lines, the answer as it is written, then "done".
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done: Extract<CoachEvent, { type: "done" }> | null = null;
      let text = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
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
          if (e.type === "status") setStatus(e.text);
          else if (e.type === "text") {
            text = e.text;
            setStreaming(plain(text));
          } else if (e.type === "reset") {
            text = "";
            setStreaming("");
          } else if (e.type === "done") done = e;
        }
      }
      const reply = done?.reply ?? text;
      if (!done || !reply) throw new Error("stream ended early");
      setMessages([...next, { role: "assistant", content: plain(reply).trim(), source: done.source, notice: done.notice, sources: done.sources }]);
    } catch {
      // network failure: answer locally from the totals already on screen, if any
      const dash = dashQuery.data;
      if (dash) {
        const summary = summaryFromDashboard(data, dash, today);
        setMessages([...next, { role: "assistant", content: fallbackReply(q, summary), source: "fallback", notice: "Tidak ada koneksi, jadi ini jawaban otomatis dari angkamu." }]);
      } else {
        setError(isOffline() ? MESSAGES.offline : "Tidak ada koneksi. Coba lagi.");
        setMessages(next.slice(0, -1));
        setInput(q);
      }
    } finally {
      setLoading(false);
      setStatus("");
      setStreaming("");
    }
  };

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <div className="col sp" style={{ gap: 0 }}>
          <h1 className="h1">AI Coach</h1>
          <p className="s mut">Membaca ringkasan angkamu dan bisa cek harga di internet</p>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="bubble-ai">
          <p className="t">
            Halo! Tanya apa saja soal uangmu. Aku jawab pakai angka dari catatanmu sendiri
            {dashQuery.data && dashQuery.data.allTimeCount === 0 ? ", jadi makin banyak yang kamu catat, makin tepat jawabanku." : "."}
          </p>
        </div>
      )}

      <div className="col" style={{ gap: 12 }} aria-live="polite">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="bubble-me">
              <p className="t">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="col" style={{ gap: 6, alignItems: "flex-start" }}>
              <div className="bubble-ai">
                <p className="t">{m.content}</p>
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="col" style={{ gap: 4, paddingInline: 4 }}>
                  <p className="s mut">Sumber dari internet (harga bisa berubah):</p>
                  {m.sources.map((src) => {
                    let host = src.url;
                    try {
                      host = new URL(src.url).hostname.replace(/^www\./, "");
                    } catch {
                      // keep the raw URL
                    }
                    return (
                      <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="s" style={{ color: "var(--pri)", textDecoration: "underline", overflowWrap: "anywhere" }}>
                        {host} · {src.title.length > 70 ? `${src.title.slice(0, 70)}…` : src.title}
                      </a>
                    );
                  })}
                </div>
              )}
              {m.source === "fallback" && (
                <p className="s mut row" style={{ gap: 6, alignItems: "flex-start" }}>
                  <Info size={14} aria-hidden="true" style={{ marginTop: 3, flex: "none" }} />
                  {m.notice ?? "Jawaban otomatis dari angkamu."}
                </p>
              )}
            </div>
          ),
        )}
        {loading && streaming && (
          <div className="col" style={{ gap: 6, alignItems: "flex-start" }}>
            <div className="bubble-ai">
              <p className="t">{streaming}</p>
            </div>
          </div>
        )}
        {loading && !streaming && (
          <div className="bubble-ai row" style={{ gap: 8 }}>
            <Spinner label="AI Coach sedang menjawab" />
            <span className="s mut">{status || "Lagi mikir…"}</span>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="wrap">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" type="button" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="sp" />
      {limited && limitedUntil && (
        <div className="card note-amb" role="status" style={{ gap: 8 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="icb" style={{ background: "var(--sf)", color: "var(--amb)" }}>
              <Clock size={20} aria-hidden="true" />
            </span>
            <div className="col sp" style={{ gap: 2 }}>
              <p className="t b">Kuota pertanyaan sudah habis</p>
              <p className="s">
                {limitText} Bisa bertanya lagi sekitar pukul{" "}
                {new Date(limitedUntil).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.
              </p>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <p className="s mut" style={{ textAlign: "center" }}>
        Edukasi finansial, bukan nasihat keuangan berlisensi.
      </p>
      <form
        className="row"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input className="inp" type="text" aria-label="Tulis pertanyaan" placeholder="Tanya soal uangmu…" value={input} maxLength={2000} onChange={(e) => setInput(e.target.value)} />
        <button
          className="ibtn"
          type="submit"
          aria-label="Kirim"
          disabled={loading || limited || !input.trim()}
          style={{ width: 52, height: 52, borderRadius: 14, background: "var(--pri)", color: "var(--onpri)", borderColor: "var(--pri)", opacity: loading || !input.trim() ? 0.6 : 1 }}
        >
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </form>
      <div ref={endRef} />
    </main>
  );
}
