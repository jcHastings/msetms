import { readFile } from "node:fs/promises";
import { getFleetDocument, getFleetDocumentPath } from "@/lib/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const doc = getFleetDocument(Number.parseInt((await params).id, 10));
  if (!doc) return new Response("Not found", { status: 404 });
  const buffer = await readFile(getFleetDocumentPath(doc));
  return new Response(buffer, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.original_name.replaceAll('"', "")}"`,
    },
  });
}
