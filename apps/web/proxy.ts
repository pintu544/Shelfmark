import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "thumbstack_session";
const AUTH_ROUTES = new Set(["/login", "/signup"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "authentication-required");
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_ROUTES.has(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)",
  ],
};
