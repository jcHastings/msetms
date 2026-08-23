import { getSignedInDispatcher } from "./dispatcher-session";

export async function dispatcherCsvResponse(filename: string, csv: string): Promise<Response> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) {
    return new Response("Sign in as a dispatcher to continue.", { status: 401 });
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
