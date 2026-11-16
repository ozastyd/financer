import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";
import { sessionUser } from "@/lib/server";

/** The signed-in account for this browser, if any (signed out after a password change elsewhere). */
export async function GET(req: NextRequest) {
  const user = await sessionUser(await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value));
  return NextResponse.json(user ? { signedIn: true, user: { id: user.id, email: user.email } } : { signedIn: false });
}
