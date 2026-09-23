/**
 * Office Money desk math. Pure inputs, no database and no bank feed.
 * CPM = assigned burns / Samsara miles (same odometer delta fuel closeout uses).
 * Contribution = load revenue on the truck, minus fuel, tolls, money codes, and lumper.
 * The 13-week cash sketch is not a bank balance.
 */

import { median, scoreFuelAudit, type FuelAuditRow, type FuelAuditWindow } from "./fuel-audit";
import {
  addYmdDays,
  isMoneyCodeCategory,
  localWeekRange,
  parseFuelWeekStart,
  zonedWallToUtc,
} from "./fuel";
import { DISPLAY_TIME_ZONE, formatMdYFull, ymdInTimeZone } from "./format";

export type MoneySpan = "week" | "month" | "quarter";

export type MoneyWindow = {
  span: MoneySpan;
  anchorYmd: string;
  startYmd: string;
  endYmd: string;
  fromIso: string;
  toIso: string;
  label: string;
  days: number;
};

export type MoneyTruckInput = {
  id: number;
  unit: string;
  driverName: string;
  active: boolean;
};

export type MoneyFuelTx = {
  id: number;
  occurredAt: string;
  truckId: number | null;
  driverId: number | null;
  driverName: string;
  unit: string;
  gallons: number | null;
  amount: number | null;
  location: string;
  category: string;
};

export type MoneyTollTx = {
  id: number;
  occurredAt: string;
  truckId: number | null;
  driverName: string;
  unit: string;
  amount: number | null;
  plaza: string;
};

export type MoneyLoad = {
  id: number;
  loadNumber: string;
  truckId: number | null;
  status: string;
  nonRevenue: boolean;
  rate: number | null;
  lumper: number | null;
  pickupStart: string;
  deliveryStart: string;
  deliveryEnd: string;
  invoiced: boolean;
  invoicePaid: boolean;
  invoiceAt: string;
};

export type MoneyMiles = {
  truckId: number;
  miles: number | null;
  note: string;
};

export type MoneyStandingRow = {
  truckId: number;
  unit: string;
  driverName: string;
  active: boolean;
  miles: number | null;
  milesNote: string;
  fuel: number;
  tolls: number;
  other: number;
  burns: number;
  cpm: number | null;
  revenue: number | null;
  margin: number | null;
  marginPct: number | null;
};

export type MoneyStandings = {
  window: MoneyWindow;
  rows: MoneyStandingRow[];
  fleet: {
    trucks: number;
    miles: number | null;
    burns: number;
    fuel: number;
    tolls: number;
    other: number;
    cpm: number | null;
    revenue: number | null;
    margin: number | null;
    marginPct: number | null;
  };
  milesNote: string;
  includeInactive: boolean;
  unassignedFuel: number;
  unassignedTolls: number;
  hiddenInactiveBurns: number;
  loadsWithoutTruck: number;
  loadsMissingRate: number;
};

export type MoneyFlagKind =
  | "duplicate_fuel"
  | "fuel_too_often"
  | "fuel_overspend"
  | "unassigned_fuel"
  | "unassigned_toll"
  | "outlier_cpm"
  | "negative_contribution";

export type MoneyFlag = {
  id: string;
  kind: MoneyFlagKind;
  title: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
};

export type CashWeekStatus = "both" | "partial" | "gap";

export type CashSketchWeek = {
  startYmd: string;
  endYmd: string;
  label: string;
  invoiced: number;
  expected: number;
  receivables: number;
  fuel: number;
  tolls: number;
  burns: number;
  receivableCount: number;
  burnCount: number;
  status: CashWeekStatus;
  net: number | null;
  note: string;
};

export type CashSketch = {
  banner: string;
  heading: string;
  weeks: CashSketchWeek[];
  notes: string[];
};

export const CASH_SKETCH_BANNER =
  "Sketch until a bank is connected. Not a bank balance. Invoiced and expected load revenue, plus fuel and tolls already on file. Paid invoices are left out.";

export const MONEY_ASKS = [
  {
    id: "fleet-cpm-this-week",
    label: "Fleet CPM this week",
    question: "What is fleet CPM this week?",
  },
  {
    id: "fleet-cpm-closed-week",
    label: "Fleet CPM last closed week",
    question: "What is fleet CPM for the last closed week?",
  },
  {
    id: "least-last-quarter",
    label: "Least money last quarter",
    question: "Which truck made the least money last quarter?",
  },
] as const;

