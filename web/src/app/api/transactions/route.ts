import { NextResponse } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { categoryError } from "@/lib/rules";
import { transactionInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, transactionInput);
  if (input instanceof NextResponse) return input;
  const { supabase, user } = auth;

  const { data: category } = await supabase.from("categories").select("type").eq("id", input.category_id).maybeSingle();
  const err = categoryError(category ?? undefined, input.type);
  if (err) return bad(err);

  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...input, user_id: user.id })
    .select("id")
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
