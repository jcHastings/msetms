export const REPORT_CATEGORIES = [
  { value: "customer", label: "Customer" },
  { value: "driver", label: "Driver" },
  { value: "truck", label: "Truck" },
  { value: "dispatcher", label: "Dispatcher" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const REPORT_DATE_BASES = [
  { value: "pickup", label: "Ship / pickup date", shortLabel: "Ship Date" },
  { value: "delivery", label: "Delivery date", shortLabel: "Delivery Date" },
  { value: "invoice", label: "Invoice / updated date", shortLabel: "Invoice Date" },
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
  { key: "loads", label: "Loads", color: "#eab308" },
  { key: "miles", label: "Miles", color: "#38bdf8" },
  { key: "emptyMiles", label: "Empty miles", color: "#94a3b8" },
  { key: "gross", label: "Gross Rev.", color: "#dc2626" },
  { key: "fees", label: "Fees", color: "#f9a8d4" },
  { key: "net", label: "Net Profit", color: "#64748b" },
  { key: "pct", label: "Percent", color: "#ca8a04" },
] as const;

export type StatsMetricKey = (typeof STATS_METRIC_ROWS)[number]["key"];

export function reportMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function formatStatsCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled.toFixed(Math.abs(scaled) >= 10 ? 1 : 1)}M`.replace(/\.0M$/, "M");
  }
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(1)}K`.replace(/\.0K$/, "K");
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
