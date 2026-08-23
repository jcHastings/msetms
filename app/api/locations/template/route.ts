import { renderAscendLocationTemplate } from "@/lib/location-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(renderAscendLocationTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ascend-locations-import.csv"',
      "Cache-Control": "no-store",
    },
  });
}
