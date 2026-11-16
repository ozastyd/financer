import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { listInterests, setInterest } from "@/lib/db";
import { UPCOMING } from "@/lib/upcoming";
import { requireUser } from "@/lib/server";

/** Features this user asked to hear about. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ features: listInterests(auth.uid) });
}

const schema = z.object({ feature: z.enum(UPCOMING.map((u) => u.key) as [string, ...string[]]), on: z.boolean() });

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, schema);
  if (input instanceof NextResponse) return input;
  setInterest(auth.uid, input.feature, input.on);
  return NextResponse.json({ features: listInterests(auth.uid) });
}
