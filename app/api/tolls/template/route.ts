import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderTollsTemplate } from "@/lib/tolls";
import { canViewFuel } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("tolls-import.csv", renderTollsTemplate(), canViewFuel);
}
