import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSignedInDispatcher, unauthorizedResponse, viewOnlyWriteResponse } from "@/lib/dispatcher-session";
import { isGustoOAuthReady } from "@/lib/env";
import { browserUrl } from "@/lib/http-origin";
import { buildGustoAuthorizeUrl, createGustoOAuthState } from "@/lib/integrations/gusto";
import { canConnectGusto, canWrite } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const settings = browserUrl("/settings/gusto", request);
  try {
    const dispatcher = await getSignedInDispatcher();
    if (!dispatcher) return NextResponse.redirect(browserUrl("/login", request));
    if (!canWrite(dispatcher.role)) return viewOnlyWriteResponse();
    if (!canConnectGusto(dispatcher.role)) return unauthorizedResponse();
    if (!isGustoOAuthReady()) {
      settings.searchParams.set("error", "Add Gusto client id and secret in the office environment.");
      return NextResponse.redirect(settings);
    }
    const state = createGustoOAuthState();
    const jar = await cookies();
    jar.set("tms_gusto_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(buildGustoAuthorizeUrl(state));
  } catch (error) {
    settings.searchParams.set("error", error instanceof Error ? error.message : "Could not start Gusto connect.");
    return NextResponse.redirect(settings);
  }
}
