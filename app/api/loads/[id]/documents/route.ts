import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { canEditLoads } from "@/lib/settings-shared";
import {
  generateDefaultedDocument,
  generateMissingDefaultedDocuments,
  listDefaultedDocuments,
} from "@/lib/load-documents";
import type { DefaultedDocKey } from "@/lib/load-documents-shared";
import { getLoad } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = new Set<DefaultedDocKey>([
  "bol",
  "bol_signatures",
  "bol_blind",
  "bol_third_party",
  "carrier_confirmation",
  "carrier_confirmation_blind",
  "customer_confirmation",
  "draft_invoice",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  const loadId = Number.parseInt((await params).id, 10);
  if (!getLoad(loadId)) return new Response("Not found", { status: 404 });
  return Response.json({ documents: listDefaultedDocuments(loadId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return unauthorizedResponse();
  if (!canEditLoads(dispatcher.role)) {
    return new Response("Generating documents is for dispatch and accounting.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const loadId = Number.parseInt((await params).id, 10);
  if (!getLoad(loadId)) return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    key?: string;
    stopId?: number | null;
    all?: boolean;
  } | null;
  try {
    if (body?.all) {
      const documents = await generateMissingDefaultedDocuments(loadId);
      return Response.json({ documents });
    }
    const key = body?.key as DefaultedDocKey | undefined;
    if (!key || !KEYS.has(key)) {
      return new Response("Unknown document.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const attachment = await generateDefaultedDocument(loadId, key, body?.stopId ?? null);
    return Response.json({
      attachmentId: attachment.id,
      filename: attachment.original_name,
      documents: listDefaultedDocuments(loadId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate that document.";
    return new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
