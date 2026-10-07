import { StatementIdentityError } from "@/lib/carrier-identity";
import { getSignedInDriver } from "@/lib/driver-session";
import { normalizePayWeek } from "@/lib/pay-week";
import { pdfResponseHeaders } from "@/lib/pdf-response";
import { renderSettlementPdf } from "@/lib/settlement-statement-pdf";
import { buildSettlement } from "@/lib/settlement-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const driver = await getSignedInDriver();
  if (!driver) return new Response("Sign in", { status: 401 });
  const week = normalizePayWeek(new URL(request.url).searchParams.get("week"));
  const statement = buildSettlement(driver.id, week.from);
  if (!statement) return new Response("Not found", { status: 404 });
  let pdf: Buffer;
  try {
    pdf = await renderSettlementPdf(statement);
  } catch (error) {
    if (error instanceof StatementIdentityError) {
      return new Response(error.message, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw error;
  }
  const headers = new Headers(pdfResponseHeaders(`my-pay-${statement.statementNumber}.pdf`));
  return new Response(new Uint8Array(pdf), { headers });
}
