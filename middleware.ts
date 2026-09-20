import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DISPATCHER_PENDING_COOKIE,
  DISPATCHER_SESSION_COOKIE,
  parseDispatcherSessionValue,
} from "./lib/dispatcher-session-token";

export function middleware(request: NextRequest): NextResponse {
  const rawSessionCookie = request.cookies.get(DISPATCHER_SESSION_COOKIE)?.value;
  if (parseDispatcherSessionValue(rawSessionCookie)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", requestedPath || "/");
  const response = NextResponse.redirect(loginUrl);
  if (rawSessionCookie) {
    response.cookies.delete(DISPATCHER_SESSION_COOKIE);
    response.cookies.delete(DISPATCHER_PENDING_COOKIE);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login(?:/.*)?|driver(?:/.*)?|t(?:/.*)?|l(?:/.*)?).*)"],
};
