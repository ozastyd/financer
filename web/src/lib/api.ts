import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { firstError } from "./schemas";

/** Parses a JSON body with a Zod schema, or returns a 400 response. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) return NextResponse.json({ error: firstError(r.error) }, { status: 400 });
  return r.data;
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
