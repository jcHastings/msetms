import { odometerDeltaMiles } from "./fuel-mpg";
import { addYmdDays, fuelTruckDriverLabel, localWeekRange, normalizeUnit, type FuelLabelRow, type FuelMatchLoad } from "./fuel";
import { listFuelTransactions } from "./fuel-store";
import { isSamsaraConfigured } from "./integrations/samsara";
import { listDrivers, listLoads, listTruckOdometerReadings, listTrucks } from "./queries";

/** Weekly miles come from Samsara odometer deltas. There is no Ascend miles path. */
export const MILES_SOURCE_ID = "samsara" as const;

export type MilesSourceId = typeof MILES_SOURCE_ID;

export type MilesSourceStatusKind = "live" | "persisted" | "unavailable";

export type MilesWindow = {
  fromIso: string;
  toIso: string;
  startYmd: string;
  endYmd: string;
};

export type MilesReading = {
  subjectKey: string;
  driverId: number | null;
  driverName: string;
  unit: string;
  truckId: number | null;
  miles: number | null;
  source: MilesSourceId | "missing";
  note: string;
};

export type MilesSourceStatus = {
  id: MilesSourceId;
  label: string;
  status: MilesSourceStatusKind;
  note: string;
};

export interface MilesSource {
  id: MilesSourceId;
  status(): MilesSourceStatus;
  milesForWindow(window: MilesWindow): MilesReading[];
}

export function milesWindowForWeek(weekStartYmd: string): MilesWindow {
  const range = localWeekRange(weekStartYmd);
  return {
    fromIso: range.start.toISOString(),
    toIso: range.end.toISOString(),
    startYmd: range.startYmd,
    endYmd: range.endYmd,
  };
}

export function priorFuelWeekStart(weekStartYmd: string): string {
  return localWeekRange(addYmdDays(weekStartYmd, -7)).startYmd;
}

/** Last fully closed America/New_York Mon-Sun week (not the in-progress week). */
export function closedFuelWeekStart(now = new Date()): string {
  return priorFuelWeekStart(localWeekRange(now).startYmd);
}

/** Miles / truck diesel gallons. Zero or missing gallons stay blank. */
export function computeMpg(miles: number | null | undefined, gallons: number | null | undefined): number | null {
  if (miles == null || !Number.isFinite(miles) || miles < 0) return null;
  if (gallons == null || !Number.isFinite(gallons) || !(gallons > 0)) return null;
  return miles / gallons;
}

export function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

export function samsaraMilesSourceStatus(input?: {
  tokenSet?: boolean;
  readingCount?: number;
}): MilesSourceStatus {
  const tokenSet = input?.tokenSet ?? isSamsaraConfigured();
  const readingCount = input?.readingCount ?? listTruckOdometerReadings().filter((row) => row.source === "samsara").length;
  if (!tokenSet && readingCount === 0) {
    return {
      id: MILES_SOURCE_ID,
      label: "Samsara odometer",
      status: "unavailable",
      note: "Samsara token is not set and no odometer readings are on file. Week miles stay blank.",
    };
  }
  if (!tokenSet) {
    return {
      id: MILES_SOURCE_ID,
      label: "Samsara odometer",
      status: "persisted",
      note: "Samsara token is not set. Using stored Samsara odometer readings only.",
    };
  }
  if (readingCount === 0) {
    return {
      id: MILES_SOURCE_ID,
      label: "Samsara odometer",
      status: "live",
      note: "Samsara is connected but no odometer pair exists for this week yet.",
    };
  }
  return {
    id: MILES_SOURCE_ID,
    label: "Samsara odometer",
    status: "live",
    note: "Week miles are Samsara OBD odometer (GPS odometer if OBD is missing) as a start-to-end delta.",
  };
}

export function createFixtureMilesSource(readings: MilesReading[], status?: Partial<MilesSourceStatus>): MilesSource {
  return {
    id: MILES_SOURCE_ID,
    status: () => ({
      id: MILES_SOURCE_ID,
      label: "Samsara odometer",
      status: "persisted",
      note: "Fixture Samsara odometer readings.",
      ...status,
    }),
    milesForWindow: () => readings.map((row) => ({ ...row })),
  };
}

export function milesFromSamsaraOdometer(
  window: MilesWindow,
  input?: {
    trucks?: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>;
    drivers?: Array<{ id: number; name: string }>;
    readings?: Array<{ id: number; truck_id: number; recorded_at: string; miles: number; source: string }>;
    rows?: FuelLabelRow[];
    loads?: FuelMatchLoad[];
  },
): MilesReading[] {
  const trucks = input?.trucks ?? listTrucks();
  const drivers = input?.drivers ?? listDrivers().map((driver) => ({ id: driver.id, name: driver.name }));
  const rows = input?.rows ?? listFuelTransactions();
  const loads = input?.loads ?? listLoads({ status: "all" });
  const readings = (input?.readings ?? listTruckOdometerReadings()).filter((row) => row.source === "samsara");
  const byTruck = new Map<number, typeof readings>();
  for (const row of readings) {
    const list = byTruck.get(row.truck_id) ?? [];
    list.push(row);
    byTruck.set(row.truck_id, list);
  }
  const out: MilesReading[] = [];

  for (const truck of trucks) {
    const delta = odometerDeltaMiles(byTruck.get(truck.id) ?? [], window.fromIso, window.toIso);
    if (delta == null) continue;
    const label = fuelTruckDriverLabel({
      truckId: truck.id,
      unit: truck.unit_number,
      fromIso: window.fromIso,
      toIso: window.toIso,
      rows,
      loads,
      drivers,
    });
    out.push({
      subjectKey: label.driverId != null ? `d:${label.driverId}` : `u:${normalizeUnit(truck.unit_number)}`,
      driverId: label.driverId,
      driverName: label.driverName,
      unit: truck.unit_number,
      truckId: truck.id,
      miles: delta,
      source: MILES_SOURCE_ID,
      note: label.driverId != null ? "Samsara odometer delta" : "Samsara odometer delta (no fuel or load driver)",
    });
  }

  return out;
}

export function persistedSamsaraMilesSource(): MilesSource {
  return {
    id: MILES_SOURCE_ID,
    status: () => samsaraMilesSourceStatus(),
    milesForWindow: (window) => milesFromSamsaraOdometer(window),
  };
}

export function readingForSubject(
  subject: { key: string; driverId: number | null; unit: string },
  readings: MilesReading[],
): MilesReading | null {
  if (subject.driverId != null) {
    const byDriver = readings.find((row) => row.driverId === subject.driverId);
    if (byDriver) return byDriver;
  }
  const unit = normalizeUnit(subject.unit);
  if (unit) {
    const byUnit = readings.find((row) => normalizeUnit(row.unit) === unit);
    if (byUnit) return byUnit;
  }
  return readings.find((row) => row.subjectKey === subject.key) ?? null;
}
