import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { addPending, addSample, deviceByTokenHash, touchDevice } from "@/lib/db";
import { fingerprintSource, occurredAt } from "@/lib/notifications/ingest";
import { parseNotification, sourceOf } from "@/lib/notifications/parse";
import { makeLimiter } from "@/lib/server";

// Called by the Android app in the background with its device token (no
// cookie). The app only forwards notifications from allow-listed bank and
// e-wallet apps; anything else is refused here too and never stored.

const perDevice = makeLimiter(600, 60 * 60 * 1000);

const item = z.object({
  packageName: z.string().min(1).max(120),
  title: z.string().max(300).default(""),
  text: z.string().max(2000).default(""),
  postedAt: z.string().max(40).optional(),
});
const body = z.object({ notifications: z.array(item).min(1).max(50) });

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const device = token.length >= 20 ? deviceByTokenHash(createHash("sha256").update(token).digest("hex")) : undefined;
  if (!device) return NextResponse.json({ error: "Perangkat tidak terhubung." }, { status: 401 });
  const wait = perDevice.blocked(device.id);
  if (wait) return NextResponse.json({ error: "Terlalu banyak." }, { status: 429, headers: { "retry-after": String(wait) } });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
  perDevice.hit(device.id);
  touchDevice(device.id);

  let added = 0;
  let read = 0;
  for (const n of parsed.data.notifications) {
    if (!sourceOf(n.packageName)) continue;
    const p = parseNotification(n);
    if (device.recording) addSample(device.user_id, { package_name: n.packageName, title: n.title || null, text: n.text || null, parsed: Boolean(p), posted_at: n.postedAt ?? null });
    if (!p) continue;
    read++;
    const at = occurredAt(n.postedAt);
    const isNew = addPending(device.user_id, {
      source: p.source,
      type: p.type,
      amount: p.amount,
      description: p.description.slice(0, 120),
      counterparty: p.counterparty?.slice(0, 80) ?? null,
      category_hint: p.categoryHint?.slice(0, 60) ?? null,
      maybe_transfer: p.maybeTransfer ? 1 : 0,
      occurred_date: at.date,
      occurred_time: at.time,
      raw_title: n.title.slice(0, 300) || null,
      raw_text: n.text.slice(0, 2000) || null,
      fingerprint: createHash("sha256").update(fingerprintSource(n)).digest("hex"),
    });
    if (isNew) added++;
  }
  return NextResponse.json({ received: parsed.data.notifications.length, read, added });
}
