import { listDriverPay, renderDriverPayXlsx } from "@/lib/accounting";
import { dispatcherBinaryResponse } from "@/lib/csv-download";
import { canAccessAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  return dispatcherBinaryResponse(
    "driver-pay.xlsx",
    renderDriverPayXlsx(listDriverPay(from, to)),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    canAccessAccounting,
  );
}
