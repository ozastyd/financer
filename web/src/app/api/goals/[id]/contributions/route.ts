import { NextResponse } from "next/server";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { contributionError } from "@/lib/rules";
import { contributionInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/contributions">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tujuan tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, contributionInput);
  if (input instanceof NextResponse) return input;
  const { supabase, user } = auth;

  const { data: goal, error: readErr } = await supabase.from("financial_goals").select("status,current_amount").eq("id", id).maybeSingle();
  if (readErr) return dbError(readErr);
  if (!goal) return bad("Tujuan tidak ditemukan.", 404);
  const err = contributionError({ status: goal.status, current_amount: Number(goal.current_amount) }, input);
  if (err) return bad(err);

  // The database trigger updates financial_goals.current_amount and rejects
  // a withdrawal that would make the balance negative.
  const { error } = await supabase.from("goal_contributions").insert({ ...input, goal_id: id, user_id: user.id });
  if (error) return error.code === "23514" ? bad("Jumlah melebihi saldo tujuan.") : dbError(error);
  return NextResponse.json({ ok: true }, { status: 201 });
}
