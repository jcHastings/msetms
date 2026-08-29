import { getDb } from "./db";
import { canonicalFleetKey, unitDigits } from "./fleet-import-shared";
import { listFuelRollups, listFuelTransactions } from "./fuel-store";
import { getReeferSnapshots, latestReeferForTrailer, normalizeKey, type ReeferSnapshot } from "./integrations/orbcomm";
import { listLoads, listTrailers, listTruckOdometerReadings, listTrucks } from "./queries";
import { officialEmptyMiles, routeGuideFromLoad } from "./routing-shared";
import type { LoadView, ReeferReading } from "./types";

export type MikeTmsStatsKind = "top_customer" | "driver_billed" | "miles_week";

export type MikeTmsStatsQuestion = {
  kind: MikeTmsStatsKind;
  year: number;
  month?: number;
  weekStart: string;
  weekEnd: string;
};

export type MikeTmsNamedTotal = {
  name: string;
  unit: string | null;
  total: number;
  loads: number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfWeekMonday(now: Date): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

export function weekBounds(now: Date): { start: string; end: string } {
  const start = startOfWeekMonday(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: ymd(start), end: ymd(end) };
}

function loadDate(load: LoadView): string {
  return String(load.pickup_start || load.delivery_start || load.created_at || "").slice(0, 10);
}

function countableLoad(load: LoadView): boolean {
  return load.status !== "cancelled" && !load.non_revenue;
}

export function tmsMilesForLoad(load: LoadView): number {
  const loaded = routeGuideFromLoad(load).totalMiles ?? 0;
  const empty = officialEmptyMiles(load.empty_miles, load.empty_source) ?? 0;
  return Math.round((loaded + empty) * 10) / 10;
}

export function parseMikeTmsStatsQuestion(question: string, now = new Date()): MikeTmsStatsQuestion | null {
  const text = question.trim().replace(/[\u2018\u2019]/g, "'");
  if (!text) return null;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
  const week = weekBounds(now);
  if (/\b(top|highest|most)\b.{0,48}\bcustomer/i.test(text) || /\bcustomer\b.{0,32}\b(top|highest|most|rank)/i.test(text)) {
    return { kind: "top_customer", year, weekStart: week.start, weekEnd: week.end };
  }
  if (/\bmiles?\b/i.test(text) && /\b(week|driver|truck|most|highest|top)\b/i.test(text)) {
    return { kind: "miles_week", year, weekStart: week.start, weekEnd: week.end };
  }
  if (
    /\b(highest grossing|grossing|top|most)\b.{0,48}\bdriver/i.test(text) ||
    /\bdriver\b.{0,40}\b(gross|revenue|billed|freight)\b/i.test(text) ||
    /\bgrossing\b/i.test(text)
  ) {
    return { kind: "driver_billed", year, month: now.getMonth() + 1, weekStart: week.start, weekEnd: week.end };
  }
  return null;
}

export function loadStopSummaries(): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  const rows = getDb()
    .prepare(
      `SELECT load_id, city, state, kind FROM load_stops
       ORDER BY load_id, sequence, id`,
    )
    .all() as Array<{ load_id: number; city: string; state: string; kind: string }>;
  for (const row of rows) {
    const place = [row.city, row.state].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
    if (!place) continue;
    const list = grouped.get(row.load_id) ?? [];
    list.push(`${row.kind === "delivery" ? "del" : "pu"} ${place}`);
    grouped.set(row.load_id, list);
  }
  return grouped;
}

function billedLoads(year: number, month?: number): LoadView[] {
  const prefix = month != null ? `${year}-${pad(month)}` : String(year);
  return listLoads({ status: "all" }).filter((load) => countableLoad(load) && loadDate(load).startsWith(prefix));
}

function weekLoads(start: string, end: string): LoadView[] {
  return listLoads({ status: "all" }).filter((load) => {
    if (!countableLoad(load)) return false;
    const day = loadDate(load);
    return day >= start && day <= end;
  });
}

function rollup(
  loads: LoadView[],
  key: (load: LoadView) => { name: string; unit: string | null },
  amount: (load: LoadView) => number,
): MikeTmsNamedTotal[] {
  const map = new Map<string, MikeTmsNamedTotal>();
  for (const load of loads) {
    const ident = key(load);
    const name = ident.name.trim() || "Unassigned";
    const add = amount(load);
    if (!(add > 0)) continue;
    const row = map.get(name) ?? { name, unit: ident.unit, total: 0, loads: 0 };
    row.total = Math.round((row.total + add) * 100) / 100;
    row.loads += 1;
    if (!row.unit && ident.unit) row.unit = ident.unit;
    map.set(name, row);
  }
  return [...map.values()].sort((left, right) => right.total - left.total);
}

export function topCustomersByBilled(year: number): MikeTmsNamedTotal[] {
  return rollup(
    billedLoads(year),
    (load) => ({ name: load.customer_name || "Unknown", unit: null }),
    (load) => load.rate ?? 0,
  );
}

