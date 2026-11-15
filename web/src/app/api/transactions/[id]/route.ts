import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { db, getCategory, update } from "@/lib/db";
import { categoryError } from "@/lib/rules";
import { transactionUpdate } from "@/lib/schemas";
import { dbError } from "@/lib/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  const input = await parseBody(req, transactionUpdate);
  if (input instanceof NextResponse) return input;

  const current = db().prepare("select type, category_id from transactions where id = ?").get(id) as
    | { type: string; category_id: string }
    | undefined;
  if (!current) return bad("Transaksi tidak ditemukan.", 404);

  const type = input.type ?? current.type;
  const categoryId = input.category_id ?? current.category_id;
  const err = categoryError(getCategory(categoryId), type as "income" | "expense");
  if (err) return bad(err);

  try {
    update("transactions", id, input);
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  try {
    const r = db().prepare("delete from transactions where id = ?").run(id);
    if (!r.changes) return bad("Transaksi tidak ditemukan.", 404);
  } catch (e) {
    return dbError(e, "Gagal menghapus. Coba lagi.");
  }
  return NextResponse.json({ ok: true });
}
