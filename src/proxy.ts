import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { MIN_PASSCODE_LENGTH } from "@/lib/secrets/crypto";

// First gate for the whole app: no valid session cookie, no page. This only reads the
// signed cookie (no database); server actions re-check the session themselves.
// With no ADMIN_PASSCODE configured there is nothing to sign in with, so requests pass.
export function proxy(req: NextRequest) {
  const passcode = (process.env.ADMIN_PASSCODE ?? "").trim();
  if (passcode.length < MIN_PASSCODE_LENGTH) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const signedIn = verifySession(req.cookies.get(SESSION_COOKIE)?.value, passcode) !== null;

  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  // Programmatic callers get a status code, not a redirect to an HTML page.
  if (pathname.startsWith("/api/") || req.headers.has("next-action")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and image files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