export type MoneyAskId = (typeof MONEY_ASKS)[number]["id"];

export type MoneyChoice = { value: string; label: string };

const FLAG_TITLES: Record<MoneyFlagKind, string> = {
  duplicate_fuel: "Duplicate fuel",
  fuel_too_often: "Fills too often",
  fuel_overspend: "Fuel overspend",
  unassigned_fuel: "Unassigned fuel",
  unassigned_toll: "Unassigned toll",
  outlier_cpm: "High cost per mile",
  negative_contribution: "Negative contribution",
};

const FLAG_ORDER: MoneyFlagKind[] = [
  "duplicate_fuel",
  "fuel_too_often",
  "fuel_overspend",
  "unassigned_fuel",
  "unassigned_toll",
  "outlier_cpm",
  "negative_contribution",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function inclusiveDays(startYmd: string, endYmd: string): number {
  const [ys, ms, ds] = startYmd.split("-").map(Number);
  const [ye, me, de] = endYmd.split("-").map(Number);
  const span = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
  return Math.round(span / 86_400_000) + 1;
}

export function instantInWindow(iso: string, window: MoneyWindow): boolean {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  return at >= Date.parse(window.fromIso) && at < Date.parse(window.toIso);
}

export function formatDeskMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDeskCpm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function formatDeskMiles(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatDeskPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Last fully closed America/New_York Mon-Sun week. Same rule as fuel closeout. */
export function closedOfficeWeekStart(now = new Date()): string {
  return localWeekRange(addYmdDays(localWeekRange(now).startYmd, -7)).startYmd;
}

function deskDate(iso: string): string {
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : ymdInTimeZone(iso, DISPLAY_TIME_ZONE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  return formatMdYFull(ymd);
}

function rangeLabel(startYmd: string, endYmd: string): string {
  return `${deskDate(startYmd)} to ${deskDate(endYmd)}`;
}

export function weekMoneyWindow(startYmd: string, now = new Date()): MoneyWindow {
  const range = localWeekRange(startYmd);
  const current = range.startYmd === localWeekRange(now).startYmd;
  const closed = range.startYmd === closedOfficeWeekStart(now);
  const dates = rangeLabel(range.startYmd, range.endYmd);
  const label = current ? `This week, ${dates}` : closed ? `Last closed week, ${dates}` : `Week of ${dates}`;
  return {
    span: "week",
    anchorYmd: range.startYmd,
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    fromIso: range.start.toISOString(),
    toIso: range.end.toISOString(),
    label,
    days: 7,
  };
}

export function monthMoneyWindow(year: number, month: number): MoneyWindow {
  const startYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYmd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const endYmd = addYmdDays(nextYmd, -1);
  return {
    span: "month",
    anchorYmd: startYmd.slice(0, 7),
    startYmd,
    endYmd,
    fromIso: zonedWallToUtc(startYmd, 0, 0, 0).toISOString(),
    toIso: zonedWallToUtc(nextYmd, 0, 0, 0).toISOString(),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    days: inclusiveDays(startYmd, endYmd),
  };
}

export function quarterOfYmd(ymd: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
  return { year, quarter };
}

export function quarterMoneyWindow(year: number, quarter: 1 | 2 | 3 | 4): MoneyWindow {
  const startMonth = (quarter - 1) * 3 + 1;
  const startYmd = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextMonth = quarter === 4 ? 1 : startMonth + 3;
  const nextYmd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const endYmd = addYmdDays(nextYmd, -1);
  return {
    span: "quarter",
    anchorYmd: `${year}-Q${quarter}`,
    startYmd,
    endYmd,
    fromIso: zonedWallToUtc(startYmd, 0, 0, 0).toISOString(),
    toIso: zonedWallToUtc(nextYmd, 0, 0, 0).toISOString(),
    label: `Q${quarter} ${year}`,
    days: inclusiveDays(startYmd, endYmd),
  };
}

export function previousQuarterWindow(now = new Date()): MoneyWindow {
  const current = quarterOfYmd(ymdInTimeZone(now, DISPLAY_TIME_ZONE));
  if (current.quarter === 1) return quarterMoneyWindow(current.year - 1, 4);
  return quarterMoneyWindow(current.year, (current.quarter - 1) as 2 | 3 | 4);
}

function currentMonthParts(now: Date): { year: number; month: number } {
  const ymd = ymdInTimeZone(now, DISPLAY_TIME_ZONE);
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}

function parseMonth(value: string | undefined, now: Date): { year: number; month: number } {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})/);
  if (!match) return currentMonthParts(now);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return currentMonthParts(now);
  return { year, month };
}

