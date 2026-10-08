import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { decideRedactionAccess } from "@/lib/rate-con-redact-access";
import { readRateConRedactionPage } from "@/lib/rate-con-redact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  const driver = dispatcher ? null : await getSignedInDriver();
  const { id: rawId, page: rawPage } = await params;
  const access = decideRedactionAccess({
    redactionId: Number.parseInt(rawId, 10),
    office: Boolean(dispatcher),
    driverId: driver?.id ?? null,
  });
  if (!access.ok) {
    return new Response("Not found", { status: access.status === 403 ? 404 : access.status });
  }
  const page = Number.parseInt(rawPage, 10);
  const buffer = readRateConRedactionPage(access.row, page);
  if (!buffer) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
