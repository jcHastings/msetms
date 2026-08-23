import { getSignedInDispatcher } from "@/lib/dispatch-auth";
import { getSignedInDriver } from "@/lib/driver-session";
import { buildConfirmationForLoad, renderConfirmationPdf } from "@/lib/load-confirmation";
import { getLoad } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) return new Response("Not found", { status: 404 });

  const dispatcher = await getSignedInDispatcher();
  const driver = await getSignedInDriver();
  const allowed = Boolean(dispatcher) || Boolean(driver && load.driver_id === driver.id);
  if (!allowed) return new Response("Sign in to dispatch.", { status: 401 });

  const model = buildConfirmationForLoad(load.id);
  const pdf = await renderConfirmationPdf(model);
  const filename = `${load.load_number}-load-confirmation.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
