import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { emailSchema } from "@/lib/credentials";
import { createPasswordReset, findUserByEmail } from "@/lib/db";
import { mailConfigured, resetMail, sendMail } from "@/lib/mail";
import { clientIp, makeLimiter } from "@/lib/server";

const RESET_MINUTES = 30;
// At most 3 emails per address per hour, and 10 requests per network per hour.
const perEmail = makeLimiter(3, 60 * 60 * 1000);
const perAddress = makeLimiter(10, 60 * 60 * 1000);

/** Public origin for links in emails: APP_URL, else the host the request came in on. */
function origin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "financer.my.id";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// The answer is the same whether or not the email has an account, so the
// form can't be used to find out who uses Financer.
const SENT = { ok: true };

export async function POST(req: Request) {
  if (!mailConfigured()) return NextResponse.json({ error: "Atur ulang lewat email belum tersedia." }, { status: 503 });
  const input = await parseBody(req, z.object({ email: emailSchema }));
  if (input instanceof NextResponse) return input;

  const ip = clientIp(req);
  const wait = Math.max(perEmail.blocked(input.email), perAddress.blocked(ip));
  if (wait) return NextResponse.json({ error: "Terlalu banyak permintaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  perEmail.hit(input.email);
  perAddress.hit(ip);

  const user = findUserByEmail(input.email);
  if (!user) return NextResponse.json(SENT);

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  createPasswordReset(user.id, hash, new Date(Date.now() + RESET_MINUTES * 60_000).toISOString());
  try {
    await sendMail(resetMail(user.email, `${origin(req)}/atur-sandi?token=${token}`, RESET_MINUTES));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Email gagal dikirim. Coba lagi sebentar lagi." }, { status: 502 });
  }
  return NextResponse.json(SENT);
}
