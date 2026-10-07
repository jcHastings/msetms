import { odometerDeltaMiles } from "./fuel-mpg";
import { addYmdDays, localWeekRange, normalizeUnit } from "./fuel";
import { isSamsaraConfigured } from "./integrations/samsara";
import { isDriverLoginEligible, listDrivers, listTruckOdometerReadings, listTrucks } from "./queries";

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

function truckForDriver(
  driver: { id: number; truck_id?: number | null; truck_unit?: string | null },
  trucks: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>,
) {
  return (
    (driver.truck_id ? trucks.find((truck) => truck.id === driver.truck_id) : undefined) ??
    trucks.find((truck) => truck.assigned_driver_id === driver.id)
  );
}

export function milesFromSamsaraOdometer(
  window: MilesWindow,
  input?: {
    trucks?: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>;
    drivers?: Array<{
      id: number;
      name: string;
      truck_id?: number | null;
      truck_unit?: string | null;
      active: number;
      termination_date?: string | null;
    }>;
    readings?: Array<{ id: number; truck_id: number; recorded_at: string; miles: number; source: string }>;
  },
): MilesReading[] {
  const trucks = input?.trucks ?? listTrucks();
  const drivers = (input?.drivers ?? listDrivers()).filter((driver) => isDriverLoginEligible(driver));
  const readings = (input?.readings ?? listTruckOdometerReadings()).filter((row) => row.source === "samsara");
  const byTruck = new Map<number, typeof readings>();
  for (const row of readings) {
    const list = byTruck.get(row.truck_id) ?? [];
    list.push(row);
    byTruck.set(row.truck_id, list);
  }
  const usedTrucks = new Set<number>();
  const out: MilesReading[] = [];

  for (const driver of drivers) {
    const truck = truckForDriver(driver, trucks);
    const unit = truck?.unit_number || driver.truck_unit || "";
    const delta = truck
      ? odometerDeltaMiles(byTruck.get(truck.id) ?? [], window.fromIso, window.toIso)
      : null;
    if (truck) usedTrucks.add(truck.id);
    out.push({
      subjectKey: `d:${driver.id}`,
      driverId: driver.id,
      driverName: driver.name,
      unit,
      truckId: truck?.id ?? null,
      miles: delta,
      source: delta != null ? MILES_SOURCE_ID : "missing",
      note:
        delta != null
          ? "Samsara odometer delta"
          : truck
            ? "No Samsara odometer pair in this week"
            : "No truck mapped for Samsara odometer",
    });
  }

  for (const truck of trucks) {
    if (usedTrucks.has(truck.id)) continue;
    const delta = odometerDeltaMiles(byTruck.get(truck.id) ?? [], window.fromIso, window.toIso);
    if (delta == null) continue;
    out.push({
      subjectKey: `u:${normalizeUnit(truck.unit_number)}`,
      driverId: truck.assigned_driver_id ?? null,
      driverName: "Unassigned",
      unit: truck.unit_number,
      truckId: truck.id,
      miles: delta,
      source: MILES_SOURCE_ID,
      note: "Samsara odometer delta (unit, no eligible driver)",
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
