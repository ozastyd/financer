import { NextResponse } from "next/server";
import { suggestQuestions } from "@/lib/coach";
import { coachSuggestions, loadSummary } from "@/lib/coach-server";
import { requireUser } from "@/lib/server";

/** Three suggested questions for the AI Coach, based on the user's own figures. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  try {
    const summary = loadSummary(auth.uid);
    try {
      return NextResponse.json(await coachSuggestions(auth.uid, summary), { headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ questions: suggestQuestions(summary), source: "rules" }, { headers: { "cache-control": "no-store" } });
    }
  } catch {
    return NextResponse.json({ error: "Gagal membaca datamu." }, { status: 502 });
  }
}
