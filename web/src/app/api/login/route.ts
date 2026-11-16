import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { signInSchema } from "@/lib/credentials";
import { findUserByEmail } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, makeLimiter } from "@/lib/server";
import { authConfigured } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

// Slows down password guessing: 5 failed tries per account per address, and
// 20 per address overall, within 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const perAccount = makeLimiter(5, WINDOW_MS);
const perAddress = makeLimiter(20, WINDOW_MS);

export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "Layanan sedang bermasalah. Coba lagi sebentar lagi." }, { status: 503 });
  const input = await parseBody(req, signInSchema);
  if (input instanceof NextResponse) return input;

  const ip = clientIp(req);
  const accountKey = `${ip}|${input.email}`;
  const wait = Math.max(perAccount.blocked(accountKey), perAddress.blocked(ip));
  if (wait) return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });

  const user = findUserByEmail(input.email);
  // Same message (and same work) whether the email or the password is wrong.
  if (!(await verifyPassword(input.password, user?.password_hash)) || !user) {
    perAccount.hit(accountKey);
    perAddress.hit(ip);
    return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 400 });
  }

  perAccount.clear(accountKey);
  return setSessionCookie(NextResponse.json({ ok: true }), user.id);
}
