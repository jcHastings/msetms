import { getDb } from "./db";
import { extractStateCode } from "./locations";
import { parseRouteStateMiles, type RouteStateMile } from "./routing-shared";

export type IftaQuarter = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
};

export type IftaStateFuel = {
  state: string;
  gallons: number;
  amount: number;
};

export type IftaStateMiles = {
  state: string;
  name: string;
  miles: number;
  loadCount: number;
};

export type IftaWaypointReview = {
  loadId: number;
  loadNumber: string;
  lane: string;
  states: RouteStateMile[];
};

export type IftaQuarterEstimate = {
  quarter: IftaQuarter;
  label: string;
  startIso: string;
  endIso: string;
  fuelByState: IftaStateFuel[];
  milesByState: IftaStateMiles[];
  waypoints: IftaWaypointReview[];
  fuelGallons: number;
  fuelAmount: number;
  miles: number;
  loadsWithMiles: number;
  loadsWithoutMiles: number;
};

const QUARTER_LABELS = ["Q1 Jan–Mar", "Q2 Apr–Jun", "Q3 Jul–Sep", "Q4 Oct–Dec"] as const;

export function currentIftaQuarter(now = new Date()): IftaQuarter {
  return { year: now.getFullYear(), quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 };
}

export function parseIftaQuarter(
  yearRaw?: string | null,
  quarterRaw?: string | null,
  now = new Date(),
): IftaQuarter {
  const fallback = currentIftaQuarter(now);
  const combined = String(yearRaw ?? "").match(/^(\d{4})-([1-4])$/);
  const year = Number.parseInt(combined?.[1] ?? String(yearRaw ?? ""), 10);
  const quarter = Number.parseInt(combined?.[2] ?? String(quarterRaw ?? ""), 10);
  return {
    year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : fallback.year,
    quarter: quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4 ? quarter : fallback.quarter,
  };
}

export function iftaQuarterRange(quarter: IftaQuarter): { start: Date; end: Date; label: string } {
  const start = new Date(quarter.year, (quarter.quarter - 1) * 3, 1, 0, 0, 0, 0);
  const end = new Date(quarter.year, quarter.quarter * 3, 0, 23, 59, 59, 999);
  return { start, end, label: `${QUARTER_LABELS[quarter.quarter - 1]} ${quarter.year}` };
}

export function listIftaQuarterChoices(now = new Date()): IftaQuarter[] {
  const current = currentIftaQuarter(now);
  const choices: IftaQuarter[] = [];
  for (let year = current.year; year >= current.year - 2; year -= 1) {
    const last = year === current.year ? current.quarter : 4;
    for (let quarter = last; quarter >= 1; quarter -= 1) {
      choices.push({ year, quarter: quarter as 1 | 2 | 3 | 4 });
    }
  }
  return choices;
}

export function buildIftaQuarterEstimate(quarter: IftaQuarter): IftaQuarterEstimate {
  const { start, end, label } = iftaQuarterRange(quarter);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const db = getDb();

  const fuelRows = db
    .prepare(
      `SELECT location, gallons, amount FROM fuel_transactions
       WHERE occurred_at >= ? AND occurred_at <= ?`,
    )
    .all(startIso, endIso) as Array<{ location: string; gallons: number | null; amount: number | null }>;

  const fuelMap = new Map<string, IftaStateFuel>();
  for (const row of fuelRows) {
    const state = extractStateCode(row.location || "");
    if (!state) continue;
    const current = fuelMap.get(state) ?? { state, gallons: 0, amount: 0 };
    current.gallons += row.gallons ?? 0;
    current.amount += row.amount ?? 0;
    fuelMap.set(state, current);
  }

  const loads = db
    .prepare(
      `SELECT id, load_number, origin, destination, pickup_start, delivery_end, route_state_miles
       FROM loads
       WHERE status != 'cancelled'
         AND pickup_start <= ? AND delivery_end >= ?`,
    )
    .all(endIso, startIso) as Array<{
    id: number;
    load_number: string;
    origin: string;
    destination: string;
    pickup_start: string;
    delivery_end: string;
    route_state_miles: string;
  }>;

  const mileMap = new Map<string, IftaStateMiles>();
  const waypoints: IftaWaypointReview[] = [];
  let loadsWithMiles = 0;
  let loadsWithoutMiles = 0;

  for (const load of loads) {
    const states = parseRouteStateMiles(load.route_state_miles);
    if (states.length === 0) {
      loadsWithoutMiles += 1;
      continue;
    }
    loadsWithMiles += 1;
    waypoints.push({
      loadId: load.id,
      loadNumber: load.load_number,
      lane: `${load.origin} → ${load.destination}`,
      states,
    });
    for (const row of states) {
      const current = mileMap.get(row.state) ?? { state: row.state, name: row.name, miles: 0, loadCount: 0 };
      current.miles += row.miles;
      current.loadCount += 1;
      if (!current.name) current.name = row.name;
      mileMap.set(row.state, current);
    }
  }

  const fuelByState = [...fuelMap.values()].sort((a, b) => a.state.localeCompare(b.state));
  const milesByState = [...mileMap.values()]
    .map((row) => ({ ...row, miles: Math.round(row.miles * 10) / 10 }))
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    quarter,
    label,
    startIso,
    endIso,
    fuelByState,
    milesByState,
    waypoints,
    fuelGallons: Math.round(fuelByState.reduce((sum, row) => sum + row.gallons, 0) * 1000) / 1000,
    fuelAmount: Math.round(fuelByState.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
    miles: Math.round(milesByState.reduce((sum, row) => sum + row.miles, 0) * 10) / 10,
    loadsWithMiles,
    loadsWithoutMiles,
  };
}
