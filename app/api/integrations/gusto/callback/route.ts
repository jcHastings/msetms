import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSignedInDispatcher, unauthorizedResponse, viewOnlyWriteResponse } from "@/lib/dispatcher-session";
import { browserUrl } from "@/lib/http-origin";
import { finishGustoOAuth, GustoStateError } from "@/lib/integrations/gusto";
import { canConnectGusto, canWrite } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const settings = browserUrl("/settings/gusto", request);
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return NextResponse.redirect(browserUrl("/login", request));
  if (!canWrite(dispatcher.role)) return viewOnlyWriteResponse();
  if (!canConnectGusto(dispatcher.role)) return unauthorizedResponse();

  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("tms_gusto_oauth_state")?.value;
  jar.delete("tms_gusto_oauth_state");
  try {
    await finishGustoOAuth({
      expectedState: expected,
      actualState: url.searchParams.get("state") ?? "",
      code: url.searchParams.get("code") ?? "",
    });
  } catch (error) {
    const message =
      error instanceof GustoStateError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Gusto connect failed.";
    settings.searchParams.set("error", message);
    return NextResponse.redirect(settings);
  }
  settings.searchParams.set("connected", "1");
  return NextResponse.redirect(settings);
}
