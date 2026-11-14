import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { categoryError } from "@/lib/rules";
import { transactionUpdate } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, transactionUpdate);
  if (input instanceof NextResponse) return input;
  const { supabase } = auth;

  const { data: current, error: readErr } = await supabase.from("transactions").select("type,category_id").eq("id", id).maybeSingle();
  if (readErr) return dbError(readErr);
  if (!current) return bad("Transaksi tidak ditemukan.", 404);

  const type = input.type ?? current.type;
  const categoryId = input.category_id ?? current.category_id;
  const { data: category } = await supabase.from("categories").select("type").eq("id", categoryId).maybeSingle();
  const err = categoryError(category ?? undefined, type);
  if (err) return bad(err);

  const { error } = await supabase.from("transactions").update(input).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Transaksi tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) return dbError(error, "Gagal menghapus. Coba lagi.");
  if (!data?.length) return bad("Transaksi tidak ditemukan.", 404);
  return NextResponse.json({ ok: true });
}
