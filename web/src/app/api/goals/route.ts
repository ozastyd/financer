import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { goalInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, goalInput);
  if (input instanceof NextResponse) return input;
  const { data, error } = await auth.supabase
    .from("financial_goals")
    .insert({ ...input, user_id: auth.user.id })
    .select("id")
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
