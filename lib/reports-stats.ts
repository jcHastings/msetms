import { listPayItems } from "./pay-items";
import { listLoads } from "./queries";
import { splitLoadRevenueByRelayMiles } from "./reports-relay-revenue";
import type { ReportCategory, ReportDateBasis } from "./reports-shared";
import type { LoadView } from "./types";

export type StatsMonthKey = string;

export type StatsMetrics = {
  loads: number;
  miles: number;
  emptyMiles: number;
  gross: number;
  fees: number;
  net: number;
};

export type StatsEntityRow = {
  id: number | null;
  name: string;
  months: Record<StatsMonthKey, StatsMetrics>;
  totals: StatsMetrics;
};

export type StatsMatrix = {
  months: StatsMonthKey[];
  cells: Record<StatsMonthKey, StatsMetrics>;
  totals: StatsMetrics;
  rows: StatsEntityRow[];
};

export type StatsDrillRow = {
  loadId: number;
  loadNumber: string;
  origin: string;
  destination: string;
  miles: number | null;
  emptyMiles: number | null;
  revenue: number | null;
  allocatedRevenue: number | null;
};

function emptyMetrics(): StatsMetrics {
  return { loads: 0, miles: 0, emptyMiles: 0, gross: 0, fees: 0, net: 0 };
}

function addMetrics(into: StatsMetrics, add: StatsMetrics): void {
  into.loads += add.loads;
  into.miles += add.miles;
  into.emptyMiles += add.emptyMiles;
  into.gross += add.gross;
  into.fees += add.fees;
  into.net += add.net;
}

function loadAccessorials(loadId: number): number {
  return listPayItems(loadId, "income")
    .filter((item) => item.bill_to === "customer" && item.category !== "flat_rate")
    .reduce((sum, item) => sum + (item.total ?? 0), 0);
}

export function statsPct(metrics: StatsMetrics): number | null {
  if (!metrics.gross) return null;
  return Math.round((metrics.net / metrics.gross) * 1000) / 10;
}

export function rollingMonthKeys(end = new Date(), count = 13): StatsMonthKey[] {
  const keys: string[] = [];
  const cursor = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function loadMonth(load: LoadView, basis: ReportDateBasis): string {
  const raw =
    basis === "delivery" ? load.delivery_end || load.delivery_start : basis === "invoice" ? load.updated_at : load.pickup_start;
  return String(raw ?? "").slice(0, 7);
}

function entityFor(load: LoadView, category: ReportCategory): { id: number | null; name: string } {
  if (category === "customer") return { id: load.customer_id, name: load.customer_name || "Unknown" };
  if (category === "driver") return { id: load.driver_id, name: load.driver_name || "Unassigned" };
  if (category === "truck") return { id: load.truck_id, name: load.truck_unit || "Unassigned" };
  return { id: load.dispatcher_id, name: load.dispatcher_name || "Unassigned" };
}

export function buildStatistics(input: {
  category: ReportCategory;
  entityId: number | null;
  dateBasis: ReportDateBasis;
}): StatsMatrix {
  const months = rollingMonthKeys();
  const monthSet = new Set(months);
  const byKey = new Map<string, StatsEntityRow>();

  function rowFor(id: number | null, name: string): StatsEntityRow {
    const key = `${id ?? "none"}:${name}`;
    const existing = byKey.get(key);
    if (existing) return existing;
    const created: StatsEntityRow = {
      id,
      name,
      months: Object.fromEntries(months.map((month) => [month, emptyMetrics()])),
      totals: emptyMetrics(),
    };
    byKey.set(key, created);
    return created;
  }

  for (const load of listLoads({ status: "all" })) {
    if (load.status === "cancelled") continue;
    const month = loadMonth(load, input.dateBasis);
    if (!monthSet.has(month)) continue;
    const fees = loadAccessorials(load.id);
    if (input.category === "driver") {
      const legs = splitLoadRevenueByRelayMiles(load.id);
      if (legs.length) {
        for (const leg of legs) {
          if (input.entityId != null && leg.driverId !== input.entityId) continue;
          const entity = rowFor(leg.driverId, leg.driverName);
          const share = leg.share ?? 0;
          const gross = leg.allocatedRevenue ?? 0;
          const feeShare = Math.round(fees * share * 100) / 100;
          const slice: StatsMetrics = {
            loads: 1,
            miles: leg.miles ?? 0,
            emptyMiles: 0,
            gross,
            fees: feeShare,
            net: Math.round((gross - feeShare) * 100) / 100,
          };
          addMetrics(entity.months[month], slice);
          addMetrics(entity.totals, slice);
        }
        continue;
      }
    }
    const entity = entityFor(load, input.category);
    if (input.entityId != null && entity.id !== input.entityId) continue;
    const target = rowFor(entity.id, entity.name);
    const gross = load.rate ?? 0;
    const slice: StatsMetrics = {
      loads: 1,
      miles: load.route_miles ?? 0,
      emptyMiles: 0,
      gross,
      fees,
      net: Math.round((gross - fees) * 100) / 100,
    };
    addMetrics(target.months[month], slice);
    addMetrics(target.totals, slice);
  }

  const rows = [...byKey.values()].sort((left, right) => right.totals.gross - left.totals.gross);
  const cells = Object.fromEntries(months.map((month) => [month, emptyMetrics()])) as Record<
    StatsMonthKey,
    StatsMetrics
  >;
  const totals = emptyMetrics();
  for (const row of rows) {
    for (const month of months) addMetrics(cells[month], row.months[month]);
    addMetrics(totals, row.totals);
  }
  return { months, cells, totals, rows };
}

export function listStatisticsDrill(input: {
  category: ReportCategory;
  entityId: number | null;
  month: string;
  dateBasis: ReportDateBasis;
}): StatsDrillRow[] {
  const rows: StatsDrillRow[] = [];
  for (const load of listLoads({ status: "all" })) {
    if (load.status === "cancelled") continue;
    if (loadMonth(load, input.dateBasis) !== input.month) continue;
    if (input.category === "driver") {
      const legs = splitLoadRevenueByRelayMiles(load.id);
      if (legs.length) {
        for (const leg of legs) {
          if (input.entityId != null && leg.driverId !== input.entityId) continue;
          rows.push({
            loadId: load.id,
            loadNumber: load.load_number,
            origin: leg.origin,
            destination: leg.destination,
            miles: leg.miles,
            emptyMiles: null,
            revenue: load.rate,
            allocatedRevenue: leg.allocatedRevenue,
          });
        }
        continue;
      }
    }
    const entity = entityFor(load, input.category);
    if (input.entityId != null && entity.id !== input.entityId) continue;
    rows.push({
      loadId: load.id,
      loadNumber: load.load_number,
      origin: load.origin,
      destination: load.destination,
      miles: load.route_miles,
      emptyMiles: null,
      revenue: load.rate,
      allocatedRevenue: load.rate,
    });
  }
  return rows;
}
