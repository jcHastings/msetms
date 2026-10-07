import { getSignedInDriver } from "@/lib/driver-session";
import { fetchGustoPaystubPdf, getGustoPayLine, getGustoPublicStatus } from "@/lib/integrations/gusto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const driver = await getSignedInDriver();
  if (!driver) return new Response("Sign in with your email and password.", { status: 401 });
  const { id } = await context.params;
  const lineId = Number(id);
  if (!lineId) return new Response("Paystub not found.", { status: 404 });
  const line = getGustoPayLine(lineId);
  if (!line) return new Response("Paystub not found.", { status: 404 });
  if (line.driver_id !== driver.id) {
    return new Response("You can only open your own paystubs.", { status: 403 });
  }
  if (line.source !== "employee_payroll") return new Response("Paystub not found.", { status: 404 });
  if (!getGustoPublicStatus().connected) {
    return new Response("Gusto is not connected.", { status: 404 });
  }
  try {
    const pdf = await fetchGustoPaystubPdf({
      payrollId: line.gusto_external_id,
      employeeUuid: line.gusto_person_uuid,
    });
    const stamp = line.check_date || String(line.id);
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="paystub-${stamp}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gusto paystub request failed.";
    return new Response(message, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
