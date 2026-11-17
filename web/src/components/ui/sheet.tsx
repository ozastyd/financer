"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** When true, closing (scrim tap, Esc, close button, drag down) first asks before throwing the input away. */
  dirty?: boolean;
  /** Second line of the discard question, e.g. what was being filled in. */
  discardText?: string;
}

/** Pulled further than this, or flicked down faster, the sheet closes. */
const CLOSE_DISTANCE = 110;
const CLOSE_SPEED = 0.6; // px per ms

/**
 * Bottom sheet with focus trapping, Escape to close, a labelled close button,
 * and drag-to-dismiss from its top (handle and title row), which stays pinned
 * while the content scrolls, so it can always be grabbed.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  dirty = false,
  discardText = "Isian yang belum disimpan akan hilang.",
}: SheetProps) {
  const [confirm, setConfirm] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    startY: number;
    dy: number;
    lastY: number;
    lastT: number;
    speed: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open starts without the question
    setConfirm(false);
  }, [open]);

  const requestClose = () => {
    if (dirty && !confirm) return setConfirm(true);
    onOpenChange(false);
  };

  const setOffset = (dy: number, animate: boolean) => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!sheet) return;
    const ease = "0.32s cubic-bezier(0.32, 0.72, 0, 1)";
    sheet.style.transition = animate ? `translate ${ease}` : "none";
    sheet.style.translate = dy ? `0 ${dy}px` : "";
    if (scrim) {
      scrim.style.transition = animate ? `opacity ${ease}` : "none";
      scrim.style.opacity = dy
        ? String(Math.max(0.35, 1 - dy / (sheet.offsetHeight || 600)))
        : "";
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest("button, a, input, textarea, select, .discard")
    )
      return;
    e.preventDefault(); // no text selection while dragging with a mouse
    const now = performance.now();
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      dy: 0,
      lastY: e.clientY,
      lastT: now,
      speed: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    // Dragging up past the start stretches a little instead of moving freely.
    const raw = e.clientY - d.startY;
    d.dy = raw > 0 ? raw : -Math.sqrt(-raw) * 2;
    d.speed = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY;
    d.lastT = now;
    setOffset(d.dy, false);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.dy > CLOSE_DISTANCE || (d.dy > 24 && d.speed > CLOSE_SPEED)) {
      requestClose();
      // If the sheet stays (unsaved input, or the parent keeps it open), slide back.
      window.setTimeout(() => {
        if (sheetRef.current?.dataset.state === "open") setOffset(0, true);
      }, 40);
      return;
    }
    setOffset(0, true);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) return onOpenChange(true);
        requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" ref={scrimRef} />
        <Dialog.Content
          className="sheet"
          ref={sheetRef}
          aria-describedby={undefined}
        >
          <div
            className="sheet-head"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div className="grab" aria-hidden="true" />
            <div className="row">
              <div className="col sp" style={{ gap: 0 }}>
                <Dialog.Title className="h2">{title}</Dialog.Title>
                {subtitle && <div className="s mut">{subtitle}</div>}
              </div>
              <Dialog.Close className="ibtn" aria-label="Tutup">
                <X size={20} aria-hidden="true" />
              </Dialog.Close>
            </div>
            {confirm && (
              <div
                className="discard"
                role="alertdialog"
                aria-labelledby="sheet-discard-title"
              >
                <p id="sheet-discard-title" className="t b">
                  Buang isian ini?
                </p>
                <p className="s mut">{discardText}</p>
                <div className="g2">
                  <button
                    type="button"
                    className="btn ghost sm"
                    autoFocus
                    onClick={() => setConfirm(false)}
                  >
                    Lanjut isi
                  </button>
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Buang
                  </button>
                </div>
              </div>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
