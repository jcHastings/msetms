import { authorizeCronRequest } from "@/lib/cron-auth";
import { feedRefreshToken, refreshIntegrationFeeds } from "@/lib/feed-refresh";
import { logSwallowedIntegrationError } from "@/lib/integration-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hostnameOf(request: Request): string {
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const auth = authorizeCronRequest({
    expectedToken: feedRefreshToken(),
    authorizationHeader: request.headers.get("authorization"),
    hostHeader: request.headers.get("host"),
    requestHostname: hostnameOf(request),
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
    cfConnectingIp: request.headers.get("cf-connecting-ip"),
  });
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const summary = await refreshIntegrationFeeds();
    return Response.json(summary, { status: summary.ok ? 200 : 502 });
  } catch (error) {
    logSwallowedIntegrationError("feed-refresh", error);
    return Response.json(
      { ok: false, saved: { orbcomm: 0, fleet: 0, routes: 0 }, errors: ["feed-refresh: error"] },
      { status: 500 },
    );
  }
}
