import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Each person has their own account (email + password) created on /masuk.
// Everything except the welcome page, sign-up/sign-in and their API needs a
// valid session cookie; route handlers then scope every query to that user.
const PUBLIC_PATHS = new Set([
  "/masuk",
  "/onboarding",
  "/lupa-sandi",
  "/atur-sandi",
  "/privasi",
  "/hapus-akun",
  "/api/session",
  "/api/login",
  "/api/signup",
  "/api/logout",
  "/api/password/status",
  "/api/password/forgot",
  "/api/password/reset",
]);

// Pages of the signed-in app. Any other unknown address shows the 404 page,
// even to signed-out visitors, instead of a sign-in form.
const APP_PREFIXES = ["/beranda", "/transaksi", "/tujuan", "/coach", "/profil", "/scan"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));

  const go = (path: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    return NextResponse.redirect(url);
  };

  // The welcome page (/) and sign-in are for signed-out visitors; signed-in
  // users skip straight to the app.
  if (pathname === "/" || PUBLIC_PATHS.has(pathname)) {
    return signedIn && (pathname === "/" || pathname === "/masuk") ? go("/beranda") : NextResponse.next();
  }
  if (!signedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
    }
    // Someone opening an app page without a session most likely has an account: show sign-in.
    if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return go("/masuk", "?mode=masuk");
  }
  return NextResponse.next();
}

// Brand assets, icons, the web manifest and link-preview images stay public:
// the sign-in page, browsers and chat apps load them without a session.
export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|opengraph-image|twitter-image).*)"],
};