function parseQuarter(value: string | undefined, now: Date): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{4})-?q([1-4])$/i);
  if (!match) return quarterOfYmd(ymdInTimeZone(now, DISPLAY_TIME_ZONE));
  return { year: Number(match[1]), quarter: Number(match[2]) as 1 | 2 | 3 | 4 };
}

export function resolveMoneyWindow(
  query: { span?: string; week?: string; month?: string; quarter?: string },
  now = new Date(),
): MoneyWindow {
  if (query.span === "month") {
    const month = parseMonth(query.month, now);
    return monthMoneyWindow(month.year, month.month);
  }
  if (query.span === "quarter") {
    const quarter = parseQuarter(query.quarter, now);
    return quarterMoneyWindow(quarter.year, quarter.quarter);
  }
  const week = String(query.week ?? "").trim();
  const start = week ? parseFuelWeekStart(week, now) : closedOfficeWeekStart(now);
  return weekMoneyWindow(start, now);
}

export function monthChoices(now = new Date(), count = 12): MoneyChoice[] {
  const current = currentMonthParts(now);
  const choices: MoneyChoice[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = current.year * 12 + (current.month - 1) - i;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const window = monthMoneyWindow(year, month);
    choices.push({ value: window.anchorYmd, label: window.label });
  }
  return choices;
}

export function quarterChoices(now = new Date(), count = 8): MoneyChoice[] {
  const current = quarterOfYmd(ymdInTimeZone(now, DISPLAY_TIME_ZONE));
  const choices: MoneyChoice[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = current.year * 4 + (current.quarter - 1) - i;
    const year = Math.floor(index / 4);
    const quarter = ((index % 4) + 1) as 1 | 2 | 3 | 4;
    const window = quarterMoneyWindow(year, quarter);
    choices.push({ value: window.anchorYmd, label: window.label });
  }
  return choices;
}

export function weekChoicesFromInstants(instants: string[], now = new Date(), selectedStart = ""): MoneyChoice[] {
  const starts = new Set<string>([localWeekRange(now).startYmd, closedOfficeWeekStart(now)]);
  if (selectedStart) starts.add(localWeekRange(selectedStart).startYmd);
  for (const iso of instants) {
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) continue;
    starts.add(localWeekRange(new Date(at)).startYmd);
  }
  return [...starts]
    .sort()
    .reverse()
    .slice(0, 52)
    .map((start) => ({ value: start, label: weekMoneyWindow(start, now).label }));
}

export function moneySpanHref(span: MoneySpan, inactive: boolean): string {
  const params = new URLSearchParams();
  if (span !== "week") params.set("span", span);
  if (inactive) params.set("inactive", "1");
  const text = params.toString();
  return text ? `/money?${text}` : "/money";
}

