import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { decideRedactionAccess } from "@/lib/rate-con-redact-access";
import { readRateConRedactionPdf } from "@/lib/rate-con-redact-store";
import { sanitizeName } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfResponse(buffer: Buffer, download: boolean): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${sanitizeName("rate-confirmation.pdf")}"`,
      "Content-Encoding": "identity",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const dispatcher = await getSignedInDispatcher();
  const driver = dispatcher ? null : await getSignedInDriver();
  const id = Number.parseInt((await params).id, 10);
  const access = decideRedactionAccess({
    redactionId: id,
    office: Boolean(dispatcher),
    driverId: driver?.id ?? null,
  });
  if (!access.ok) {
    return new Response(access.status === 403 ? "Forbidden" : "Not found", { status: access.status });
  }
  const buffer = readRateConRedactionPdf(access.row);
  if (!buffer) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return pdfResponse(buffer, download);
}
