import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DISPATCHER_COOKIE,
  DRIVER_COOKIE,
  isDriverAppPath,
  isDriverSharedApi,
  isPublicPath,
} from "@/lib/dispatch-paths";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname) || isDriverAppPath(pathname)) {
    return NextResponse.next();
  }

  const hasDispatcher = Boolean(request.cookies.get(DISPATCHER_COOKIE)?.value);
  if (hasDispatcher) return NextResponse.next();

  if (isDriverSharedApi(pathname) && request.cookies.get(DRIVER_COOKIE)?.value) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Sign in to dispatch.", { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)"],
};
