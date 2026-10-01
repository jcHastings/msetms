import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderFuelExportCsv } from "@/lib/fuel";
import { listFuelTransactions } from "@/lib/fuel-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("fuel.csv", renderFuelExportCsv(listFuelTransactions()));
}
