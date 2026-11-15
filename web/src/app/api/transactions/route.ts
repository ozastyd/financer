import { NextResponse, type NextRequest } from "next/server";
import { bad, parseBody } from "@/lib/api";
import { isValidDate } from "@/lib/date";
import { getCategory, insert, newId, transactionsPage } from "@/lib/db";
import { categoryError } from "@/lib/rules";
import { transactionInput } from "@/lib/schemas";
import { dbError } from "@/lib/server";

/** One page of the transaction list, newest first. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!isValidDate(from) || !isValidDate(to)) return bad("Tanggal tidak valid.");
  const type = q.get("type");
  const rows = transactionsPage({
    from,
    to,
    type: type === "income" || type === "expense" ? type : null,
    query: q.get("query"),
    cursorDate: q.get("cursor_date"),
    cursorCreated: q.get("cursor_created"),
    cursorId: q.get("cursor_id"),
    limit: Number(q.get("limit") ?? 30),
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const input = await parseBody(req, transactionInput);
  if (input instanceof NextResponse) return input;

  const err = categoryError(getCategory(input.category_id), input.type);
  if (err) return bad(err);

  const id = newId();
  try {
    insert("transactions", { id, ...input });
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ id }, { status: 201 });
}
