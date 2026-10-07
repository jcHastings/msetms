import { dispatcherBinaryResponse } from "@/lib/csv-download";
import { normalizePayWeek } from "@/lib/pay-week";
import { renderSettlementPdf } from "@/lib/settlement-statement-pdf";
import { buildSettlement } from "@/lib/settlement-statement";
import { canViewAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const driverId = Number.parseInt(url.searchParams.get("driver") ?? "", 10);
  const week = normalizePayWeek(url.searchParams.get("week"));
  if (!Number.isFinite(driverId) || driverId <= 0) return new Response("Not found", { status: 404 });
  const statement = buildSettlement(driverId, week.from);
  if (!statement) return new Response("Not found", { status: 404 });
  const pdf = await renderSettlementPdf(statement);
  return dispatcherBinaryResponse(
    `settlement-${statement.statementNumber}.pdf`,
    pdf,
    "application/pdf",
    canViewAccounting,
  );
}
