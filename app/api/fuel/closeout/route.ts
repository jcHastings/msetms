import { dispatcherTextResponse } from "@/lib/csv-download";
import { renderFuelCloseoutHtml, renderFuelCloseoutMarkdown } from "@/lib/fuel-closeout-export";
import { loadAndFileFuelCloseout } from "@/lib/fuel-closeout-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "html" ? "html" : "md";
  const report = await loadAndFileFuelCloseout({
    week: url.searchParams.get("week") ?? undefined,
    hydrate: true,
  });
  const body = format === "html" ? renderFuelCloseoutHtml(report) : renderFuelCloseoutMarkdown(report);
  const filename = `fuel-closeout-${report.week.startYmd}.${format === "html" ? "html" : "md"}`;
  return dispatcherTextResponse(filename, body, format === "html" ? "text/html" : "text/markdown");
}
