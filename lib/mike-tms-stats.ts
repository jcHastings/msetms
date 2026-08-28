import { listFuelTransactions } from "./fuel-store";
import { listLoads } from "./queries";
import { officialEmptyMiles, routeGuideFromLoad } from "./routing-shared";
import type { LoadView } from "./types";

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
  const text = question.trim();
  if (!text) return null;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
  const week = weekBounds(now);
  if (/\b(top|highest|most)\b.{0,40}\bcustomer/i.test(text) || /\bcustomer\b.{0,24}\b(top|highest|most|rank)/i.test(text)) {
    return { kind: "top_customer", year, weekStart: week.start, weekEnd: week.end };
  }
  if (
    /\b(highest grossing|top|most)\b.{0,40}\bdriver/i.test(text) ||
    /\bdriver\b.{0,32}\b(gross|revenue|billed|freight)/i.test(text)
  ) {
    if (/\bmiles?\b/i.test(text)) {
      return { kind: "miles_week", year, weekStart: week.start, weekEnd: week.end };
    }
    return { kind: "driver_billed", year, month: now.getMonth() + 1, weekStart: week.start, weekEnd: week.end };
  }
  if (/\b(most|highest|top)\b.{0,32}\bmiles?\b/i.test(text) || /\bmiles?\b.{0,24}\b(week|driver)\b/i.test(text)) {
    return { kind: "miles_week", year, weekStart: week.start, weekEnd: week.end };
  }
  return null;
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
  note: string;
} {
  const week = weekBounds(now);
  return {
    topCustomersYear: topCustomersByBilled(now.getFullYear()).slice(0, 8),
    topDriversBilledMonth: topDriversByBilled(now.getFullYear(), now.getMonth() + 1).slice(0, 8),
    topDriversMilesWeek: topDriversByTmsMiles(week.start, week.end).slice(0, 8),
    fuelRows: listFuelTransactions().length,
    note: "Billed freight is the customer/load rate, not driver pay. Miles are TMS Google loaded + empty miles, not Samsara IFTA.",
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
      return `No assigned drivers have billed freight on TMS loads in ${label}. This is billed freight (customer rate), not driver pay.`;
    }
    const top = rows[0];
    return `${namedLine(top, `${money(top.total)} billed freight this month`)} across ${top.loads} loads. That is billed freight, not driver pay.`;
  }
  const rows = topDriversByTmsMiles(question.weekStart, question.weekEnd);
  if (!rows.length) {
    return `No assigned drivers have TMS miles on loads from ${question.weekStart} to ${question.weekEnd}. Those are TMS loaded + empty miles, not Samsara IFTA.`;
  }
  const top = rows[0];
  return `${namedLine(top, `${top.total.toLocaleString("en-US")} TMS miles this week`)} across ${top.loads} loads. Those are TMS miles, not Samsara IFTA.`;
}
