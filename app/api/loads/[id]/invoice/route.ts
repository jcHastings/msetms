import { readFile } from "node:fs/promises";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { getAttachmentPath, listAttachments } from "@/lib/files";
import { createTmsInvoice } from "@/lib/invoice";
import { pdfResponseHeaders } from "@/lib/pdf-response";
import { getLoad } from "@/lib/queries";
import { canEditLoads } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invoicePdfResponse(buffer: Buffer, filename: string, attachmentId: number) {
  return new Response(new Uint8Array(buffer), {
    headers: pdfResponseHeaders(filename, {
      "X-Attachment-Id": String(attachmentId),
      "Access-Control-Expose-Headers": "Content-Disposition, X-Attachment-Id",
    }),
  });
}

async function requireInvoiceEditor() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  if (!canEditLoads(dispatcher.role)) {
    return new Response("Creating invoices is for dispatch and accounting.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireInvoiceEditor();
  if (denied) return denied;
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) {
    return new Response("Load not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const existing = listAttachments(loadId).find((file) => file.kind === "invoice");
  if (!existing) {
    return new Response("No TMS invoice PDF yet. Create or Rebuild invoice first.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  try {
    const buffer = await readFile(getAttachmentPath(existing));
    return invoicePdfResponse(buffer, existing.original_name, existing.id);
  } catch {
    return new Response("This invoice PDF is no longer on this computer. Create or Rebuild invoice to make a new copy.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireInvoiceEditor();
  if (denied) return denied;
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load) {
    return new Response("Load not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  try {
    const result = await createTmsInvoice(loadId);
    return invoicePdfResponse(result.buffer, result.filename, result.attachmentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create invoice.";
    return new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
