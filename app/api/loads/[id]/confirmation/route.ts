import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { buildConfirmationForLoad, renderConfirmationPdf } from "@/lib/load-confirmation";
import { getLoad } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  const driver = dispatcher ? null : await getSignedInDriver();
  if (!dispatcher && !driver) {
    return unauthorizedResponse();
  }
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) return new Response("Not found", { status: 404 });

  const wantInternal = new URL(request.url).searchParams.get("packet") === "internal";
  const packet = dispatcher && !wantInternal ? "customer" : "internal";
  const driverId = Number.parseInt(new URL(request.url).searchParams.get("driver") ?? "", 10);
  // Single-tenant local desk: leftover driver-app cookies must not 404 a
  // dispatcher download for a load they just created (often still unassigned).
  try {
    const model = buildConfirmationForLoad(load.id, {
      packet,
      driverId: Number.isFinite(driverId) ? driverId : undefined,
    });
    const pdf = await renderConfirmationPdf(model);
    const suffix = packet === "internal" ? "-driver-packet" : "-customer-confirmation";
    const filename = `${load.load_number}${suffix}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This file is no longer on this computer.";
    return new Response(message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
