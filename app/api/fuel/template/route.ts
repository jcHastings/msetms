import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderFuelTemplate } from "@/lib/fuel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("fuel-import.csv", renderFuelTemplate());
}
