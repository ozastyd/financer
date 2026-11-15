import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { getGoal, insert, listContributions, newId } from "@/lib/db";
import { contributionError } from "@/lib/rules";
import { contributionInput } from "@/lib/schemas";
import { dbError } from "@/lib/server";

/** A goal's deposit and withdrawal history, newest first (latest 200). */
export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/contributions">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  return NextResponse.json(listContributions(id));
}

export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/contributions">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  const input = await parseBody(req, contributionInput);
  if (input instanceof NextResponse) return input;

  const goal = getGoal(id);
  if (!goal) return bad("Tujuan tidak ditemukan.", 404);
  const err = contributionError({ status: goal.status, current_amount: Number(goal.current_amount) }, input);
  if (err) return bad(err);

  // The database trigger updates financial_goals.current_amount and rejects
  // a withdrawal that would make the balance negative.
  try {
    insert("goal_contributions", { id: newId(), goal_id: id, ...input });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return /CHECK constraint/i.test(msg) ? bad("Jumlah melebihi saldo tujuan.") : dbError(e);
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
