import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { canConnectQuickbooks } from "@/lib/settings-shared";
import { isQuickbooksOAuthReady } from "@/lib/env";
import { buildQuickbooksAuthorizeUrl, createQuickbooksOAuthState } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const settings = new URL("/settings/quickbooks", origin);
  try {
    const dispatcher = await getSignedInDispatcher();
    if (!dispatcher) {
      return NextResponse.redirect(new URL("/login", origin));
    }
    if (!canConnectQuickbooks(dispatcher.role)) {
      return unauthorizedResponse();
    }
    if (!isQuickbooksOAuthReady()) {
      settings.searchParams.set("error", "Set QBO_CLIENT_ID and QBO_CLIENT_SECRET in .env, then restart.");
      return NextResponse.redirect(settings);
    }
    const state = createQuickbooksOAuthState();
    const jar = await cookies();
    jar.set("tms_qbo_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(buildQuickbooksAuthorizeUrl(state));
  } catch (error) {
    settings.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Could not start QuickBooks connect.",
    );
    return NextResponse.redirect(settings);
  }
}
