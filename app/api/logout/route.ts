import { NextResponse } from "next/server";
import { clearDispatcherSessionCookie } from "@/lib/dispatch-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await clearDispatcherSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
