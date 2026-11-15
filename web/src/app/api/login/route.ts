import { NextResponse } from "next/server";
import { checkPassword, passwordIsSet } from "@/lib/password";
import { authConfigured } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

// Slows down password guessing: 5 failed tries per 15 minutes per client.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

function clientKey(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "Login belum dikonfigurasi di server." }, { status: 503 });
  if (!passwordIsSet()) return NextResponse.json({ error: "Kata sandi belum dibuat.", needsSetup: true }, { status: 409 });

  const key = clientKey(req);
  const now = Date.now();
  const recent = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILS) {
    const wait = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !(await checkPassword(password))) {
    recent.push(now);
    fails.set(key, recent);
    return NextResponse.json({ error: "Kata sandi salah." }, { status: 400 });
  }

  fails.delete(key);
  return setSessionCookie(NextResponse.json({ ok: true }));
}
