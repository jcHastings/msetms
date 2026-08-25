import { getSignedInDispatcher, unauthorizedResponse } from "./dispatcher-session";
import { canExportCsv } from "./settings-shared";

export async function dispatcherCsvResponse(
  filename: string,
  csv: string,
  allowed: (role: string) => boolean = canExportCsv,
): Promise<Response> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !allowed(dispatcher.role)) {
    return unauthorizedResponse();
  }
  const safeName = filename.replaceAll('"', "");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function dispatcherBinaryResponse(
  filename: string,
  body: Uint8Array,
  contentType: string,
  allowed: (role: string) => boolean = canExportCsv,
): Promise<Response> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !allowed(dispatcher.role)) {
    return unauthorizedResponse();
  }
  const safeName = filename.replaceAll('"', "");
  const bytes = Buffer.from(body);
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
