import { NextResponse, type NextRequest } from "next/server";
import { bad } from "@/lib/api";
import { isValidDate } from "@/lib/date";
import { periodTotals } from "@/lib/db";
import { requireUser } from "@/lib/server";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isValidDate(from) || !isValidDate(to)) return bad("Tanggal tidak valid.");
  return NextResponse.json(periodTotals(auth.uid, from, to));
}
