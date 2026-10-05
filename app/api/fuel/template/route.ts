import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderFuelTemplate } from "@/lib/fuel";
import { canViewFuel } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("fuel-import.csv", renderFuelTemplate(), canViewFuel);
}
