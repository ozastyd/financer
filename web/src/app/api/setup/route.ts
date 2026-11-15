import { NextResponse } from "next/server";
import { MIN_PASSWORD_LENGTH, passwordIsSet, setInitialPassword } from "@/lib/password";
import { authConfigured } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

/** First visit: creates the app password and signs this browser in. Refused once a password exists. */
export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "Login belum dikonfigurasi di server." }, { status: 503 });
  if (passwordIsSet()) return NextResponse.json({ error: "Kata sandi sudah dibuat. Silakan masuk." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.` }, { status: 400 });
  }
  if (password.length > 200) return NextResponse.json({ error: "Kata sandi terlalu panjang." }, { status: 400 });

  if (!(await setInitialPassword(password))) {
    return NextResponse.json({ error: "Kata sandi sudah dibuat. Silakan masuk." }, { status: 409 });
  }
  return setSessionCookie(NextResponse.json({ ok: true }));
}
