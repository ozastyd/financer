"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "fo-theme";

function apply(choice: ThemeChoice) {
  const el = document.documentElement;
  if (choice === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", choice);
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from storage after mount
      if (saved === "light" || saved === "dark") setChoice(saved);
    } catch {
      // storage unavailable: keep following the system theme
    }
  }, []);
  const update = (c: ThemeChoice) => {
    setChoice(c);
    apply(c);
    try {
      if (c === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, c);
    } catch {
      // ignore: theme still applies for this visit
    }
  };
  return [choice, update];
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The theme actually on screen: the user's pick, or the device's when they follow the system. */
export function useResolvedTheme(choice: ThemeChoice): "light" | "dark" {
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  return choice === "system" ? (systemDark ? "dark" : "light") : choice;
}
