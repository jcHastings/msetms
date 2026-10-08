import { driverApiError, requireDriverApiAuth } from "@/lib/driver-api";
import { decideRedactionAccess } from "@/lib/rate-con-redact-access";
import { readRateConRedactionPdf } from "@/lib/rate-con-redact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; redactionId: string }> }) {
  let driverId = 0;
  try {
    driverId = requireDriverApiAuth(request).id;
  } catch {
    return driverApiError(404, "Not found", "NOT_FOUND");
  }
  const { id, redactionId } = await params;
  const loadId = Number.parseInt(id, 10);
  const access = decideRedactionAccess({
    redactionId: Number.parseInt(redactionId, 10),
    office: false,
    driverId,
  });
  if (!access.ok) {
    return driverApiError(404, "Not found", "NOT_FOUND");
  }
  if (access.row.load_id !== loadId) {
    return driverApiError(404, "Not found", "NOT_FOUND");
  }
  const buffer = readRateConRedactionPdf(access.row);
  if (!buffer) return driverApiError(404, "Not found", "NOT_FOUND");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="rate-confirmation.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
