import { DISPLAY_TIME_ZONE, ymdInTimeZone } from "./format";
import {
  addYmdDays,
  isTruckDieselCategory,
  localWeekRange,
  normalizeUnit,
  startOfLocalMonth,
  zonedWallToUtc,
} from "./fuel";
import { engineHoursForDriverWindow } from "./engine-hours";
import {
  isDriverLoginEligible,
  listDrivers,
  listTruckEngineHourReadings,
  listTrucks,
  type TruckEngineHourReading,
} from "./queries";
import { listFuelTransactions } from "./fuel-store";

/** Rough idle burn. Shown in the UI so it is not confused with billed fuel. */
export const IDLE_FUEL_GAL_PER_HOUR = 1;

export const IDLE_FUEL_ESTIMATE_NOTE =
  "Rough. 1.0 gal/hr x avg paid FleetOne. Not the fuel bill. Blank if idle hours or a paid price is missing.";

export type IdleFuelWindow = "day" | "week" | "month";

export type FuelFillPrice = {
  occurred_at: string;
  driver_id?: number | null;
  truck_id?: number | null;
  category: string;
  gallons: number | null;
  amount: number | null;
  price_per_gallon: number | null;
};

export type PaidFleetOnePpg = {
  ppg: number | null;
  method: "amount_per_gallon" | "ppg_average" | null;
  fillCount: number;
};

export type IdleFuelQuote = {
  subjectKey: string;
  driverId: number | null;
  unit: string;
  ppg: number | null;
};

export type IdleFuelDriverCell = {
  driverId: number | null;
  driverName: string;
  unit: string;
  truckId: number | null;
  idleHours: number | null;
  ppg: number | null;
  cost: number | null;
};

export type IdleFuelWindowTotal = {
  period: IdleFuelWindow;
  label: string;
  fromIso: string;
  toIso: string;
  current: boolean;
  priceCite: string;
  fleetIdleHours: number | null;
  fleetCost: number | null;
  rows: IdleFuelDriverCell[];
};

export type IdleFuelCostBoard = {
  galPerHour: typeof IDLE_FUEL_GAL_PER_HOUR;
  note: string;
  windows: IdleFuelWindowTotal[];
  drivers: Array<{
    driverId: number | null;
    driverName: string;
    unit: string;
    day: IdleFuelDriverCell;
    week: IdleFuelDriverCell;
    month: IdleFuelDriverCell;
  }>;
};

