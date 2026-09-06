import { findBackhaulForLoad } from "@/lib/backhaul";
import { BACKHAUL_SEARCH_FAILED } from "@/lib/backhaul-shared";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) {
    return Response.json(
      { ok: false, reason: "unauthorized", error: "Sign in as a dispatcher to continue." },
      { status: 401 },
    );
  }
  const loadId = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(loadId) || loadId <= 0) {
    return Response.json({ ok: false, reason: "not_found", error: "Load not found." }, { status: 404 });
  }
  try {
    const result = await findBackhaulForLoad(loadId);
    const status = result.ok ? 200 : result.reason === "not_found" ? 404 : 200;
    return Response.json(result, { status });
  } catch {
    return Response.json(
      { ok: false, reason: "error", error: BACKHAUL_SEARCH_FAILED },
      { status: 500 },
    );
  }
}
