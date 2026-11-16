import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** The signed-in account for this browser, if any. */
export async function GET(req: NextRequest) {
  const uid = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = uid ? getUser(uid) : undefined;
  return NextResponse.json(user ? { signedIn: true, user: { id: user.id, email: user.email } } : { signedIn: false });
}
