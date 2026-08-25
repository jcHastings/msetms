export const REPORT_CATEGORIES = [
  { value: "customer", label: "Customer" },
  { value: "driver", label: "Driver" },
  { value: "truck", label: "Truck" },
  { value: "dispatcher", label: "Dispatcher" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const REPORT_DATE_BASES = [
  { value: "pickup", label: "Ship / pickup date" },
  { value: "delivery", label: "Delivery date" },
  { value: "invoice", label: "Invoice / updated date" },
] as const;

export type ReportDateBasis = (typeof REPORT_DATE_BASES)[number]["value"];

export const REPORT_EXPORT_COLUMNS = [
  { key: "load_number", label: "Load #" },
  { key: "status", label: "Status" },
  { key: "customer", label: "Customer" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
  { key: "driver", label: "Driver" },
  { key: "truck", label: "Truck" },
  { key: "trailer", label: "Trailer" },
  { key: "dispatcher", label: "Dispatcher" },
  { key: "miles", label: "Miles" },
  { key: "empty_miles", label: "Empty miles" },
  { key: "revenue", label: "Revenue" },
  { key: "driver_pay", label: "Driver pay" },
  { key: "allocated_revenue", label: "Allocated revenue" },
] as const;

export type ReportExportColumn = (typeof REPORT_EXPORT_COLUMNS)[number]["key"];

export function defaultReportColumns(): ReportExportColumn[] {
  return REPORT_EXPORT_COLUMNS.map((column) => column.key);
}

export const STATS_METRIC_ROWS = [
  { key: "loads", label: "Loads" },
  { key: "miles", label: "Miles" },
  { key: "emptyMiles", label: "Empty miles" },
  { key: "gross", label: "Gross Rev" },
  { key: "fees", label: "Fees" },
  { key: "net", label: "Net" },
  { key: "pct", label: "%" },
] as const;

export type StatsMetricKey = (typeof STATS_METRIC_ROWS)[number]["key"];

export function reportMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
