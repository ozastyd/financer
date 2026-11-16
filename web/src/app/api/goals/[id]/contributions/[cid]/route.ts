import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { deleteContribution, getContribution, updateContribution } from "@/lib/db";
import { contributionUpdate } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/server";

const NEGATIVE = "Saldo tujuan jadi minus. Ubah atau hapus penarikannya dulu.";

/** Corrects a deposit or withdrawal (amount, date, note). Money spent is removed and recorded again instead. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/goals/[id]/contributions/[cid]">) {
  const { id, cid } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(cid)) return bad("Catatan tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, contributionUpdate);
  if (input instanceof NextResponse) return input;

  const row = getContribution(auth.uid, id, cid);
  if (!row) return bad("Catatan tidak ditemukan.", 404);
  if (row.kind === "spend") return bad("Pemakaian uang tidak bisa diubah. Hapus lalu catat ulang.");
  try {
    updateContribution(auth.uid, cid, input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return /CHECK constraint/i.test(msg) ? bad(NEGATIVE) : dbError(e);
  }
  return NextResponse.json({ ok: true });
}

/** Removes a deposit, withdrawal or spend (and the expense a spend was recorded as). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/goals/[id]/contributions/[cid]">) {
  const { id, cid } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(cid)) return bad("Catatan tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  if (!getContribution(auth.uid, id, cid)) return bad("Catatan tidak ditemukan.", 404);
  try {
    deleteContribution(auth.uid, cid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return /CHECK constraint/i.test(msg) ? bad(NEGATIVE) : dbError(e, "Gagal menghapus. Coba lagi.");
  }
  return NextResponse.json({ ok: true });
}
