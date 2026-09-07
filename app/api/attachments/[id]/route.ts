import { readFile } from "node:fs/promises";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { getAttachment, getAttachmentPath, sanitizeName } from "@/lib/files";
import { isCustomerRateDocument } from "@/lib/load-documents-shared";
import { isMissingFileError, regenerateMissingAttachment } from "@/lib/regenerate-attachment";

function fileResponse(buffer: Buffer, filename: string, mimeType: string, download: boolean): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${sanitizeName(filename)}"`,
      "Content-Encoding": "identity",
      "Cache-Control": "private, no-transform",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const dispatcher = await getSignedInDispatcher();
  const driver = dispatcher ? null : await getSignedInDriver();
  if (!dispatcher && !driver) {
    return unauthorizedResponse();
  }
  const attachment = getAttachment(Number.parseInt((await params).id, 10));
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }
  if (driver && isCustomerRateDocument(attachment)) {
    return new Response("Not found", { status: 404 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    const buffer = await readFile(getAttachmentPath(attachment));
    return fileResponse(buffer, attachment.original_name, attachment.mime_type, download);
  } catch (error) {
    if (!isMissingFileError(error)) {
      return new Response("This file is no longer on this computer.", { status: 404 });
    }
    const regenerated = await regenerateMissingAttachment(attachment);
    if (regenerated) {
      return fileResponse(regenerated.buffer, regenerated.filename, regenerated.mimeType, download);
    }
    return new Response("This file is no longer on this computer.", { status: 404 });
  }
}
