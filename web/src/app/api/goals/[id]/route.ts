import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { db, getGoal, update } from "@/lib/db";
import { goalUpdate } from "@/lib/schemas";
import { dbError } from "@/lib/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  const input = await parseBody(req, goalUpdate);
  if (input instanceof NextResponse) return input;

  const goal = getGoal(id);
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

  try {
    update("financial_goals", id, patch);
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  try {
    const r = db().prepare("delete from financial_goals where id = ?").run(id);
    if (!r.changes) return bad("Tujuan tidak ditemukan.", 404);
  } catch (e) {
    return dbError(e, "Gagal menghapus. Coba lagi.");
  }
  return NextResponse.json({ ok: true });
}
