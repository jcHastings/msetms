import { computeOwnerOperatorPay } from "./settlement";
import { listLoads } from "./queries";
import { splitLoadRevenueByRelayMiles } from "./reports-relay-revenue";
import {
  defaultReportColumns,
  type ReportCategory,
  type ReportDateBasis,
  type ReportExportColumn,
} from "./reports-shared";
import { buildXlsxFromGrid } from "./xlsx-first-sheet";
import { isOwnerOperator, type LoadView } from "./types";

export type ReportExportFilters = {
  category: ReportCategory;
  entityId: number | null;
  dateBasis: ReportDateBasis;
  dateFrom: string;
  dateTo: string;
  columns?: ReportExportColumn[];
};

export type ReportExportRow = Record<ReportExportColumn, string | number>;

function loadWhen(load: LoadView, basis: ReportDateBasis): string {
  if (basis === "delivery") return (load.delivery_end || load.delivery_start || "").slice(0, 10);
  if (basis === "invoice") return (load.updated_at || "").slice(0, 10);
  return (load.pickup_start || "").slice(0, 10);
}

function inRange(day: string, from: string, to: string): boolean {
  if (from && day && day < from) return false;
  if (to && day && day > to) return false;
  return true;
}

function matchesCategory(load: LoadView, category: ReportCategory, entityId: number | null): boolean {
  if (entityId == null) return true;
  if (category === "customer") return load.customer_id === entityId;
  if (category === "driver") return load.driver_id === entityId;
  if (category === "truck") return load.truck_id === entityId;
  return load.dispatcher_id === entityId;
}

function driverPay(load: LoadView): number {
  if (isOwnerOperator(load.driver_type)) {
    return load.oo_pay ?? computeOwnerOperatorPay(load.rate, load.oo_percent) ?? 0;
  }
  return 0;
}

function baseRow(load: LoadView, allocated: number | null, driverName: string): ReportExportRow {
  return {
    load_number: load.load_number,
    status: load.status,
    customer: load.customer_name,
    origin: load.origin,
    destination: load.destination,
    pickup: (load.pickup_start || "").slice(0, 10),
    delivery: (load.delivery_end || load.delivery_start || "").slice(0, 10),
    driver: driverName,
    truck: load.truck_unit ?? "",
    trailer: load.trailer_unit ?? "",
    dispatcher: load.dispatcher_name ?? "",
    miles: load.route_miles ?? "",
    empty_miles: load.empty_miles ?? "",
    revenue: load.rate ?? 0,
    driver_pay: driverPay(load),
    allocated_revenue: allocated ?? "",
  };
}

export function listReportExportRows(filters: ReportExportFilters): ReportExportRow[] {
  const loads = listLoads({ status: "all" }).filter((load) => load.status !== "cancelled");
  const rows: ReportExportRow[] = [];
  for (const load of loads) {
    if (!inRange(loadWhen(load, filters.dateBasis), filters.dateFrom, filters.dateTo)) continue;
    if (filters.category === "driver") {
      const legs = splitLoadRevenueByRelayMiles(load.id);
      if (legs.length) {
        for (const leg of legs) {
          if (filters.entityId != null && leg.driverId !== filters.entityId) continue;
          rows.push({
            ...baseRow(load, leg.allocatedRevenue, leg.driverName),
            origin: leg.origin,
            destination: leg.destination,
            miles: leg.miles ?? "",
            empty_miles: leg.driverId === load.driver_id ? load.empty_miles ?? "" : "",
            allocated_revenue: leg.allocatedRevenue ?? "",
          });
        }
        continue;
      }
    }
    if (!matchesCategory(load, filters.category, filters.entityId)) continue;
    rows.push(baseRow(load, load.rate ?? null, load.driver_name ?? ""));
  }
  return rows;
}

export function renderReportCsv(rows: ReportExportRow[], columns = defaultReportColumns()): string {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const value = String(row[column] ?? "");
        return /["\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
      })
      .join(","),
  );
  return [header, ...body].join("\n");
}

export function renderReportXlsx(rows: ReportExportRow[], columns = defaultReportColumns()): Uint8Array {
  const header = columns;
  const grid = [header, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  return buildXlsxFromGrid(grid);
}
