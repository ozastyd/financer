import { NextResponse, type NextRequest } from "next/server";
import { bad } from "@/lib/api";
import { isValidDate } from "@/lib/date";
import { dashboard } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const args = {
    p_start: q.get("p_start") ?? "",
    p_end: q.get("p_end") ?? "",
    p_prev_start: q.get("p_prev_start") ?? "",
    p_prev_end: q.get("p_prev_end") ?? "",
    p_bucket: q.get("p_bucket") === "month" ? ("month" as const) : ("day" as const),
    p_today: q.get("p_today") ?? "",
  };
  if (![args.p_start, args.p_end, args.p_prev_start, args.p_prev_end, args.p_today].every(isValidDate)) return bad("Tanggal tidak valid.");
  return NextResponse.json(dashboard(args));
}
