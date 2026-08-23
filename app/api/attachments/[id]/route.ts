import { readFile } from "node:fs/promises";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { getAttachment, getAttachmentPath, sanitizeName } from "@/lib/files";

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
  const buffer = await readFile(getAttachmentPath(attachment));
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = sanitizeName(attachment.original_name);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
