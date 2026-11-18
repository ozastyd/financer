import { NextResponse } from "next/server";
import { clearSamples, listSamples } from "@/lib/db";
import { requireUser } from "@/lib/server";

/** Raw texts recorded in "rekam notifikasi" mode (newest first). */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(listSamples(auth.uid).map((s) => ({ ...s, parsed: Boolean(s.parsed) })));
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  clearSamples(auth.uid);
  return NextResponse.json({ ok: true });
}
