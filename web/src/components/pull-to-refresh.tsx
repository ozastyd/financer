"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TRIGGER = 64; // px of (damped) pull that starts a refresh
const MAX = 110;

/**
 * Pull down from the top of the page to refresh. Only starts when the page is
 * scrolled to the top and the touch isn't inside a sheet or another scroller.
 * After a refresh, a "financer:refresh" event lets pages with their own data
 * (e.g. Perlu dicek) reload too.
 */
export function PullToRefresh({ onRefresh, enabled }: { onRefresh: () => Promise<void>; enabled: boolean }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const blocked = (t: EventTarget | null) =>
      t instanceof Element && Boolean(t.closest("[role=dialog], .sheet, input, textarea, [data-no-pull]"));

    const down = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return;
      start.current = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0);
        return;
      }
      // Resist as it goes, like a rubber band.
      set(Math.min(MAX, dy * 0.5));
      if (e.cancelable) e.preventDefault();
    };
    const up = async () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current < TRIGGER) return set(0);
      busyRef.current = true;
      setBusy(true);
      set(56);
      const minTime = new Promise((r) => setTimeout(r, 600));
      try {
        await Promise.all([onRefresh(), minTime]);
        window.dispatchEvent(new Event("financer:refresh"));
      } finally {
        busyRef.current = false;
        setBusy(false);
        set(0);
      }
    };

    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [enabled, onRefresh]);

  if (!enabled) return null;
  const ready = pull >= TRIGGER;
  return (
    <div
      className={`ptr${busy ? " busy" : ""}${pull ? " on" : ""}`}
      style={{ transform: `translate(-50%, ${pull - 48}px)` }}
      role="status"
      aria-live="polite"
      aria-label={busy ? "Memperbarui" : ready ? "Lepas untuk memperbarui" : undefined}
    >
      <RotateCw size={20} aria-hidden="true" style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / TRIGGER) }} />
    </div>
  );
}
