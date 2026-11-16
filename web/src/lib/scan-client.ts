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

export interface ScanTx {
  date: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id: string;
  /** Same date, type and amount already recorded. */
  duplicate: boolean;
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
  partial?: { read: number; of: number };
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

export async function saveScanned(items: TransactionInput[]): Promise<number> {
  if (isOffline()) throw new AppError("offline", MESSAGES.offline);
  let res: Response;
  try {
    res = await fetch("/api/transactions/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
  } catch {
    throw errorFromFetchFailure();
  }
  const json = (await res.json().catch(() => ({}))) as { saved?: number; error?: string };
  if (res.status === 401) throw new AppError("session", MESSAGES.session);
  if (!res.ok) throw new AppError("rejected", json.error ?? "Gagal menyimpan. Coba lagi.");
  return json.saved ?? items.length;
}
