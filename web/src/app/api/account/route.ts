import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { deleteUser, getPasswordHash } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { makeLimiter, requireUser } from "@/lib/server";
import { SESSION_COOKIE } from "@/lib/session";

const perUser = makeLimiter(5, 15 * 60 * 1000);

const schema = z.object({
  password: z.string().min(1, "Masukkan kata sandimu").max(200),
  confirm: z.literal("HAPUS", { error: "Ketik HAPUS untuk konfirmasi" }),
});

/** Deletes the account and all of its data, then signs out. */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const wait = perUser.blocked(auth.uid);
  if (wait) return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;
  if (!(await verifyPassword(input.password, getPasswordHash(auth.uid)))) {
    perUser.hit(auth.uid);
    return bad("Kata sandi salah.");
  }
  deleteUser(auth.uid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
