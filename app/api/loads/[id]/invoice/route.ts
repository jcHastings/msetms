import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { canEditLoads } from "@/lib/settings-shared";
import { createTmsInvoice } from "@/lib/invoice";
import { getLoad } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serveGeneratedInvoice(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  if (!canEditLoads(dispatcher.role)) {
    return new Response("Creating invoices is for dispatch and accounting.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) {
    return new Response("Load not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
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
    return new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return serveGeneratedInvoice(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return serveGeneratedInvoice(request, context);
}
