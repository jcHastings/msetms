import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OFFICE_SESSION_COOKIE = "tms_dispatcher_id";

export function middleware(request: NextRequest): NextResponse {
  const hasDispatcherCookie = Boolean(request.cookies.get(OFFICE_SESSION_COOKIE)?.value);
  if (hasDispatcherCookie) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", requestedPath || "/");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login(?:/.*)?|driver(?:/.*)?|t(?:/.*)?|l(?:/.*)?).*)"],
};
