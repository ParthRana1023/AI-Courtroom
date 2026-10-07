import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages that need a signed-in user.
const PROTECTED = ["/cases", "/profile"];

export function proxy(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Signed out on a protected page: sign in, then come back here.
  if (!token && isProtected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in: skip the sign-in pages.
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/cases", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cases/:path*", "/profile/:path*", "/login", "/register"],
};
