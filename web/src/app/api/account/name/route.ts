import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { upsertProfile } from "@/lib/db";
import { requireUser } from "@/lib/server";

const schema = z.object({ display_name: z.string().trim().min(1, "Nama wajib diisi").max(60, "Maksimal 60 karakter") });

/** Changes the name shown in the app. */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;
  upsertProfile("user_profiles", auth.uid, { display_name: input.display_name });
  return NextResponse.json({ ok: true });
}
