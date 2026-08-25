import { listDriverPay, renderDriverPayCsv } from "@/lib/accounting";
import { dispatcherCsvResponse } from "@/lib/csv-download";
import { canAccessAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  return dispatcherCsvResponse("driver-pay.csv", renderDriverPayCsv(listDriverPay(from, to)), canAccessAccounting);
}
