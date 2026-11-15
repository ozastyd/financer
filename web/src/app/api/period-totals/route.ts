import { NextResponse, type NextRequest } from "next/server";
import { bad } from "@/lib/api";
import { isValidDate } from "@/lib/date";
import { periodTotals } from "@/lib/db";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isValidDate(from) || !isValidDate(to)) return bad("Tanggal tidak valid.");
  return NextResponse.json(periodTotals(from, to));
}
