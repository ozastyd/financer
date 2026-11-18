import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, bad, parseBody } from "@/lib/api";
import { deleteDevice, setDeviceRecording } from "@/lib/db";
import { requireUser } from "@/lib/server";

/** Turns the "rekam notifikasi" test mode on or off for a phone. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/devices/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Perangkat tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, z.object({ recording: z.boolean() }));
  if (input instanceof NextResponse) return input;
  if (!setDeviceRecording(auth.uid, id, input.recording)) return bad("Perangkat tidak ditemukan.", 404);
  return NextResponse.json({ ok: true });
}

/** Disconnects a phone: its token stops working immediately. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/devices/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Perangkat tidak ditemukan.", 404);
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  deleteDevice(auth.uid, id);
  return NextResponse.json({ ok: true });
}
