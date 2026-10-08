import { getSignedInDriver } from "@/lib/driver-session";
import { getPaystubRow, readPaystubPdf } from "@/lib/paystubs";
import { sanitizeName } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const driver = await getSignedInDriver();
  if (!driver) return new Response("Sign in with your email and password.", { status: 401 });
  const { id } = await context.params;
  const lineId = Number(id);
  if (!lineId) return new Response("Paystub not found.", { status: 404 });
  const line = getPaystubRow(lineId);
  if (!line) return new Response("Paystub not found.", { status: 404 });
  if (line.driver_id !== driver.id || line.status !== "stored") {
    return new Response("You can only open your own paystubs.", { status: 403 });
  }
  const pdf = readPaystubPdf(line.stored_name);
  if (!pdf) return new Response("Paystub not found.", { status: 404 });
  const stamp = line.pay_date || String(line.id);
  const filename = sanitizeName(line.original_name || `paystub-${stamp}.pdf`);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
