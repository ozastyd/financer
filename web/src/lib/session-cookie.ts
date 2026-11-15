import "server-only";

import type { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken } from "./session";

/** Signs this browser in for SESSION_DAYS. */
export async function setSessionCookie(res: NextResponse): Promise<NextResponse> {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
