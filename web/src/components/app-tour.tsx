"use client";

import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clearTour } from "@/lib/tour";

interface Step {
  id: string;
  /** What to light up; none for the opening and closing cards. */
  target?: string;
  title: string;
  body: string;
  /** Interactive step: the user taps the real control, the tour waits until it is closed again. */
  tap?: string;
  round?: boolean;
}

const steps = (name: string): Step[] => [
  {
    id: "welcome",
    title: name ? `Hai ${name}, selamat datang!` : "Selamat datang!",
    body: "Tur singkat, kurang dari satu menit: di mana melihat sisa uangmu, cara mencatat, dan tempat bertanya.",
  },
  {
    id: "sisa",
    target: '[data-tour="sisa"]',
    title: "Sisa uangmu",
    body: "Pemasukan dikurangi pengeluaran. Sebelum ada catatan, ini perkiraan dari jawabanmu tadi. Begitu kamu mencatat, angka aslinya muncul di sini.",
  },
  {
    id: "plus",
    target: '[data-tour="plus"]',
    title: "Catat lewat tombol +",
    body: "Uang masuk atau keluar: isi nominal dan kategorinya. Punya struk? Bisa difoto.",
    tap: "Coba ketuk + sekarang",
    round: true,
  },
  {
    id: "tabs",
    target: '[data-tour="tabs"]',
    title: "Menu di bawah",
    body: "Transaksi berisi semua catatanmu. Tujuan untuk menabung demi yang kamu incar. Profil untuk tampilan, catat otomatis, dan datamu.",
  },
  {
    id: "coach",
    target: '[data-tour="coach"]',
    title: "Tanya Coach",
    body: "Bingung soal uang? Tanya saja. Jawabannya pakai angka dari catatanmu sendiri.",
    tap: "Coba ketuk Tanya Coach",
    round: true,
  },
  {
    id: "done",
    title: "Siap dipakai",
    body: "Mulai dari satu catatan hari ini. Tur ini bisa diulang kapan saja dari Profil.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const GUIDED = 4; // steps between the opening and closing cards

function measure(sel: string): Rect | null {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  // Hidden (display: none) parts have no size; fixed ones (tab bar, Coach button) have no offsetParent, so size is the test.
  if (!r.width || !r.height) return null;
  // A tall part (Beranda's summary with data) is lit from its top only, so the card still fits.
  const h = Math.min(r.height, window.innerHeight * 0.42);
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: h + PAD * 2 };
}

const sheetOpen = () => Boolean(document.querySelector(".sheet[data-state=open]"));

/**
 * The quick tour over Beranda: dims the screen, lights up one part at a time
 * with a short card next to it, and lets the user try the + button and
 * Tanya Coach for real (the tour waits while their sheet is open).
 */
export function AppTour({ name, onDone, onRecord }: { name: string; onDone: () => void; onRecord: () => void }) {
  const list = steps(name);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [away, setAway] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const step = list[i];

  const finish = useCallback(() => {
    clearTour();
    onDone();
  }, [onDone]);
  const next = useCallback(() => setI((n) => Math.min(n + 1, list.length - 1)), [list.length]);

  // Find and follow the lit-up part (it may need scrolling into view first).
  useEffect(() => {
    if (!step.target || away) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no part to light up on this step
      setRect(null);
      return;
    }
    const sel = step.target;
    let tries = 0;
    let frame = 0;
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement && step.id === "sisa") el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    const update = () => {
      const r = measure(sel);
      if (r) setRect(r);
      else if (++tries > 30) next(); // not on screen (e.g. offline): skip this part
    };
    const tick = () => {
      update();
      frame = window.setTimeout(tick, tries && !measure(sel) ? 100 : 400);
    };
    tick();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [step.id, step.target, away, next]);

  // Interactive steps: a tap on the real control hides the tour until its sheet closes.
  useEffect(() => {
    if (!step.tap || !step.target || away) return;
    const sel = step.target;
    const onTap = (e: MouseEvent) => {
      const el = document.querySelector(sel);
      if (el && e.target instanceof Node && el.contains(e.target)) setAway(true);
    };
    document.addEventListener("click", onTap, true);
    return () => document.removeEventListener("click", onTap, true);
  }, [step.tap, step.target, away]);
  useEffect(() => {
    if (!away) return;
    let seen = false;
    const started = Date.now();
    const t = window.setInterval(() => {
      if (sheetOpen()) seen = true;
      else if (seen || Date.now() - started > 1500) {
        window.clearInterval(t);
        setAway(false);
        next();
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [away, next]);

  // Keyboard: focus moves to each new card; Escape ends the tour.
  const shown = !step.target || rect !== null;
  useEffect(() => {
    if (away) return;
    // The card takes focus (read out by screen readers) without lighting a ring on the button.
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sheetOpen()) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, away, finish, shown]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i, rect, away]);

  if (away) return null;
  const waiting = Boolean(step.target && !rect);
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // The card sits on the roomier side of the lit-up part.
  const below = rect ? rect.top + rect.height / 2 < vh / 2 : false;
  const cardTop = rect ? (below ? Math.min(rect.top + rect.height + 14, vh - cardH - 16) : Math.max(16, rect.top - cardH - 14)) : undefined;
  const guided = i > 0 && i < list.length - 1;
  const last = i === list.length - 1;

  return (
    <div className="tour" data-no-pull>
      {/* Dims everything except the lit-up part; taps outside the card do nothing. */}
      {rect ? (
        <>
          <div className="tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: step.round ? 999 : 22 }} aria-hidden="true">
            {step.tap && <span className="tour-pulse" style={{ borderRadius: step.round ? 999 : 22 }} />}
          </div>
          <div className="tour-block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <div className="tour-block" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-block" style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <div className="tour-block" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
          {/* Look-only steps: the lit-up part can't be used yet. */}
          {!step.tap && <div className="tour-block" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
        </>
      ) : (
        <div className="tour-block tour-dim" style={{ inset: 0 }} />
      )}

      {!waiting && (
        <div
          ref={cardRef}
          className={`tour-card${rect ? "" : " center"}`}
          style={rect ? { top: cardTop } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          tabIndex={-1}
          key={step.id}
        >
          {guided && (
            <p className="tour-count s b" aria-label={`Langkah ${i} dari ${GUIDED}`}>
              <span aria-hidden="true">
                {i}/{GUIDED}
              </span>
              <span className="tour-dots" aria-hidden="true">
                {Array.from({ length: GUIDED }, (_, n) => (
                  <i key={n} className={n < i ? "on" : ""} />
                ))}
              </span>
            </p>
          )}
          {!rect && (
            <span className="tour-mark" aria-hidden="true">
              <Sparkles size={22} />
            </span>
          )}
          <h2 id="tour-title" className="h3">
            {step.title}
          </h2>
          <p id="tour-body" className="s pretty">
            {step.body}
          </p>
          {step.tap && (
            <p className="tour-tap s b" role="status">
              {step.tap}
            </p>
          )}
          <div className="tour-actions">
            {!last && (
              <button type="button" className="lnk tour-skip" onClick={finish}>
                {i === 0 ? "Lewati" : "Lewati tur"}
              </button>
            )}
            {i === 0 && (
              <button type="button" className="btn sm" onClick={next}>
                Mulai tur
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
            {guided && (
              <button type="button" className={step.tap ? "btn ghost sm" : "btn sm"} onClick={next}>
                {step.tap ? "Nanti saja" : "Lanjut"}
                {!step.tap && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            )}
            {last && (
              <>
                <button type="button" className="btn ghost sm" onClick={finish}>
                  Selesai
                </button>
                <button
                 
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    finish();
                    onRecord();
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Catat transaksi
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
