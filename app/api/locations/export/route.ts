import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderAscendLocationCsv } from "@/lib/location-csv";
import { listLocations } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("locations.csv", renderAscendLocationCsv(listLocations()));
}
