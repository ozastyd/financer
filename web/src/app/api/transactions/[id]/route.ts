import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { deleteOwned, getCategory, getTransaction, updateOwned } from "@/lib/db";
import { categoryError } from "@/lib/rules";
import { transactionUpdate } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, transactionUpdate);
  if (input instanceof NextResponse) return input;

  const current = getTransaction(auth.uid, id);
  if (!current) return bad("Transaksi tidak ditemukan.", 404);

  const type = input.type ?? current.type;
  const categoryId = input.category_id ?? current.category_id;
  const err = categoryError(getCategory(auth.uid, categoryId), type as "income" | "expense");
  if (err) return bad(err);

  try {
    updateOwned("transactions", auth.uid, id, input);
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  try {
    if (!deleteOwned("transactions", auth.uid, id)) return bad("Transaksi tidak ditemukan.", 404);
  } catch (e) {
    return dbError(e, "Gagal menghapus. Coba lagi.");
  }
  return NextResponse.json({ ok: true });
}
