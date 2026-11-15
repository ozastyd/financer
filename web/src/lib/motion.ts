"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Small motion helpers. The CSS in globals.css does most of the work; these
// cover what CSS cannot: counting numbers, exit animations for things React
// unmounts, and reading the reduced-motion preference from script.

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when the visitor asked the system for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

export function easeOutExpo(p: number): number {
  return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

/**
 * Animates a number toward `target`: from 0 on first show, then from the
 * current value whenever the target changes. Lands exactly on the target.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const from = currentRef.current;
    if (from === target) return;
    const instant = prefersReducedMotion();
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = instant ? 1 : Math.min(1, (now - start) / duration);
      const v = from + (target - from) * easeOutExpo(p);
      currentRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * Keeps something mounted for `exitMs` after `open` turns false so it can play
 * an exit animation. `closing` is true during that window.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);

  // Mount immediately on open (adjusting state during render, not in an effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : exitMs);
    return () => window.clearTimeout(t);
  }, [open, mounted, exitMs]);

  return { mounted: mounted || open, closing: !open && mounted };
}
