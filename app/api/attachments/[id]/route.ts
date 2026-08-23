import { readFile } from "node:fs/promises";
import { getSignedInDispatcher } from "@/lib/dispatch-auth";
import { getSignedInDriver } from "@/lib/driver-session";
import { getAttachment, getAttachmentPath } from "@/lib/files";
import { getLoad } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const attachment = getAttachment(Number.parseInt((await params).id, 10));
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) {
    const driver = await getSignedInDriver();
    const load = getLoad(attachment.load_id);
    if (!driver || !load || load.driver_id !== driver.id) {
      return new Response("Sign in to dispatch.", { status: 401 });
    }
  }

  const buffer = await readFile(getAttachmentPath(attachment));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.original_name.replaceAll('"', "")}"`,
    },
  });
}
