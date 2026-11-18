"use client";

import { ArrowRight, Clock, Info, Plus, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useShell } from "@/components/shell";
import { Spinner } from "@/components/ui/controls";
import { fallbackReply, summaryFromDashboard } from "@/lib/coach";
import { type SendContext, cancel, clearLimit, newChat, selectAccount, send as sendMessage, setInput, takePendingAsk, takeUnanswered, useCoachChat } from "@/lib/coach-chat";
import { MESSAGES, isOffline } from "@/lib/errors";
import { useDashboard } from "@/lib/queries";

// With records the coach can read where money went; before the first record it
// answers from the onboarding profile, so it only suggests questions it can answer.
const SUGGESTIONS = ["Gimana cara nabung lebih banyak bulan ini?", "Aku mampu beli HP Rp5 juta nggak?", "Ke mana uangku paling banyak keluar?"];
const FIRST_SUGGESTIONS = ["Dana darurat idealnya berapa buatku?", "Aku mampu beli HP Rp5 juta nggak?", "Gimana mulai nabung dari gajiku?"];

/** Wall-clock time, read only from event handlers and timers. */
function currentTime(): number {
  return Date.now();
}

export default function CoachPage() {
  const { data, today, session, notifySessionExpired } = useApp();
  const { openAddTx } = useShell();
  const dashQuery = useDashboard("month", today);
  // The conversation (and a reply still being written) lives outside this page,
  // so switching tabs doesn't interrupt it.
  const { messages, input, loading, status, streaming, error, limitedUntil, limitText } = useCoachChat();
  useEffect(() => selectAccount(session?.userId), [session?.userId]);
  const [now, setNow] = useState(() => currentTime());
  const limited = limitedUntil !== null && limitedUntil > now;
  const noRecords = dashQuery.data ? dashQuery.data.allTimeCount === 0 : false;
  const last = messages[messages.length - 1];
  const unanswered = !loading && last?.role === "user";

  useEffect(() => {
    if (limitedUntil === null) return;
    const t = window.setInterval(() => {
      const n = currentTime();
      setNow(n);
      if (n >= limitedUntil) clearLimit();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [limitedUntil]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, streaming, status]);

  const ctx: SendContext = {
    notifySessionExpired,
    fallback: (q) => {
      const dash = dashQuery.data;
      if (!dash) return null;
      return { role: "assistant", content: fallbackReply(q, summaryFromDashboard(data, dash, today)), source: "fallback", notice: "Tidak ada koneksi, jadi ini jawaban otomatis dari angkamu." };
    },
    offlineMessage: () => (isOffline() ? MESSAGES.offline : "Tidak ada koneksi. Coba lagi."),
  };
  const send = (text: string) => {
    setNow(currentTime());
    void sendMessage(text, ctx);
  };

  // A question handed over from Beranda ("Tanya AI Coach cara menghematnya") is asked right away.
  useEffect(() => {
    const q = takePendingAsk();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sends the handed-over question once, when the page opens
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, []);

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <div className="col sp" style={{ gap: 0 }}>
          <h1 className="h1">AI Coach</h1>
          <p className="s mut">Jawab pakai angkamu sendiri</p>
        </div>
        {messages.length > 0 && !loading && (
          <button className="btn ghost sm" type="button" onClick={newChat}>
            <RotateCcw size={16} aria-hidden="true" />
            Obrolan baru
          </button>
        )}
      </div>

      {messages.length === 0 && (
        <div className="bubble-ai">
          <p className="t">
            {noRecords
              ? "Halo! Tanya apa saja soal uangmu. Sekarang aku jawab dari jawaban onboarding-mu; begitu kamu mulai mencatat, jawabanku pakai angka aslimu."
              : "Halo! Tanya apa saja soal uangmu. Aku jawab pakai angka dari catatanmu sendiri, dan bisa cek harga barang di internet."}
          </p>
        </div>
      )}

      <div className="col" style={{ gap: 12 }} role="log" aria-live="polite" aria-label="Percakapan dengan AI Coach">
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
              {i === messages.length - 1 && noRecords && (
                <button className="chip" type="button" onClick={() => openAddTx()}>
                  <Plus size={16} aria-hidden="true" />
                  Catat transaksi pertama
                </button>
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
      </div>
      <div className="col" style={{ gap: 12 }} aria-busy={loading}>
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

      {unanswered && (
        <div className="bubble-ai col" style={{ gap: 8 }} role="status">
          <p className="s">Jawabannya terputus sebelum selesai.</p>
          <button
            className="chip"
            type="button"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              const q = takeUnanswered();
              if (q) send(q);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Tanya lagi
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="wrap" role="group" aria-label="Contoh pertanyaan">
          {(noRecords ? FIRST_SUGGESTIONS : SUGGESTIONS).map((s) => (
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
        <input className="inp" type="text" enterKeyHint="send" aria-label="Tulis pertanyaan" placeholder="Tanya soal uangmu…" value={input} maxLength={2000} onChange={(e) => setInput(e.target.value)} />
        {loading ? (
          // Separate elements (keys): if React reused the node, the tap that stops
          // the answer would also submit the restored question again.
          <button
            key="stop"
            className="ibtn coach-send stop"
            type="button"
            aria-label="Berhenti menjawab"
            onClick={(e) => {
              e.preventDefault();
              cancel();
            }}
          >
            <Square size={18} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            key="send"
            className="ibtn coach-send"
            type="submit"
            aria-label="Kirim"
            disabled={limited || !input.trim()}
          >
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        )}
      </form>
      <div ref={endRef} />
    </main>
  );
}
