import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { acceptPending, dismissPending, getCategory, getPending } from "@/lib/db";
import { categoryError } from "@/lib/rules";
import { amountSchema, txTypeSchema } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/server";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    category_id: z.string().min(1).max(64),
    type: txTypeSchema.optional(),
    amount: amountSchema.optional(),
    description: z.string().trim().max(120).nullable().optional(),
  }),
  z.object({ action: z.literal("dismiss") }),
]);

/** Save an inbox item as a transaction (optionally corrected), or dismiss it. */
export async function POST(req: Request, ctx: RouteContext<"/api/inbox/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;
  const item = getPending(auth.uid, id);
  if (!item) return bad("Sudah dicek atau tidak ditemukan.", 404);
  if (input.action === "dismiss") {
    dismissPending(auth.uid, id);
    return NextResponse.json({ ok: true });
  }
  const type = input.type ?? item.type;
  const catErr = categoryError(getCategory(auth.uid, input.category_id), type);
  if (catErr) return bad(catErr);
  try {
    const transactionId = acceptPending(auth.uid, id, {
      type,
      category_id: input.category_id,
      amount: input.amount ?? Number(item.amount),
      description: input.description === undefined ? item.description : input.description || null,
      transaction_date: item.occurred_date,
      transaction_time: item.occurred_time,
    });
    return NextResponse.json({ ok: true, transaction_id: transactionId });
  } catch (e) {
    return dbError(e);
  }
}
