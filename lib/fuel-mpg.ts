import { DISPLAY_TIME_ZONE, ymdInTimeZone } from "./format";
import { addYmdDays, isTruckDieselCategory, startOfLocalMonth, startOfLocalWeek } from "./fuel";
import { listFuelTransactions } from "./fuel-store";
import {
  isDriverLoginEligible,
  listDrivers,
  listLoads,
  listTruckOdometerReadings,
  listTrucks,
  type TruckOdometerReading,
} from "./queries";
import { officialEmptyMiles, routeGuideFromLoad } from "./routing-shared";
import type { LoadView } from "./types";

export type DriverMpgPeriod = "week" | "month";

export type DriverMpgRow = {
  driverId: number;
  driverName: string;
  truckUnit: string;
  gallons: number;
  miles: number | null;
  mpg: number | null;
};

export type DriverMpgBoard = {
  period: DriverMpgPeriod;
  startYmd: string;
  endYmd: string;
  rows: DriverMpgRow[];
};

export function parseDriverMpgPeriod(value: string | undefined): DriverMpgPeriod {
  return value === "month" ? "month" : "week";
}

export function odometerDeltaMiles(
  readings: TruckOdometerReading[],
  startIso: string,
  endIso: string,
): number | null {
  const inWindow = readings.filter((row) => row.recorded_at >= startIso && row.recorded_at <= endIso);
  const startReading =
    [...readings].reverse().find((row) => row.recorded_at <= startIso) ?? inWindow[0] ?? null;
  const endReading =
    [...readings].reverse().find((row) => row.recorded_at <= endIso && row.recorded_at >= startIso) ??
    [...readings].reverse().find((row) => row.recorded_at <= endIso) ??
    null;
  if (!startReading || !endReading || startReading.id === endReading.id) return null;
  const delta = endReading.miles - startReading.miles;
  if (!(delta > 0) || delta > 20_000) return null;
  return delta;
}

export function loadTouchesMpgWindow(
  load: Pick<LoadView, "pickup_start" | "pickup_end" | "delivery_start" | "delivery_end" | "status">,
  startIso: string,
  endIso: string,
): boolean {
  if (load.status === "cancelled") return false;
  const start = load.pickup_start || load.delivery_start || "";
  const end = load.delivery_end || load.pickup_end || start;
  if (!start) return false;
  return start <= endIso && end >= startIso;
}

export function officialGoogleMilesForLoad(
  load: Pick<
    LoadView,
    | "route_miles"
    | "route_leg_miles"
    | "route_state_miles"
    | "route_calculated_at"
    | "route_source"
    | "route_polyline"
    | "empty_miles"
    | "empty_source"
  >,
): number | null {
  const official = routeGuideFromLoad(load).totalMiles;
  const storedGoogle =
    load.route_source === "google" && load.route_miles != null && Number.isFinite(load.route_miles)
      ? load.route_miles
      : null;
  const loaded = official ?? storedGoogle;
  const empty = officialEmptyMiles(load.empty_miles, load.empty_source);
  if (loaded == null && empty == null) return null;
  return Math.round(((loaded ?? 0) + (empty ?? 0)) * 10) / 10;
}

export function googleMilesForDriverInRange(
  loads: LoadView[],
  driverId: number,
  truckId: number | null | undefined,
  startIso: string,
  endIso: string,
): number | null {
  let total = 0;
  let found = false;
  for (const load of loads) {
    if (load.driver_id !== driverId && (truckId == null || load.truck_id !== truckId)) continue;
    if (!loadTouchesMpgWindow(load, startIso, endIso)) continue;
    const miles = officialGoogleMilesForLoad(load);
    if (miles == null) continue;
    total += miles;
    found = true;
  }
  return found ? Math.round(total * 10) / 10 : null;
}

export function listDriverMpg(period: DriverMpgPeriod = "week", now = new Date()): DriverMpgBoard {
  const start = period === "month" ? startOfLocalMonth(now) : startOfLocalWeek(now);
  const startYmd = ymdInTimeZone(start, DISPLAY_TIME_ZONE);
  const endYmd =
    period === "month" ? ymdInTimeZone(now, DISPLAY_TIME_ZONE) : addYmdDays(startYmd, 6);
  const startIso = start.toISOString();
  const endIso = now.toISOString();
  const fuel = listFuelTransactions();
  const trucks = listTrucks();
  const loads = listLoads({ status: "all" });
  const odometerByTruck = new Map<number, TruckOdometerReading[]>();
  for (const reading of listTruckOdometerReadings()) {
    const list = odometerByTruck.get(reading.truck_id) ?? [];
    list.push(reading);
    odometerByTruck.set(reading.truck_id, list);
  }

  const rows = listDrivers()
    .filter((driver) => isDriverLoginEligible(driver))
    .map((driver) => {
      const gallons = fuel
        .filter(
          (row) =>
            row.driver_id === driver.id &&
            isTruckDieselCategory(row.category) &&
            row.occurred_at >= startIso &&
            row.occurred_at <= endIso &&
            row.gallons != null &&
            Number.isFinite(row.gallons),
        )
        .reduce((sum, row) => sum + (row.gallons ?? 0), 0);
      const truck =
        (driver.truck_id ? trucks.find((item) => item.id === driver.truck_id) : undefined) ??
        trucks.find((item) => item.assigned_driver_id === driver.id);
      const odometerMiles = truck
        ? odometerDeltaMiles(odometerByTruck.get(truck.id) ?? [], startIso, endIso)
        : null;
      const googleMiles = googleMilesForDriverInRange(loads, driver.id, truck?.id, startIso, endIso);
      const miles = odometerMiles ?? googleMiles;
      const mpg = miles != null && miles > 0 && gallons > 0 ? miles / gallons : null;
      return {
        driverId: driver.id,
        driverName: driver.name,
        truckUnit: truck?.unit_number || driver.truck_unit || "",
        gallons,
        miles,
        mpg,
      };
    })
    .sort((a, b) => {
      if (a.mpg == null && b.mpg == null) return a.driverName.localeCompare(b.driverName);
      if (a.mpg == null) return 1;
      if (b.mpg == null) return -1;
      if (a.mpg !== b.mpg) return a.mpg - b.mpg;
      return a.driverName.localeCompare(b.driverName);
    });

  return { period, startYmd, endYmd, rows };
}
