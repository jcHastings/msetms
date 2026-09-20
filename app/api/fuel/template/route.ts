import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderFuelTemplate } from "@/lib/fuel";
import { canUploadFuel } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("fuel-import.csv", renderFuelTemplate(), canUploadFuel);
}
