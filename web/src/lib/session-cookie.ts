import "server-only";

import type { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken } from "./session";

/** Signs this browser in as userId for SESSION_DAYS. */
export async function setSessionCookie(res: NextResponse, userId: string): Promise<NextResponse> {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
