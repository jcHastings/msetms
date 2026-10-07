import { readFile } from "node:fs/promises";
import { getCompanyDocument, getCompanyDocumentPath } from "@/lib/company-docs";
import { getSignedInDispatcher, unauthorizedResponse } from "@/lib/dispatcher-session";
import { sanitizeName } from "@/lib/files";
import { canViewFleet } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Office read of any company doc version (current or history). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canViewFleet(dispatcher.role)) return unauthorizedResponse();
  const doc = getCompanyDocument(Number.parseInt((await params).id, 10));
  if (!doc) return new Response("Not found", { status: 404 });
  try {
    const buffer = await readFile(getCompanyDocumentPath(doc));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${sanitizeName(doc.original_name)}"`,
      },
    });
  } catch {
    return new Response("This file is no longer on this computer.", { status: 404 });
  }
}
