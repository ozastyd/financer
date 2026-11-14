import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { goalUpdate } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, goalUpdate);
  if (input instanceof NextResponse) return input;
  const { supabase } = auth;

  const { data: goal, error: readErr } = await supabase.from("financial_goals").select("status,current_amount").eq("id", id).maybeSingle();
  if (readErr) return dbError(readErr);
  if (!goal) return bad("Tujuan tidak ditemukan.", 404);
  if (input.status && goal.status === "completed") return bad("Tujuan yang sudah tercapai tidak bisa dijeda.");

  const patch: Record<string, unknown> = { ...input };
  if (input.status === "paused") patch.paused_at = new Date().toISOString();
  if (input.status === "active") patch.paused_at = null;
  if (input.target_amount !== undefined) {
    const current = Number(goal.current_amount);
    if (current >= input.target_amount && goal.status !== "completed") {
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
    } else if (current < input.target_amount && goal.status === "completed") {
      patch.status = "active";
      patch.completed_at = null;
    }
  }

  const { error } = await supabase.from("financial_goals").update(patch).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase.from("financial_goals").delete().eq("id", id).select("id");
  if (error) return dbError(error, "Gagal menghapus. Coba lagi.");
  if (!data?.length) return bad("Tujuan tidak ditemukan.", 404);
  return NextResponse.json({ ok: true });
}
