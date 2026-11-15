import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// One shared password, created on first visit and entered on /masuk.
// Everything except the sign-in page and its API needs a valid session cookie.
const PUBLIC_PATHS = new Set(["/masuk", "/api/session", "/api/login", "/api/setup", "/api/logout"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  const go = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (PUBLIC_PATHS.has(pathname)) {
    return signedIn && pathname === "/masuk" ? go("/beranda") : NextResponse.next();
  }
  if (!signedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
    }
    return go("/masuk");
  }
  if (pathname === "/") return go("/beranda");
  return NextResponse.next();
}

// Brand assets, icons, the web manifest and link-preview images stay public:
// the sign-in page, browsers and chat apps load them without a session.
export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|opengraph-image|twitter-image).*)"],
};
