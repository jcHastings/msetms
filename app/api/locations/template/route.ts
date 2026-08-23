import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderAscendLocationTemplate } from "@/lib/location-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("ascend-locations-import.csv", renderAscendLocationTemplate());
}
