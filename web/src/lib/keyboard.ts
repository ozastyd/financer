"use client";

import { useEffect } from "react";

const TEXT_INPUT = /^(text|search|email|tel|url|password|number|date|datetime-local|month|time|week)$/;

function editable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && TEXT_INPUT.test(el.type || "text") && el.inputMode !== "none";
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Marks <html class="kb-open"> while a phone's on-screen keyboard is showing:
 * a text field has focus and the visible area shrank. CSS then hides the
 * bottom tab bar instead of letting it ride up on top of the keyboard.
 */
export function useKeyboardClass() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const height = () => vv?.height ?? window.innerHeight;
    let full = height();
    let timer = 0;

    const update = () => {
      const h = height();
      const focused = editable(document.activeElement);
      // The tallest height seen without a keyboard is the "closed" size.
      if (!focused || h > full) full = Math.max(h, focused ? full : h);
      root.classList.toggle("kb-open", focused && full - h > 120);
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 60);
    };
    const rotate = () => {
      full = 0;
      window.setTimeout(() => {
        full = height();
        update();
      }, 300);
    };

    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", rotate);
    document.addEventListener("focusin", soon);
    document.addEventListener("focusout", soon);
    return () => {
      window.clearTimeout(timer);
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", rotate);
      document.removeEventListener("focusin", soon);
      document.removeEventListener("focusout", soon);
      root.classList.remove("kb-open");
    };
  }, []);
}
