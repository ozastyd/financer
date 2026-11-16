import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { dbErrorMessage, getUser } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export interface Authed {
  uid: string;
  email: string;
}

/**
 * The signed-in user for this request, or a ready-made 401. The proxy already
 * rejects requests without a valid cookie; this also checks the account still
 * exists and gives route handlers the id every query is scoped to.
 */
export async function requireUser(): Promise<Authed | NextResponse> {
  const uid = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const user = uid ? getUser(uid) : undefined;
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  return { uid: user.id, email: user.email };
}

/** Turns a failed database write into the app's usual error response. */
export function dbError(e: unknown, fallback?: string): NextResponse {
  const { message, status } = dbErrorMessage(e);
  return NextResponse.json({ error: status === 500 && fallback ? fallback : message }, { status });
}

/** The client's address as Cloudflare reports it (used for rate limits). */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Sliding-window counter kept in memory (resets on restart). */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Seconds until key may try again, or 0 when under the limit. */
    blocked(key: string): number {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      hits.set(key, recent);
      return recent.length >= max ? Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) : 0;
    },
    hit(key: string) {
      const now = Date.now();
      hits.set(key, [...(hits.get(key) ?? []).filter((t) => now - t < windowMs), now]);
    },
    clear(key: string) {
      hits.delete(key);
    },
  };
}
