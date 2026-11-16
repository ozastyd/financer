import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { MIN_PASSWORD } from "@/lib/credentials";
import { completePasswordReset, findPasswordReset } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { clientIp, makeLimiter } from "@/lib/server";
import { setSessionCookie } from "@/lib/session-cookie";

const perAddress = makeLimiter(20, 15 * 60 * 1000);

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(MIN_PASSWORD, `Kata sandi minimal ${MIN_PASSWORD} karakter`).max(200, "Kata sandi terlalu panjang"),
});

/** Sets a new password from an emailed link, then signs the user in. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const wait = perAddress.blocked(ip);
  if (wait) return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;

  const uid = findPasswordReset(createHash("sha256").update(input.token).digest("hex"));
  if (!uid) {
    perAddress.hit(ip);
    return NextResponse.json({ error: "Tautan ini sudah kedaluwarsa atau sudah dipakai. Minta tautan baru." }, { status: 400 });
  }
  completePasswordReset(uid, await hashPassword(input.password));
  return setSessionCookie(NextResponse.json({ ok: true }), uid);
}
