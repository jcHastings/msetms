import { dispatcherBinaryResponse, dispatcherCsvResponse } from "@/lib/csv-download";
import { listReportExportRows, renderReportCsv, renderReportXlsx } from "@/lib/reports-export";
import { defaultReportColumns, REPORT_EXPORT_COLUMNS, type ReportCategory, type ReportDateBasis, type ReportExportColumn } from "@/lib/reports-shared";
import { canViewReports } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

function parseColumns(raw: string | null): ReportExportColumn[] {
  const allowed = new Set(REPORT_EXPORT_COLUMNS.map((column) => column.key));
  const picked = String(raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ReportExportColumn => allowed.has(value as ReportExportColumn));
  return picked.length ? picked : defaultReportColumns();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = (url.searchParams.get("category") ?? "customer") as ReportCategory;
  const dateBasis = (url.searchParams.get("dateBasis") ?? "pickup") as ReportDateBasis;
  const entityKey =
    category === "driver" ? "driverId" : category === "truck" ? "truckId" : category === "dispatcher" ? "dispatcherId" : "customerId";
  const entityId = Number.parseInt(url.searchParams.get(entityKey) ?? "", 10);
  const columns = parseColumns(url.searchParams.getAll("columns").join(","));
  const rows = listReportExportRows({
    category,
    entityId: Number.isFinite(entityId) ? entityId : null,
    dateBasis,
    dateFrom: url.searchParams.get("from") ?? "",
    dateTo: url.searchParams.get("to") ?? "",
    columns,
  });
  if (url.searchParams.get("format") === "xlsx") {
    return dispatcherBinaryResponse(
      "mse-manage-reports.xlsx",
      renderReportXlsx(rows, columns),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      canViewReports,
    );
  }
  return dispatcherCsvResponse("mse-manage-reports.csv", renderReportCsv(rows, columns), canViewReports);
}
