import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderDriversCsv } from "@/lib/fleet-csv";
import { listDrivers } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("drivers.csv", renderDriversCsv(listDrivers()));
}
