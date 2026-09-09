import { listArReportRows, renderArApXlsx } from "@/lib/accounting-aging";
import { dispatcherBinaryResponse } from "@/lib/csv-download";
import { canAccessAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = new Set(
    (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const rows = listArReportRows().filter((row) => ids.size === 0 || ids.has(row.id));
  return dispatcherBinaryResponse(
    "accounts-receivable.xlsx",
    renderArApXlsx(rows),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    canAccessAccounting,
  );
}
