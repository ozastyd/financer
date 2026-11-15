import "server-only";

import { NextResponse } from "next/server";
import { dbErrorMessage } from "./db";

/** Single owner: access is already gated by the password check in src/proxy.ts. */
export const OWNER = { id: "owner", email: "" };

/** Runs a database write and turns a failure into the app's usual error response. */
export function dbError(e: unknown, fallback?: string): NextResponse {
  const { message, status } = dbErrorMessage(e);
  return NextResponse.json({ error: status === 500 && fallback ? fallback : message }, { status });
}
