import { dispatcherCsvResponse } from "@/lib/csv-download";
import { renderTrailersCsv } from "@/lib/fleet-csv";
import { listTrailers } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return dispatcherCsvResponse("trailers.csv", renderTrailersCsv(listTrailers()));
}
