import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { completeQuickbooksOAuth, oauthStatesMatch } from "@/lib/integrations/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const settings = new URL("/settings/quickbooks", incoming.origin);
  try {
    const dispatcher = await getSignedInDispatcher();
    if (!dispatcher) {
      return NextResponse.redirect(new URL("/login", incoming.origin));
    }
    const denied = incoming.searchParams.get("error");
    if (denied) {
      settings.searchParams.set("error", denied === "access_denied" ? "QuickBooks connect was cancelled." : denied);
      return NextResponse.redirect(settings);
    }
    const jar = await cookies();
    const expected = jar.get("tms_qbo_oauth_state")?.value;
    const actual = incoming.searchParams.get("state") ?? "";
    jar.delete("tms_qbo_oauth_state");
    if (!oauthStatesMatch(expected, actual)) {
      settings.searchParams.set("error", "QuickBooks connect state did not match. Try Connect again.");
      return NextResponse.redirect(settings);
    }
    const code = incoming.searchParams.get("code") ?? "";
    const realmId = incoming.searchParams.get("realmId") ?? incoming.searchParams.get("realm_id") ?? "";
    if (!code || !realmId) {
      settings.searchParams.set("error", "QuickBooks did not return an authorization code and company id.");
      return NextResponse.redirect(settings);
    }
    await completeQuickbooksOAuth({ code, realmId });
    settings.searchParams.set("connected", "1");
    return NextResponse.redirect(settings);
  } catch (error) {
    settings.searchParams.set(
      "error",
      error instanceof Error ? error.message : "QuickBooks connect failed.",
    );
    return NextResponse.redirect(settings);
  }
}
