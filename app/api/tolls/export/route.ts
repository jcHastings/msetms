import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderTollExportCsv } from "@/lib/tolls";
import { listTollTransactions } from "@/lib/tolls-store";
import { canUploadFuel } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("tolls.csv", renderTollExportCsv(listTollTransactions()), canUploadFuel);
}
