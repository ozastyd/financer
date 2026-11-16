import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody } from "@/lib/api";
import { getCategory, insertOwned, newId, tx } from "@/lib/db";
import { categoryError } from "@/lib/rules";
import { transactionInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/server";

// Saves several transactions at once (from a scanned receipt split or a bank
// statement), all or nothing.
const body = z.object({ items: z.array(transactionInput).min(1, "Tidak ada transaksi untuk disimpan").max(300, "Maksimal 300 transaksi sekali simpan") });

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;

  for (const item of input.items) {
    const err = categoryError(getCategory(auth.uid, item.category_id), item.type);
    if (err) return bad(err);
  }
  try {
    tx(() => {
      for (const item of input.items) insertOwned("transactions", auth.uid, { id: newId(), ...item });
    });
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ saved: input.items.length }, { status: 201 });
}
