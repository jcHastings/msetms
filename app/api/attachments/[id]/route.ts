import { readFile } from "node:fs/promises";
import { getAttachment, getAttachmentPath } from "@/lib/files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const attachment = getAttachment(Number.parseInt((await params).id, 10));
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }
  const buffer = await readFile(getAttachmentPath(attachment));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.original_name.replaceAll('"', "")}"`,
    },
  });
}