function roundPpg(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** idle hours × 1.0 gal/hr × paid $/gal. Missing hours or missing price stays blank. */
export function estimateIdleFuelCost(
  idleHours: number | null | undefined,
  ppg: number | null | undefined,
): number | null {
  if (idleHours == null || !Number.isFinite(idleHours) || idleHours < 0) return null;
  if (ppg == null || !Number.isFinite(ppg) || !(ppg > 0)) return null;
  return roundMoney(idleHours * IDLE_FUEL_GAL_PER_HOUR * ppg);
}

/**
 * Price MS Express actually paid on truck-diesel fills.
 * Prefer amount / gallons for the fills in hand. If those are missing, average the stored PPG.
 * No usable price returns null. There is no default $/gal.
 */
export function paidFleetOnePpg(fills: FuelFillPrice[]): PaidFleetOnePpg {
  const diesel = fills.filter((row) => isTruckDieselCategory(row.category));
  const tickets = diesel.filter(
    (row) =>
      row.gallons != null &&
      Number.isFinite(row.gallons) &&
      row.gallons > 0 &&
      row.amount != null &&
      Number.isFinite(row.amount) &&
      row.amount > 0,
  );
  if (tickets.length) {
    const gallons = tickets.reduce((sum, row) => sum + (row.gallons ?? 0), 0);
    const amount = tickets.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    if (gallons > 0 && amount > 0) {
      return { ppg: roundPpg(amount / gallons), method: "amount_per_gallon", fillCount: tickets.length };
    }
  }
  const ppgs = diesel
    .map((row) => row.price_per_gallon)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  if (!ppgs.length) return { ppg: null, method: null, fillCount: 0 };
  const avg = ppgs.reduce((sum, value) => sum + value, 0) / ppgs.length;
  return { ppg: roundPpg(avg), method: "ppg_average", fillCount: ppgs.length };
}

export function idleFuelPriceCite(period: IdleFuelWindow, current: boolean): string {
  if (period === "day") return current ? "avg paid FleetOne today" : "avg paid FleetOne that day";
  if (period === "week") return current ? "avg paid FleetOne this week" : "avg paid FleetOne that week";
  return current ? "avg paid FleetOne this month" : "avg paid FleetOne that month";
}

export function localDayRange(anchor: Date): { start: Date; end: Date; startYmd: string } {
  const startYmd = ymdInTimeZone(anchor, DISPLAY_TIME_ZONE);
  return {
    start: zonedWallToUtc(startYmd, 0, 0, 0),
    end: zonedWallToUtc(addYmdDays(startYmd, 1), 0, 0, 0),
    startYmd,
  };
}

export function localMonthRange(anchor: Date): { start: Date; end: Date; startYmd: string; endYmd: string } {
  const start = startOfLocalMonth(anchor);
  const startYmd = ymdInTimeZone(start, DISPLAY_TIME_ZONE);
  const [year, month] = startYmd.split("-").map(Number);
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return {
    start,
    end: zonedWallToUtc(nextMonth, 0, 0, 0),
    startYmd,
    endYmd: addYmdDays(nextMonth, -1),
  };
}

export function idleFuelWindows(
  anchor: Date,
  now = new Date(),
): Array<{ period: IdleFuelWindow; label: string; fromIso: string; toIso: string; current: boolean }> {
  const day = localDayRange(anchor);
  const week = localWeekRange(anchor);
  const month = localMonthRange(anchor);
  const specs = [
    { period: "day" as const, labelCurrent: "Today", labelPast: "That day", start: day.start, end: day.end },
    { period: "week" as const, labelCurrent: "This week", labelPast: "That week", start: week.start, end: week.end },
    { period: "month" as const, labelCurrent: "This month", labelPast: "That month", start: month.start, end: month.end },
  ];
  return specs.map((spec) => {
    const current = now.getTime() >= spec.start.getTime() && now.getTime() < spec.end.getTime();
    return {
      period: spec.period,
      label: current ? spec.labelCurrent : spec.labelPast,
      fromIso: spec.start.toISOString(),
      toIso: spec.end.toISOString(),
      current,
    };
  });
}

/** One Samsara history pull that covers today, the NY week, and the month. End is not in the future. */
export function idleFuelHydrateRange(anchor: Date, now = new Date()): { fromIso: string; toIso: string } {
  const windows = idleFuelWindows(anchor, now);
  const start = Math.min(...windows.map((window) => Date.parse(window.fromIso)));
  const end = Math.max(...windows.map((window) => Date.parse(window.toIso)));
  const to = Math.min(end, now.getTime());
  return { fromIso: new Date(start).toISOString(), toIso: new Date(to).toISOString() };
}

function inPriceWindow(occurredAt: string, fromIso: string, toIso: string): boolean {
  return occurredAt >= fromIso && occurredAt < toIso;
}

export function fillsForDriverPrice(
  fills: FuelFillPrice[],
  driverId: number | null,
  truckId: number | null,
  fromIso: string,
  toIso: string,
): FuelFillPrice[] {
  return fills.filter((row) => {
    if (!inPriceWindow(row.occurred_at, fromIso, toIso)) return false;
    if (driverId != null && row.driver_id === driverId) return true;
    if (truckId != null && row.truck_id === truckId && (row.driver_id == null || row.driver_id === driverId)) return true;
    return false;
  });
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!known.length) return null;
  return roundMoney(known.reduce((sum, value) => sum + value, 0));
}

