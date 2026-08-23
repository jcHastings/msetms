import { readFile } from "node:fs/promises";
import { getSignedInDispatcher } from "@/lib/dispatch-auth";
import { getFleetDocument, getFleetDocumentPath } from "@/lib/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return new Response("Sign in to dispatch.", { status: 401 });

  const doc = getFleetDocument(Number.parseInt((await params).id, 10));
  if (!doc) return new Response("Not found", { status: 404 });
  const buffer = await readFile(getFleetDocumentPath(doc));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.original_name.replaceAll('"', "")}"`,
    },
  });
}
