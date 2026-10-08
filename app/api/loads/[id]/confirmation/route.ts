import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { driverFromCookieOrBearer } from "@/lib/driver-api";
import { buildConfirmationForLoad, renderConfirmationPdf } from "@/lib/load-confirmation";
import { pdfResponseHeaders } from "@/lib/pdf-response";
import { getLoad } from "@/lib/queries";
import { driverAssignedToLoad } from "@/lib/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  const driver = dispatcher ? null : await driverFromCookieOrBearer(request);
  if (!dispatcher && !driver) {
    return unauthorizedResponse();
  }
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) return new Response("Not found", { status: 404 });
  if (driver && !driverAssignedToLoad(load.id, driver.id, load.driver_id)) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const wantInternal = url.searchParams.get("packet") === "internal";
  const packet = dispatcher && !wantInternal ? "customer" : "internal";
  const queryDriverId = Number.parseInt(url.searchParams.get("driver") ?? "", 10);
  // Drivers always get their own packet. ?driver= is an office relay picker only.
  const driverId = driver ? driver.id : Number.isFinite(queryDriverId) ? queryDriverId : undefined;
  // Single-tenant local desk: leftover driver-app cookies must not 404 a
  // dispatcher download for a load they just created (often still unassigned).
  try {
    const model = buildConfirmationForLoad(load.id, {
      packet,
      driverId,
    });
    const pdf = await renderConfirmationPdf(model);
    const suffix = packet === "internal" ? "-driver-packet" : "-customer-confirmation";
    const filename = `${load.load_number}${suffix}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(filename),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This file is no longer on this computer.";
    return new Response(message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
