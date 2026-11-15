// One vocabulary for everything that can go wrong, so each screen can pick the
// right surface (see docs/architecture/error-catalogue.md).

export type ErrorKind =
  | "offline" // A3: the device has no connection
  | "network" // C5: the request failed in transit
  | "session" // B1: the session expired (401)
  | "rejected" // C2/C3: the server refused the data (400/404)
  | "limit" // B3/E2: rate or plan limit (429)
  | "server"; // A2/C5: 5xx

export class AppError extends Error {
  readonly kind: ErrorKind;
  /** Seconds until the action may be tried again, when known. */
  readonly retryAfter: number | null;

  constructor(kind: ErrorKind, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

export const MESSAGES = {
  offline: "Kamu sedang offline. Perubahan belum bisa disimpan.",
  network: "Gagal menyimpan. Periksa koneksimu lalu coba lagi.",
  session: "Sesi kamu berakhir. Masuk lagi untuk menyimpan.",
  server: "Server sedang bermasalah. Coba lagi sebentar lagi.",
  load: "Gagal memuat data. Periksa koneksimu, lalu coba lagi.",
} as const;

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Turns an HTTP status and server message into an AppError. */
export function errorFromResponse(status: number, serverMessage: string | undefined, retryAfterHeader?: string | null): AppError {
  const retry = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
  if (status === 401) return new AppError("session", MESSAGES.session);
  if (status === 429) return new AppError("limit", serverMessage ?? "Terlalu sering. Coba lagi sebentar lagi.", retry);
  if (status >= 500) return new AppError("server", serverMessage && status !== 500 ? serverMessage : MESSAGES.server);
  return new AppError("rejected", serverMessage ?? "Data belum bisa disimpan. Periksa isianmu.");
}

/** Error thrown when fetch itself fails (no response at all). */
export function errorFromFetchFailure(): AppError {
  return isOffline() ? new AppError("offline", MESSAGES.offline) : new AppError("network", MESSAGES.network);
}

/** Any thrown value as an AppError, keeping server-written messages. */
export function toAppError(e: unknown, fallback: string = MESSAGES.network): AppError {
  if (e instanceof AppError) return e;
  if (isOffline()) return new AppError("offline", MESSAGES.offline);
  if (e instanceof Error && e.message) return new AppError("rejected", e.message);
  return new AppError("network", fallback);
}


/** "0:45" style countdown label. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Short code shown on the crash page so support can find the log line. */
export function referenceCode(digest?: string): string {
  const src = digest && digest.length >= 4 ? digest : Math.random().toString(36).slice(2);
  return `ERR-${src.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}`;
}