function truckForDriver(
  driver: { id: number; truck_id?: number | null; truck_unit?: string | null },
  trucks: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>,
) {
  return (
    (driver.truck_id ? trucks.find((truck) => truck.id === driver.truck_id) : undefined) ??
    trucks.find((truck) => truck.assigned_driver_id === driver.id)
  );
}

export function quoteIdleFuelForSubject(
  subject: { key: string; driverId: number | null; unit: string },
  rows: IdleFuelQuote[],
): IdleFuelQuote | null {
  if (subject.driverId != null) {
    const byDriver = rows.find((row) => row.driverId === subject.driverId);
    if (byDriver) return byDriver;
  }
  const unit = normalizeUnit(subject.unit);
  if (unit) {
    const byUnit = rows.find((row) => normalizeUnit(row.unit) === unit);
    if (byUnit) return byUnit;
  }
  return rows.find((row) => row.subjectKey === subject.key) ?? null;
}

export function buildIdleFuelCostBoard(
  anchor = new Date(),
  input?: {
    now?: Date;
    fills?: FuelFillPrice[];
    readings?: TruckEngineHourReading[];
    trucks?: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>;
    drivers?: Array<{
      id: number;
      name: string;
      truck_id?: number | null;
      truck_unit?: string | null;
      active: number;
      termination_date?: string | null;
    }>;
  },
): IdleFuelCostBoard {
  const now = input?.now ?? new Date();
  const fills = input?.fills ?? listFuelTransactions();
  const readings = input?.readings ?? listTruckEngineHourReadings();
  const trucks = input?.trucks ?? listTrucks();
  const drivers = (input?.drivers ?? listDrivers()).filter((driver) => isDriverLoginEligible(driver));
  const windows = idleFuelWindows(anchor, now).map((window) => {
    const rows: IdleFuelDriverCell[] = drivers.map((driver) => {
      const truck = truckForDriver(driver, trucks);
      const hours = engineHoursForDriverWindow(readings, truck?.id, window.fromIso, window.toIso);
      const ppg = paidFleetOnePpg(
        fillsForDriverPrice(fills, driver.id, truck?.id ?? null, window.fromIso, window.toIso),
      ).ppg;
      return {
        driverId: driver.id,
        driverName: driver.name,
        unit: truck?.unit_number || driver.truck_unit || "",
        truckId: truck?.id ?? null,
        idleHours: hours.idleHours,
        ppg,
        cost: estimateIdleFuelCost(hours.idleHours, ppg),
      };
    });
    return {
      ...window,
      priceCite: idleFuelPriceCite(window.period, window.current),
      fleetIdleHours: sumKnown(rows.map((row) => row.idleHours)),
      fleetCost: sumKnown(rows.map((row) => row.cost)),
      rows,
    };
  });
  const [day, week, month] = windows;
  const driversOut = (day?.rows ?? [])
    .map((row, index) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      unit: row.unit,
      day: row,
      week: week?.rows[index] ?? row,
      month: month?.rows[index] ?? row,
    }))
    .filter(
      (row) =>
        row.day.idleHours != null ||
        row.week.idleHours != null ||
        row.month.idleHours != null,
    );
  return {
    galPerHour: IDLE_FUEL_GAL_PER_HOUR,
    note: IDLE_FUEL_ESTIMATE_NOTE,
    windows,
    drivers: driversOut,
  };
}

export function weekIdleFuelQuotes(
  subjects: Array<{ subjectKey: string; driverId: number | null; unit: string; truckId: number | null }>,
  fills: FuelFillPrice[],
  window: { fromIso: string; toIso: string },
): IdleFuelQuote[] {
  return subjects.map((subject) => ({
    subjectKey: subject.subjectKey,
    driverId: subject.driverId,
    unit: subject.unit,
    ppg: paidFleetOnePpg(fillsForDriverPrice(fills, subject.driverId, subject.truckId, window.fromIso, window.toIso)).ppg,
  }));
}
