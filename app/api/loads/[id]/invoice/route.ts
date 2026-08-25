import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { canEditLoads } from "@/lib/settings-shared";
import { createTmsInvoice } from "@/lib/invoice";
import { getLoad } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  if (!canEditLoads(dispatcher.role)) {
    return Response.json({ error: "Creating invoices is for dispatch and accounting." }, { status: 403 });
  }
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) return Response.json({ error: "Load not found." }, { status: 404 });
  try {
    const result = await createTmsInvoice(loadId);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Attachment-Id": String(result.attachmentId),
        "Access-Control-Expose-Headers": "Content-Disposition, X-Attachment-Id",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create invoice.";
    return Response.json({ error: message }, { status: 400 });
  }
}
