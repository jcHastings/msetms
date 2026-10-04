import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DISPATCHER_PENDING_COOKIE,
  DISPATCHER_SESSION_COOKIE,
} from "./lib/dispatcher-session-constants";
import { parseDispatcherSessionValueAtEdge } from "./lib/dispatcher-session-token-edge";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const rawSessionCookie = request.cookies.get(DISPATCHER_SESSION_COOKIE)?.value;
  if (await parseDispatcherSessionValueAtEdge(rawSessionCookie)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tms-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
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
  // Logo files stay public. A signed-out /login request must receive image bytes, not a redirect to HTML.
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico$|ms-express-logo(?:-on-dark|-transparent)?\\.png$|login(?:/.*)?$|driver(?:/.*)?$|t(?:/.*)?$|l(?:/.*)?$).*)",
  ],
};
