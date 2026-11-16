import "server-only";

import type { NextResponse } from "next/server";
import { getPasswordHash } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, passwordStamp } from "./session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

/** A fresh session token for userId, stamped with their current password. */
export async function sessionTokenFor(userId: string): Promise<string> {
  return createSessionToken(userId, await passwordStamp(getPasswordHash(userId) ?? ""));
}

/** Signs this browser in as userId for SESSION_DAYS. */
export async function setSessionCookie(res: NextResponse, userId: string): Promise<NextResponse> {
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(userId), COOKIE_OPTIONS);
  return res;
}
