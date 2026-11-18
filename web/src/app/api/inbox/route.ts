import { NextResponse } from "next/server";
import { findSimilarTransaction, listCategories, listPending } from "@/lib/db";
import { suggestCategory } from "@/lib/notifications/ingest";
import { requireUser } from "@/lib/server";

/** Transactions read from notifications, waiting to be confirmed. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const categories = listCategories(auth.uid);
  return NextResponse.json(
    listPending(auth.uid).map((p) => {
      const similar = findSimilarTransaction(auth.uid, p.occurred_date, p.type, Number(p.amount));
      return {
        ...p,
        amount: Number(p.amount),
        maybe_transfer: Boolean(p.maybe_transfer),
        suggested_category_id: suggestCategory({ type: p.type, categoryHint: p.category_hint, description: p.description ?? "" }, categories),
        // Already recorded by hand or from a scan on the same day?
        similar: similar ? { description: similar.description, category: similar.category } : null,
      };
    }),
  );
}
