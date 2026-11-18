"use client";

import { nativeApp } from "./native";

/**
 * An iPhone in a browser (Safari or the home-screen web app), not the Android
 * app. Back Tap exists only on iPhone, so iPads are excluded. Call after mount.
 */
export function isIPhone(): boolean {
  if (typeof navigator === "undefined" || nativeApp()) return false;
  return /iPhone/.test(navigator.userAgent);
}

/** The "Catat ke Financer" shortcut's iCloud link, once the shortcut has been made and shared. */
export const IOS_SHORTCUT_URL = process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL ?? "";

/** Devices connected through the iPhone shortcut carry this label. */
export const IPHONE_LABEL = "iPhone";

/** "baru saja", "12 menit lalu", "kemarin 14:05" — for when a device was last used. */
export function lastUsedLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "belum pernah dipakai";
  const t = new Date(iso).getTime();
  const min = Math.round((now - t) / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  if (min < 24 * 60) return `${Math.round(min / 60)} jam lalu`;
  const d = new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  return d;
}

/** Opened from the Home Screen icon (full screen, no browser bars). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Where an iPhone user is browsing: Safari, another browser that can add to the
 * Home Screen (Chrome, Edge, Firefox on iOS 16.4+), or an app's built-in
 * browser (Instagram, WhatsApp, …) that can't.
 */
export function iosBrowser(): "safari" | "other" | "in-app" {
  const ua = navigator.userAgent;
  if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|WhatsApp|Twitter|TikTok|musical_ly|Snapchat|GSA\//i.test(ua)) return "in-app";
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return "other";
  return /Safari\//.test(ua) ? "safari" : "in-app";
}
