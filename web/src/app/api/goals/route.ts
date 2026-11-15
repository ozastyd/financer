import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { insert, newId } from "@/lib/db";
import { goalInput } from "@/lib/schemas";
import { dbError } from "@/lib/server";

export async function POST(req: Request) {
  const input = await parseBody(req, goalInput);
  if (input instanceof NextResponse) return input;
  const id = newId();
  try {
    insert("financial_goals", { id, ...input });
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ id }, { status: 201 });
}
