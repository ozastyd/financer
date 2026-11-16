import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { MIN_PASSWORD } from "@/lib/credentials";
import { getPasswordHash, setPasswordHash } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { makeLimiter, requireUser } from "@/lib/server";

const perUser = makeLimiter(5, 15 * 60 * 1000);

const schema = z.object({
  current: z.string().min(1, "Masukkan kata sandi sekarang").max(200),
  next: z.string().min(MIN_PASSWORD, `Kata sandi baru minimal ${MIN_PASSWORD} karakter`).max(200, "Kata sandi terlalu panjang"),
});

/** Changes the password after checking the current one. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const wait = perUser.blocked(auth.uid);
  if (wait) return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;
  if (!(await verifyPassword(input.current, getPasswordHash(auth.uid)))) {
    perUser.hit(auth.uid);
    return bad("Kata sandi sekarang salah.");
  }
  setPasswordHash(auth.uid, await hashPassword(input.next));
  perUser.clear(auth.uid);
  return NextResponse.json({ ok: true });
}
