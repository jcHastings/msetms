import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderAscendLocationTemplate } from "@/lib/location-csv";
import { canImportLocations } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("ascend-locations-import.csv", renderAscendLocationTemplate(), canImportLocations);
}