export function moneyDeskHref(input: {
  span: MoneySpan;
  anchorYmd: string;
  inactive: boolean;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (input.span === "month") {
    params.set("span", "month");
    params.set("month", input.anchorYmd);
  } else if (input.span === "quarter") {
    params.set("span", "quarter");
    params.set("quarter", input.anchorYmd);
  } else if (input.anchorYmd) {
    params.set("week", input.anchorYmd);
  }
  if (input.inactive) params.set("inactive", "1");
  if (input.q) params.set("q", input.q);
  const text = params.toString();
  return text ? `/money?${text}` : "/money";
}

export function fuelEvidenceHref(occurredAt: string, truckId: number | null): string | null {
  const at = Date.parse(occurredAt);
  if (!Number.isFinite(at)) return null;
  const week = localWeekRange(new Date(at)).startYmd;
  const params = new URLSearchParams();
  params.set("week", week);
  if (truckId) params.set("truck", String(truckId));
  return `/fuel?${params.toString()}`;
}

export function tollEvidenceHref(occurredAt: string, truckId: number | null): string | null {
  const at = Date.parse(occurredAt);
  if (!Number.isFinite(at)) return null;
  const week = localWeekRange(new Date(at)).startYmd;
  const params = new URLSearchParams();
  params.set("week", week);
  if (truckId) params.set("truck", String(truckId));
  return `/tolls?${params.toString()}`;
}

export function loadEarnedAt(load: Pick<MoneyLoad, "deliveryStart" | "deliveryEnd" | "pickupStart">): string {
  return load.deliveryStart || load.deliveryEnd || load.pickupStart || "";
}

function unitSort(left: string, right: string): number {
  const a = Number.parseInt(left, 10);
  const b = Number.parseInt(right, 10);
  if (Number.isFinite(a) && Number.isFinite(b) && String(a) === left.trim() && String(b) === right.trim() && a !== b) {
    return a - b;
  }
  return left.localeCompare(right, undefined, { numeric: true });
}

function milesByTruck(miles: MoneyMiles[]): Map<number, MoneyMiles> {
  const map = new Map<number, MoneyMiles>();
  for (const row of miles) {
    const prev = map.get(row.truckId);
    if (!prev || (prev.miles == null && row.miles != null)) map.set(row.truckId, row);
  }
  return map;
}

function cpmFor(burns: number, miles: number | null): number | null {
  if (miles == null || !Number.isFinite(miles) || !(miles > 0)) return null;
  return round3(burns / miles);
}

function marginPctFor(margin: number | null, revenue: number | null): number | null {
  if (margin == null || revenue == null || !(revenue > 0)) return null;
  return round3(margin / revenue);
}

export function buildMoneyStandings(input: {
  window: MoneyWindow;
  trucks: MoneyTruckInput[];
  fuel: MoneyFuelTx[];
  tolls: MoneyTollTx[];
  loads: MoneyLoad[];
  miles: MoneyMiles[];
  includeInactive: boolean;
  milesNote: string;
}): MoneyStandings {
  const milesMap = milesByTruck(input.miles);
  const truckIds = new Set(input.trucks.map((truck) => truck.id));
  let unassignedFuel = 0;
  let unassignedTolls = 0;
  let hiddenInactiveBurns = 0;
  let loadsWithoutTruck = 0;
  let loadsMissingRate = 0;
  let orphanBurns = 0;

  const fuelByTruck = new Map<number, { fuel: number; other: number }>();
  for (const tx of input.fuel) {
    if (!instantInWindow(tx.occurredAt, input.window)) continue;
    const amount = finiteAmount(tx.amount);
    if (amount == null) continue;
    if (tx.truckId == null) {
      unassignedFuel = round2(unassignedFuel + amount);
      continue;
    }
    if (!truckIds.has(tx.truckId)) {
      orphanBurns = round2(orphanBurns + amount);
      continue;
    }
    const bucket = fuelByTruck.get(tx.truckId) ?? { fuel: 0, other: 0 };
    if (isMoneyCodeCategory(tx.category)) bucket.other = round2(bucket.other + amount);
    else bucket.fuel = round2(bucket.fuel + amount);
    fuelByTruck.set(tx.truckId, bucket);
  }

  const tollsByTruck = new Map<number, number>();
  for (const tx of input.tolls) {
    if (!instantInWindow(tx.occurredAt, input.window)) continue;
    const amount = finiteAmount(tx.amount);
    if (amount == null) continue;
    if (tx.truckId == null) {
      unassignedTolls = round2(unassignedTolls + amount);
      continue;
    }
    if (!truckIds.has(tx.truckId)) {
      orphanBurns = round2(orphanBurns + amount);
      continue;
    }
    tollsByTruck.set(tx.truckId, round2((tollsByTruck.get(tx.truckId) ?? 0) + amount));
  }

  const loadsByTruck = new Map<number, { revenue: number; revenueCount: number; missingRate: number; lumper: number }>();
  for (const load of input.loads) {
    if (load.status === "cancelled" || load.nonRevenue) continue;
    if (!instantInWindow(loadEarnedAt(load), input.window)) continue;
    if (load.truckId == null) {
      if (finiteAmount(load.rate) != null) loadsWithoutTruck += 1;
      continue;
    }
    if (!truckIds.has(load.truckId)) continue;
    const bucket = loadsByTruck.get(load.truckId) ?? { revenue: 0, revenueCount: 0, missingRate: 0, lumper: 0 };
    const rate = finiteAmount(load.rate);
    if (rate == null) bucket.missingRate += 1;
    else {
      bucket.revenue = round2(bucket.revenue + rate);
      bucket.revenueCount += 1;
    }
    const lumper = finiteAmount(load.lumper);
    if (lumper != null && lumper > 0) bucket.lumper = round2(bucket.lumper + lumper);
    loadsByTruck.set(load.truckId, bucket);
  }

  const rows: MoneyStandingRow[] = [];
  for (const truck of input.trucks) {
    const fuel = fuelByTruck.get(truck.id) ?? { fuel: 0, other: 0 };
    const tolls = tollsByTruck.get(truck.id) ?? 0;
    const loadBucket = loadsByTruck.get(truck.id) ?? { revenue: 0, revenueCount: 0, missingRate: 0, lumper: 0 };
    const other = round2(fuel.other + loadBucket.lumper);
    const burns = round2(fuel.fuel + tolls + other);
    if (!truck.active && !input.includeInactive) {
      hiddenInactiveBurns = round2(hiddenInactiveBurns + burns);
      loadsMissingRate += loadBucket.missingRate;
      continue;
    }
    loadsMissingRate += loadBucket.missingRate;
    const reading = milesMap.get(truck.id);
    const miles = reading?.miles ?? null;
    const revenue = loadBucket.revenueCount > 0 ? loadBucket.revenue : null;
    const margin = revenue == null ? null : round2(revenue - burns);
    rows.push({
      truckId: truck.id,
      unit: truck.unit,
      driverName: truck.driverName.trim() || "No driver",
      active: truck.active,
      miles,
      milesNote: reading?.note || (miles == null ? "No Samsara odometer pair in this period" : ""),
      fuel: fuel.fuel,
      tolls,
      other,
      burns,
      cpm: cpmFor(burns, miles),
      revenue,
      margin,
      marginPct: marginPctFor(margin, revenue),
    });
  }
  rows.sort((left, right) => unitSort(left.unit, right.unit));

  const fleetMilesValues = rows.map((row) => row.miles).filter((value): value is number => value != null && value > 0);
  const fleetRevenueValues = rows.map((row) => row.revenue).filter((value): value is number => value != null);
  const fuel = round2(rows.reduce((sum, row) => sum + row.fuel, 0));
  const tolls = round2(rows.reduce((sum, row) => sum + row.tolls, 0));
  const other = round2(rows.reduce((sum, row) => sum + row.other, 0));
  const burns = round2(fuel + tolls + other);
  const miles = fleetMilesValues.length ? round2(fleetMilesValues.reduce((sum, value) => sum + value, 0)) : null;
  const revenue = fleetRevenueValues.length ? round2(fleetRevenueValues.reduce((sum, value) => sum + value, 0)) : null;
  const margin = revenue == null ? null : round2(revenue - burns);
  const milesNote = [input.milesNote.trim(), orphanBurns > 0 ? `Fuel or tolls of ${formatDeskMoney(orphanBurns)} sit on a truck id that is not in the fleet list, so they are left out of CPM.` : ""]
    .filter(Boolean)
    .join(" ");

  return {
    window: input.window,
    rows,
    fleet: {
      trucks: rows.length,
      miles,
      burns,
      fuel,
      tolls,
      other,
      cpm: cpmFor(burns, miles),
      revenue,
      margin,
      marginPct: marginPctFor(margin, revenue),
    },
    milesNote,
    includeInactive: input.includeInactive,
    unassignedFuel,
    unassignedTolls,
    hiddenInactiveBurns,
    loadsWithoutTruck,
    loadsMissingRate,
  };
}

function auditWindow(window: MoneyWindow): FuelAuditWindow {
  return {
    kind: "last_30",
    fromIso: window.fromIso,
    toIso: window.toIso,
    startYmd: window.startYmd,
    endYmd: window.endYmd,
    label: window.label,
    days: Math.max(1, window.days),
  };
}

function toAuditRow(tx: MoneyFuelTx): FuelAuditRow {
  return {
    id: tx.id,
    occurred_at: tx.occurredAt,
    driver_id: tx.driverId,
    location: tx.location,
    gallons: tx.gallons,
    amount: tx.amount,
    category: tx.category,
    unit_number: tx.unit,
    driver_name_raw: tx.driverName,
    driver_name: tx.driverName,
    truck_unit: tx.unit,
  };
}

export function buildMoneyFlags(input: {
  window: MoneyWindow;
  standings: MoneyStandings;
  fuel: MoneyFuelTx[];
  tolls: MoneyTollTx[];
}): MoneyFlag[] {
  const flags: MoneyFlag[] = [];
  const fuelById = new Map(input.fuel.map((tx) => [tx.id, tx]));
  const report = scoreFuelAudit(input.fuel.map(toAuditRow), auditWindow(input.window));
  for (const flag of report.flags) {
    const kind: MoneyFlagKind =
      flag.kind === "duplicate" ? "duplicate_fuel" : flag.kind === "too_often" ? "fuel_too_often" : "fuel_overspend";
    const first = flag.txs[0];
    const source = first ? fuelById.get(first.id) : undefined;
    const href = source ? fuelEvidenceHref(source.occurredAt, source.truckId) : null;
    const who = [flag.driverName, flag.unit ? `unit ${flag.unit}` : ""].filter(Boolean).join(", ");
    flags.push({
      id: `${kind}-${flag.subjectKey}-${flag.reason}-${first?.id ?? flag.score}`,
      kind,
      title: FLAG_TITLES[kind],
      detail: `${who}. ${flag.metric}. ${flag.why}.`,
      href,
      hrefLabel: href ? "Open in Fuel" : null,
    });
  }

  for (const tx of input.fuel) {
    if (tx.truckId != null || !instantInWindow(tx.occurredAt, input.window)) continue;
    const amount = finiteAmount(tx.amount);
    const when = deskDate(tx.occurredAt);
    flags.push({
      id: `unassigned-fuel-${tx.id}`,
      kind: "unassigned_fuel",
      title: FLAG_TITLES.unassigned_fuel,
      detail: `Fuel #${tx.id}${when ? ` on ${when}` : ""}${amount == null ? "" : `, ${formatDeskMoney(amount)}`}${tx.location ? `, ${tx.location}` : ""}. No truck on the transaction.`,
      href: fuelEvidenceHref(tx.occurredAt, null),
      hrefLabel: "Open in Fuel",
    });
  }

  for (const tx of input.tolls) {
    if (tx.truckId != null || !instantInWindow(tx.occurredAt, input.window)) continue;
    const amount = finiteAmount(tx.amount);
    const when = deskDate(tx.occurredAt);
    flags.push({
      id: `unassigned-toll-${tx.id}`,
      kind: "unassigned_toll",
      title: FLAG_TITLES.unassigned_toll,
      detail: `Toll #${tx.id}${when ? ` on ${when}` : ""}${amount == null ? "" : `, ${formatDeskMoney(amount)}`}${tx.plaza ? `, ${tx.plaza}` : ""}. No truck on the transaction.`,
      href: tollEvidenceHref(tx.occurredAt, null),
      hrefLabel: "Open in Tolls",
    });
  }

  const cpmValues = input.standings.rows
    .map((row) => row.cpm)
    .filter((value): value is number => value != null && value > 0);
  const cpmMedian = cpmValues.length >= 4 ? median(cpmValues) : null;
  if (cpmMedian != null && cpmMedian > 0) {
    for (const row of input.standings.rows) {
      if (row.cpm == null || row.cpm < cpmMedian * 1.75 || row.cpm < cpmMedian + 0.05) continue;
      flags.push({
        id: `outlier-cpm-${row.truckId}`,
        kind: "outlier_cpm",
        title: FLAG_TITLES.outlier_cpm,
        detail: `Unit ${row.unit}, ${row.driverName}. CPM ${formatDeskCpm(row.cpm)} vs fleet median ${formatDeskCpm(cpmMedian)}.`,
        href: `/fleet/trucks/${row.truckId}`,
        hrefLabel: "Open truck",
      });
    }
  }

  for (const row of input.standings.rows) {
    if (row.margin == null || row.margin >= -0.005) continue;
    const href = row.fuel > 0 ? fuelEvidenceHref(input.window.fromIso, row.truckId) : row.tolls > 0 ? tollEvidenceHref(input.window.fromIso, row.truckId) : `/fleet/trucks/${row.truckId}`;
    flags.push({
      id: `negative-${row.truckId}`,
      kind: "negative_contribution",
      title: FLAG_TITLES.negative_contribution,
      detail: `Unit ${row.unit}, ${row.driverName}. Revenue ${formatDeskMoney(row.revenue)}, burns ${formatDeskMoney(row.burns)}, contribution ${formatDeskMoney(row.margin)}.`,
      href,
      hrefLabel: row.fuel > 0 ? "Open in Fuel" : row.tolls > 0 ? "Open in Tolls" : "Open truck",
    });
  }

  flags.sort((left, right) => FLAG_ORDER.indexOf(left.kind) - FLAG_ORDER.indexOf(right.kind) || left.detail.localeCompare(right.detail));
  return flags.slice(0, 40);
}

export function cashSketchWeekStarts(now = new Date()): string[] {
  const first = localWeekRange(now).startYmd;
  const starts: string[] = [];
  for (let i = 0; i < 13; i += 1) starts.push(addYmdDays(first, i * 7));
  return starts;
}

export function buildCashSketch(input: {
  now?: Date;
  loads: MoneyLoad[];
  fuel: Array<Pick<MoneyFuelTx, "occurredAt" | "amount">>;
  tolls: Array<Pick<MoneyTollTx, "occurredAt" | "amount">>;
}): CashSketch {
  const now = input.now ?? new Date();
  const starts = cashSketchWeekStarts(now);
  const weeks = starts.map((startYmd) => {
    const endYmd = addYmdDays(startYmd, 6);
    const range = localWeekRange(startYmd);
    return {
      startYmd,
      endYmd,
      label: startYmd === starts[0] ? `This week, ${rangeLabel(startYmd, endYmd)}` : rangeLabel(startYmd, endYmd),
      fromIso: range.start.toISOString(),
      toIso: range.end.toISOString(),
      invoiced: 0,
      expected: 0,
      fuel: 0,
      tolls: 0,
      receivableCount: 0,
      burnCount: 0,
    };
  });
  const byStart = new Map(weeks.map((week) => [week.startYmd, week]));

  let paidInSketch = 0;
  let missingDate = 0;
  let missingRate = 0;
  for (const load of input.loads) {
    if (load.status === "cancelled" || load.nonRevenue) continue;
    const earned = loadEarnedAt(load);
    const placedAt = load.invoiced ? load.invoiceAt || earned : earned;
    const weekStart = placedAt && Number.isFinite(Date.parse(placedAt)) ? localWeekRange(new Date(placedAt)).startYmd : "";
    const inSketch = weekStart ? byStart.has(weekStart) : false;
    if (load.invoicePaid) {
      if (inSketch) paidInSketch += 1;
      continue;
    }
    const rate = finiteAmount(load.rate);
    const open = !["delivered", "completed", "cancelled", "accounting"].includes(load.status);
    if (rate == null) {
      if (inSketch) missingRate += 1;
      continue;
    }
    if (rate === 0) continue;
    if (!placedAt || !Number.isFinite(Date.parse(placedAt))) {
      if (open) missingDate += 1;
      continue;
    }
    const bucket = byStart.get(weekStart);
    if (!bucket) continue;
    if (load.invoiced) bucket.invoiced = round2(bucket.invoiced + rate);
    else bucket.expected = round2(bucket.expected + rate);
    bucket.receivableCount += 1;
  }

  for (const tx of input.fuel) {
    const amount = finiteAmount(tx.amount);
    if (amount == null || amount === 0 || !Number.isFinite(Date.parse(tx.occurredAt))) continue;
    const bucket = byStart.get(localWeekRange(new Date(tx.occurredAt)).startYmd);
    if (!bucket) continue;
    bucket.fuel = round2(bucket.fuel + amount);
    bucket.burnCount += 1;
  }
  for (const tx of input.tolls) {
    const amount = finiteAmount(tx.amount);
    if (amount == null || amount === 0 || !Number.isFinite(Date.parse(tx.occurredAt))) continue;
    const bucket = byStart.get(localWeekRange(new Date(tx.occurredAt)).startYmd);
    if (!bucket) continue;
    bucket.tolls = round2(bucket.tolls + amount);
    bucket.burnCount += 1;
  }

  const notes: string[] = [];
  if (paidInSketch) notes.push(`${paidInSketch} load${paidInSketch === 1 ? "" : "s"} marked paid in these weeks. Left out of the sketch.`);
  if (missingDate) notes.push(`${missingDate} load${missingDate === 1 ? "" : "s"} with a rate and no delivery or pickup date. Not placed.`);
  if (missingRate) notes.push(`${missingRate} load${missingRate === 1 ? "" : "s"} without a rate. Not placed.`);

  return {
    banner: CASH_SKETCH_BANNER,
    heading: "13-week cash sketch",
    notes,
    weeks: weeks.map((week) => {
      const receivables = round2(week.invoiced + week.expected);
      const burns = round2(week.fuel + week.tolls);
      const hasReceivables = week.receivableCount > 0;
      const hasBurns = week.burnCount > 0;
      const status: CashWeekStatus = hasReceivables && hasBurns ? "both" : hasReceivables || hasBurns ? "partial" : "gap";
      const note =
        status === "gap"
          ? "Gap. No receivables or burns on file."
          : status === "partial"
            ? hasReceivables
              ? "No fuel or tolls on file."
              : "No receivables on file."
            : "Sketch net. Not a bank balance.";
      return {
        startYmd: week.startYmd,
        endYmd: week.endYmd,
        label: week.label,
        invoiced: week.invoiced,
        expected: week.expected,
        receivables,
        fuel: week.fuel,
        tolls: week.tolls,
        burns,
        receivableCount: week.receivableCount,
        burnCount: week.burnCount,
        status,
        net: status === "both" ? round2(receivables - burns) : null,
        note,
      };
    }),
  };
}

export function matchMoneyAsk(question: string): MoneyAskId | null {
  const text = question.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
  if (!text) return null;
  if (text === "least-last-quarter" || text === "fleet-cpm-this-week" || text === "fleet-cpm-closed-week") return text;
  const least = /\b(least|lowest|worst)\b/.test(text) && /\bquarter\b/.test(text);
  if (least || /made the least money/.test(text)) return "least-last-quarter";
  const cpm = /\bcpm\b/.test(text) || /cost per mile/.test(text);
  if (!cpm) return null;
  if (/\b(last closed|closed week|last week|prior week|previous week)\b/.test(text)) return "fleet-cpm-closed-week";
  if (/\b(this week|current week)\b/.test(text)) return "fleet-cpm-this-week";
  return null;
}

export function unmatchedMoneyAsk(question: string): string {
  const text = question.toLowerCase();
  if (/\bcpm\b/.test(text) || /cost per mile/.test(text)) {
    return "Fleet CPM needs a period tied to Samsara miles. Ask for this week, or the last closed week.";
  }
  return "I can only answer from numbers already in the TMS, and only for a few questions: fleet CPM this week, fleet CPM for the last closed week, or which truck made the least money last quarter.";
}

export function windowForMoneyAsk(id: MoneyAskId, now = new Date()): MoneyWindow {
  if (id === "fleet-cpm-this-week") return weekMoneyWindow(localWeekRange(now).startYmd, now);
  if (id === "fleet-cpm-closed-week") return weekMoneyWindow(closedOfficeWeekStart(now), now);
  return previousQuarterWindow(now);
}

export function describeFleetCpm(standings: MoneyStandings): string {
  const label = standings.window.label;
  if (standings.fleet.cpm == null) {
    if (standings.fleet.miles == null) {
      return `Fleet CPM for ${label} is not available. No Samsara miles on active trucks. Burns on file: ${formatDeskMoney(standings.fleet.burns)}.`;
    }
    return `Fleet CPM for ${label} is not available. Samsara miles did not produce a usable delta. Burns on file: ${formatDeskMoney(standings.fleet.burns)}.`;
  }
  return `Fleet CPM for ${label} is ${formatDeskCpm(standings.fleet.cpm)}. Burns ${formatDeskMoney(standings.fleet.burns)} over ${formatDeskMiles(standings.fleet.miles)} Samsara miles. Active trucks only.`;
}

export function describeLeastContribution(standings: MoneyStandings): string {
  const scored = standings.rows.filter((row) => row.margin != null);
  if (!scored.length) {
    return `No active truck has a contribution number for ${standings.window.label}. Contribution needs load revenue on the truck. Burns alone are not treated as money made.`;
  }
  const least = Math.min(...scored.map((row) => row.margin ?? 0));
  const rows = scored.filter((row) => Math.abs((row.margin ?? 0) - least) < 0.005);
  const bits = rows.map(
    (row) =>
      `unit ${row.unit} (${row.driverName}), revenue ${formatDeskMoney(row.revenue)}, burns ${formatDeskMoney(row.burns)}, contribution ${formatDeskMoney(row.margin)}`,
  );
  const lead = rows.length > 1 ? `${rows.length} trucks tied for least contribution` : "Least contribution";
  return `${lead} in ${standings.window.label}: ${bits.join("; ")}. Active trucks only.`;
}

export type MoneyDeskModel = {
  window: MoneyWindow;
  includeInactive: boolean;
  standings: MoneyStandings;
  flags: MoneyFlag[];
  cash: CashSketch;
  weekChoices: MoneyChoice[];
  monthChoices: MoneyChoice[];
  quarterChoices: MoneyChoice[];
  ask: { question: string; answer: string; matched: boolean } | null;
  tollsNote: string;
  fuelNote: string;
};