/** Customer/billed rate on assigned loads only. Never OO pay, relay pay, or settlements. */
export function topDriversByBilled(year: number, month: number): MikeTmsNamedTotal[] {
  return rollup(
    billedLoads(year, month).filter((load) => Boolean(load.driver_name?.trim())),
    (load) => ({ name: load.driver_name || "Unassigned", unit: load.truck_unit }),
    (load) => load.rate ?? 0,
  );
}

export function topDriversByTmsMiles(weekStart: string, weekEnd: string): MikeTmsNamedTotal[] {
  return rollup(
    weekLoads(weekStart, weekEnd).filter((load) => Boolean(load.driver_name?.trim())),
    (load) => ({ name: load.driver_name || "Unassigned", unit: load.truck_unit }),
    tmsMilesForLoad,
  );
}

export function buildMikeTmsSnapshot(now = new Date()): {
  topCustomersYear: MikeTmsNamedTotal[];
  topDriversBilledMonth: MikeTmsNamedTotal[];
  topDriversMilesWeek: MikeTmsNamedTotal[];
  fuelRows: number;
  fuel: Array<{ name: string; gallons: number; amount: number }>;
  odometer: Array<{ unit: string; miles: number; recordedAt: string }>;
  note: string;
} {
  const week = weekBounds(now);
  const fuelRows = listFuelTransactions();
  const trucksById = new Map(listTrucks().map((truck) => [truck.id, truck.unit_number]));
  const lastOdo = new Map<number, { miles: number; recordedAt: string }>();
  for (const reading of listTruckOdometerReadings()) {
    lastOdo.set(reading.truck_id, { miles: reading.miles, recordedAt: reading.recorded_at });
  }
  const odometer = [...lastOdo.entries()]
    .map(([truckId, reading]) => {
      const unit = trucksById.get(truckId);
      return unit ? { unit, miles: reading.miles, recordedAt: reading.recordedAt } : null;
    })
    .filter((row): row is { unit: string; miles: number; recordedAt: string } => row != null)
    .slice(0, 20);
  return {
    topCustomersYear: topCustomersByBilled(now.getFullYear()).slice(0, 8),
    topDriversBilledMonth: topDriversByBilled(now.getFullYear(), now.getMonth() + 1).slice(0, 8),
    topDriversMilesWeek: topDriversByTmsMiles(week.start, week.end).slice(0, 8),
    fuelRows: fuelRows.length,
    fuel: fuelRows.length
      ? listFuelRollups(now).slice(0, 8).map((row) => ({
          name: row.name,
          gallons: row.monthGallons,
          amount: row.monthAmount,
        }))
      : [],
    odometer,
    note: "The TMS has no driver Pay tab. Billed freight is the customer/load rate, not pay. Miles are TMS Google loaded + empty miles, not Samsara IFTA.",
  };
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function namedLine(row: MikeTmsNamedTotal, suffix: string): string {
  const unit = row.unit?.trim() ? ` on unit ${row.unit.trim()}` : "";
  return `${row.name}${unit}, ${suffix}`;
}

export function formatMikeTmsStatsReply(question: MikeTmsStatsQuestion, now = new Date()): string {
  if (question.kind === "top_customer") {
    const rows = topCustomersByBilled(question.year);
    if (!rows.length) return `No TMS loads with a customer rate in ${question.year}.`;
    const top = rows[0];
    return `${top.name} is the top customer in ${question.year} at ${money(top.total)} billed freight across ${top.loads} loads.`;
  }
  if (question.kind === "driver_billed") {
    const month = question.month ?? now.getMonth() + 1;
    const rows = topDriversByBilled(question.year, month);
    const label = `${now.toLocaleString("en-US", { month: "long" })} ${question.year}`;
    if (!rows.length) {
      return `The TMS has no driver Pay tab. No assigned drivers have billed freight on TMS loads in ${label}.`;
    }
    const top = rows[0];
    const unit = top.unit?.trim() ? ` on unit ${top.unit.trim()}` : "";
    return `${top.name}${unit} has ${money(top.total)} billed freight this month on ${top.loads} loads. Customer rate from load Financials, not pay.`;
  }
  const rows = topDriversByTmsMiles(question.weekStart, question.weekEnd);
  if (!rows.length) {
    return `No assigned drivers have TMS miles on loads from ${question.weekStart} to ${question.weekEnd}. Those are TMS loaded + empty miles, not Samsara IFTA.`;
  }
  const top = rows[0];
  return `${namedLine(top, `${top.total.toLocaleString("en-US")} TMS miles this week`)} across ${top.loads} loads. Those are TMS miles, not Samsara IFTA.`;
}

export function answerMikeTmsQuestion(question: string, now = new Date()): string | null {
  const parsed = parseMikeTmsStatsQuestion(question, now);
  if (!parsed) return null;
  return formatMikeTmsStatsReply(parsed, now);
}

export function parseMikeReeferQuestion(question: string): string | null {
  const text = question.trim();
  const match =
    text.match(/\b(?:reefer|temp(?:erature)?)\b.{0,64}\b(?:trailer\s*)?([A-Za-z]{0,6}\d{2,6})\b/i) ||
    text.match(/\btrailer\s+([A-Za-z]{0,6}\d{2,6})\b.{0,64}\b(?:reefer|temp)/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export function sameTrailerUnit(left: string, right: string): boolean {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (canonicalFleetKey(left) === canonicalFleetKey(right)) return true;
  const digitsA = unitDigits(left);
  const digitsB = unitDigits(right);
  if (!digitsA || !digitsB || digitsA !== digitsB || digitsA.length < 3) return false;
  const prefixA = a.replace(/\d+/g, "");
  const prefixB = b.replace(/\d+/g, "");
  return !prefixA || !prefixB || prefixA === prefixB;
}

function reeferModeLabel(raw: string | null | undefined): string {
  if (raw && /start/i.test(raw) && /stop/i.test(raw)) return "Start/Stop";
  return "Continuous";
}

export function formatMikeReeferReply(input: {
  unit: string;
  setpointF: number | null;
  returnF: number | null;
  mode?: string;
  city?: string | null;
}): string {
  if (input.setpointF == null && input.returnF == null) {
    return `Trailer ${input.unit} is on the roster, but Orbcomm has no setpoint or return temp yet.`;
  }
  const setpoint = input.setpointF != null ? `${input.setpointF}°F` : "no setpoint";
  const ret = input.returnF != null ? `${input.returnF}°F` : "no return";
  const city = input.city?.trim() ? ` Last city ${input.city.trim()}.` : "";
  return `Trailer ${input.unit}: setpoint ${setpoint}, return ${ret}, ${reeferModeLabel(input.mode)}.${city}`;
}

export function reeferFromStoredReading(unit: string, reading: ReeferReading | null, fallbackSetpoint: number | null = null) {
  return formatMikeReeferReply({
    unit,
    setpointF: reading?.setpoint_f ?? fallbackSetpoint,
    returnF: reading?.return_air_f ?? reading?.temperature_f ?? null,
    mode: reading?.operating_mode,
    city: reading?.address,
  });
}

function latestStoredReeferForAsk(asked: string, trailer: { unit_number: string; orbcomm_asset_id: string } | null): ReeferReading | null {
  if (trailer) {
    const mapped = latestReeferForTrailer(trailer);
    if (mapped) return mapped;
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM reefer_readings
       WHERE trailer_id != ''
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all() as ReeferReading[];
  return (
    rows.find(
      (row) =>
        sameTrailerUnit(row.trailer_id, asked) ||
        Boolean(trailer && (sameTrailerUnit(row.trailer_id, trailer.unit_number) || sameTrailerUnit(row.trailer_id, trailer.orbcomm_asset_id))),
    ) ?? null
  );
}

export async function answerMikeReeferQuestion(
  question: string,
  liveReadings: ReeferSnapshot[] = [],
): Promise<string | null> {
  const asked = parseMikeReeferQuestion(question);
  if (!asked) return null;
  const trailer =
    listTrailers().find(
      (row) => sameTrailerUnit(row.unit_number, asked) || sameTrailerUnit(row.orbcomm_asset_id, asked),
    ) ?? null;
  const loadTrailer =
    listLoads({ status: "all" }).find(
      (load) => sameTrailerUnit(load.trailer_unit || "", asked) || sameTrailerUnit(load.trailer_number || "", asked),
    ) ?? null;
  const stored = latestStoredReeferForAsk(asked, trailer);
  const live = liveReadings.find(
    (reading) =>
      sameTrailerUnit(reading.trailerId, asked) ||
      Boolean(
        trailer &&
          (sameTrailerUnit(reading.trailerId, trailer.unit_number) ||
            sameTrailerUnit(reading.trailerId, trailer.orbcomm_asset_id)),
      ),
  );
  const unit = trailer?.unit_number || loadTrailer?.trailer_unit || loadTrailer?.trailer_number || asked;
  if (!trailer && !stored && !live && !loadTrailer) {
    return `No trailer ${asked} in the TMS roster or Orbcomm readings.`;
  }
  return formatMikeReeferReply({
    unit,
    setpointF: live?.setpointF ?? stored?.setpoint_f ?? trailer?.reefer_setpoint_f ?? null,
    returnF: live?.returnAirF ?? live?.temperatureF ?? stored?.return_air_f ?? stored?.temperature_f ?? null,
    mode: live?.operatingMode || stored?.operating_mode,
    city: live?.address || stored?.address,
  });
}

export async function answerMikeReeferFromOrbcomm(question: string): Promise<string | null> {
  if (!parseMikeReeferQuestion(question)) return null;
  try {
    const snapshots = await getReeferSnapshots();
    return answerMikeReeferQuestion(question, snapshots.readings);
  } catch {
    return answerMikeReeferQuestion(question, []);
  }
}
