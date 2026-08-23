import { NextResponse } from "next/server";
import {
  authenticateDispatcher,
  createDispatcherSession,
  setDispatcherSessionCookie,
} from "@/lib/dispatch-auth";
import { safeNextPath } from "@/lib/dispatch-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const user = authenticateDispatcher(username, password);
  if (!user) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url), {
      status: 303,
    });
  }
  const token = createDispatcherSession(user.id);
  await setDispatcherSessionCookie(token);
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}
