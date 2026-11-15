"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Result-of-an-action notifications (catalogue surface "Toast").
// One toast at a time, the rest queue. Success and info hide by themselves;
// errors stay until dismissed or acted on. Toasts never take focus.

type Tone = "ok" | "info" | "err";

interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const ICON = { ok: CircleCheck, info: Info, err: CircleAlert };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const current = queue[0];

  const push = useCallback((tone: Tone, message: string, action?: ToastAction) => {
    setQueue((q) => {
      // the same message twice in a row is one toast
      if (q.length && q[q.length - 1].message === message) return q;
      return [...q, { id: nextId.current++, tone, message, action }];
    });
  }, []);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current || current.tone === "err") return;
    const t = window.setTimeout(dismiss, current.action ? 8000 : 4000);
    return () => window.clearTimeout(t);
  }, [current, dismiss]);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push("ok", m, a),
      info: (m, a) => push("info", m, a),
      error: (m, a) => push("err", m, a),
      dismiss,
    }),
    [push, dismiss],
  );

  const Icon = current ? ICON[current.tone] : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {current && Icon && (
          <div key={current.id} className={`toast ${current.tone}`} role={current.tone === "err" ? "alert" : "status"}>
            <Icon size={20} aria-hidden="true" />
            <span className="sp">{current.message}</span>
            {current.action && (
              <button
                type="button"
                className="act"
                onClick={() => {
                  dismiss();
                  current.action?.run();
                }}
              >
                {current.action.label}
              </button>
            )}
            {(current.tone === "err" || !current.action) && (
              <button type="button" className="x" aria-label="Tutup pesan" onClick={dismiss}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** Error shown inside a sheet or form, styled like the error toast so it reads the same. */
export function InlineError({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="toast err inline" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <span className="sp">{message}</span>
      {onRetry && (
        <button type="button" className="act" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}
