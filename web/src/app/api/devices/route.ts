import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { createDevice, listDevices } from "@/lib/db";
import { makeLimiter, requireUser } from "@/lib/server";

const perUser = makeLimiter(10, 60 * 60 * 1000);

/** Phones connected for automatic recording. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(listDevices(auth.uid).map(({ id, label, recording, created_at, last_seen_at }) => ({ id, label, recording: Boolean(recording), created_at, last_seen_at })));
}

/**
 * Connects this phone: returns a device token once (the app keeps it to send
 * notifications in the background). Only its hash is stored.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const wait = perUser.blocked(auth.uid);
  if (wait) return NextResponse.json({ error: "Terlalu banyak percobaan." }, { status: 429, headers: { "retry-after": String(wait) } });
  const input = await parseBody(req, z.object({ label: z.string().trim().max(60).optional() }));
  if (input instanceof NextResponse) return input;
  perUser.hit(auth.uid);
  const token = randomBytes(32).toString("base64url");
  const id = createDevice(auth.uid, createHash("sha256").update(token).digest("hex"), input.label || null);
  return NextResponse.json({ id, token }, { status: 201 });
}
