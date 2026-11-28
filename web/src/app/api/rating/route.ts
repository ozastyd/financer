import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { markRatingAsked, ratingStats, saveRating } from "@/lib/db";
import { RATING_REASONS, shouldAskForRating } from "@/lib/rating";
import { requireUser } from "@/lib/server";

/** Whether to show this user the "Seberapa Financer membantumu?" card now. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const stats = ratingStats(auth.uid);
  return NextResponse.json({ ask: !!stats && shouldAskForRating(stats) }, { headers: { "cache-control": "no-store" } });
}

const REASONS = [...RATING_REASONS.low, ...RATING_REASONS.high] as [string, ...string[]];
const body = z.union([
  z.object({ action: z.literal("asked") }),
  z.object({
    rating: z.number().int().min(1).max(5),
    reasons: z.array(z.enum(REASONS)).max(REASONS.length),
    note: z.string().trim().max(500),
  }),
]);

/** Records that the card was shown, or saves the answer. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  if ("action" in input) markRatingAsked(auth.uid);
  else saveRating(auth.uid, { rating: input.rating, reasons: [...new Set(input.reasons)], note: input.note });
  return NextResponse.json({ ok: true });
}
