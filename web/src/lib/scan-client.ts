"use client";

import { AppError, MESSAGES, errorFromFetchFailure, isOffline } from "./errors";
import type { TransactionInput } from "./schemas";

// The file picked from the "+" menu waits here while the app moves to /scan.
let pending: File | null = null;

export function setPendingScan(file: File) {
  pending = file;
}

export function takePendingScan(): File | null {
  const f = pending;
  pending = null;
  return f;
}

export interface ScanItem {
  name: string;
  qty: number | null;
  /** Negative for discount lines. */
  amount: number;
  category_id: string;
}

/** An already-recorded transaction a scanned row seems to repeat. */
export interface ScanMatch {
  description: string | null;
  category: string;
}

export interface ScanTx {
  date: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id: string;
  /** Same date, type and amount already recorded. */
  duplicate: boolean;
  match: ScanMatch | null;
  /** Money moved between the user's own pockets, not spending. */
  transfer: "topup" | "atm" | "own" | null;
}

export interface ScanResult {
  kind: "receipt" | "statement" | "other";
  source: "image" | "pdf";
  merchant: string | null;
  date: string | null;
  dateClear: boolean;
  total: number | null;
  category_id: string | null;
  items: ScanItem[];
  transactions: ScanTx[];
  receiptMatch: ScanMatch | null;
  partial?: { read: number; of: number };
}

// ---------------------------------------------------------------------------
// The review in progress survives a refresh or a trip to another app: it is
// kept in this tab's sessionStorage until it is saved or discarded.
// ---------------------------------------------------------------------------

const SESSION_KEY = "financer:scan-session";

export interface ScanSession<Edits> {
  fileName: string;
  isPdf: boolean;
  /** Small JPEG data URL of the photo, to check the result against. */
  preview: string | null;
  result: ScanResult;
  edits: Edits;
}

export function saveScanSession<E>(s: ScanSession<E>) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: the review still works, it just won't survive a reload
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, preview: null }));
    } catch {
      /* give up quietly */
    }
  }
}

export function loadScanSession<E>(): ScanSession<E> | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ScanSession<E>) : null;
  } catch {
    return null;
  }
}

export function clearScanSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing stored */
  }
}

/** A small preview of an image file (longest side `max` px) as a JPEG data URL, or null for PDFs/unsupported images. */
export async function makePreview(file: File, max = 900): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/** Where Transaksi should open after a save, with the new rows highlighted. */
const JUMP_KEY = "financer:transaksi-jump";

export function setTransaksiJump(month: string, ids: string[]) {
  try {
    window.sessionStorage.setItem(JUMP_KEY, JSON.stringify({ month, ids }));
  } catch {
    /* optional */
  }
}

export function takeTransaksiJump(): { month: string; ids: string[] } | null {
  try {
    const raw = window.sessionStorage.getItem(JUMP_KEY);
    window.sessionStorage.removeItem(JUMP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export class ScanFailure extends Error {
  constructor(
    public code: "busy" | "unreadable" | "password" | "too_big" | "failed" | "session" | "offline" | "limit",
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export async function scanFile(file: File, password: string | undefined, signal: AbortSignal): Promise<ScanResult> {
  if (isOffline()) throw new ScanFailure("offline", MESSAGES.offline);
  const form = new FormData();
  form.set("file", file);
  if (password) form.set("password", password);
  let res: Response;
  try {
    res = await fetch("/api/scan", { method: "POST", body: form, signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ScanFailure("failed", errorFromFetchFailure().message);
  }
  const json = (await res.json().catch(() => ({}))) as Partial<ScanResult> & { error?: string; code?: ScanFailure["code"] };
  if (res.ok) return json as ScanResult;
  const retry = Number(res.headers.get("retry-after") ?? "") || undefined;
  if (res.status === 401) throw new ScanFailure("session", MESSAGES.session);
  if (res.status === 429 && json.code !== "busy") throw new ScanFailure("limit", json.error ?? "Terlalu sering. Coba lagi nanti.", retry);
  throw new ScanFailure(json.code ?? (res.status === 413 ? "too_big" : "failed"), json.error ?? "Gagal membaca file. Coba lagi.", retry);
}

async function batch<T>(method: "POST" | "DELETE", body: unknown, fallback: string): Promise<T> {
  if (isOffline()) throw new AppError("offline", MESSAGES.offline);
  let res: Response;
  try {
    res = await fetch("/api/transactions/batch", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw errorFromFetchFailure();
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new AppError("session", MESSAGES.session);
  if (!res.ok) throw new AppError("rejected", json.error ?? fallback);
  return json;
}

/** Saves the reviewed rows in one go; returns the new transaction ids (for undo). */
export async function saveScanned(items: TransactionInput[]): Promise<string[]> {
  const r = await batch<{ ids?: string[] }>("POST", { items }, "Gagal menyimpan. Coba lagi.");
  return r.ids ?? [];
}

/** Undo of saveScanned. */
export async function undoScanned(ids: string[]): Promise<number> {
  const r = await batch<{ removed?: number }>("DELETE", { ids }, "Gagal membatalkan. Coba lagi.");
  return r.removed ?? 0;
}
