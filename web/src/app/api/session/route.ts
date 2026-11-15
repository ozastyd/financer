import { NextResponse, type NextRequest } from "next/server";
import { passwordIsSet } from "@/lib/password";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Whether this browser is signed in, and whether a password still has to be created. */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    signedIn: await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value),
    needsSetup: !passwordIsSet(),
  });
}
