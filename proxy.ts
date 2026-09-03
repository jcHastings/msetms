import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DISPATCHER_SESSION_COOKIE, PUBLIC_PAGE_HEADER, isPublicPath } from "@/lib/rsc-router-state";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(DISPATCHER_SESSION_COOKIE)?.value);

  if (pathname === "/" && !signedIn) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  if (!isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.set(PUBLIC_PAGE_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/", "/login", "/login/:path*", "/driver", "/driver/:path*"],
};
