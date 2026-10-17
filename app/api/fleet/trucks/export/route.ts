import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderTrucksCsv } from "@/lib/fleet-csv";
import { listTrucks } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("trucks.csv", renderTrucksCsv(listTrucks()));
}
