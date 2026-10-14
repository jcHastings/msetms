import { getDb } from "./db";
import {
  truckIdAfterDriverAssign,
  type AssignmentTruckGps,
  type AssignmentUnitFacts,
} from "./driver-unit";
import { readStoredSamsaraFleet } from "./integrations/samsara";
import { getDriver, getTruck, listDrivers } from "./queries";
import type { RelayAssignmentPatch } from "./relays";
import { getCompanySettings } from "./settings";
import { LOAD_STATUSES, isRollingStatus } from "./types";

const ROLLING_STATUSES = LOAD_STATUSES.filter((status) => isRollingStatus(status));

function truckCanAssign(truck: { active: number; status: string } | null | undefined): boolean {
  return Boolean(truck && truck.active !== 0 && truck.status !== "maintenance" && truck.status !== "out_of_service");
}

function recentLoadTruck(driverId: number): { truckId: number; unitNumber: string } | null {
  const row = getDb()
    .prepare(
      `SELECT loads.truck_id AS truckId, trucks.unit_number AS unitNumber
       FROM loads
       JOIN trucks ON trucks.id = loads.truck_id
       WHERE loads.driver_id = ?
         AND loads.status != 'cancelled'
         AND loads.truck_id IS NOT NULL
         AND TRIM(trucks.unit_number) != ''
       ORDER BY loads.updated_at DESC, loads.id DESC
       LIMIT 1`,
    )
    .get(driverId) as { truckId: number; unitNumber: string } | undefined;
  if (!row?.unitNumber?.trim()) return null;
  return { truckId: row.truckId, unitNumber: row.unitNumber.trim() };
}

/** Assigned truck on the driver, otherwise the truck on the latest non-cancelled load. */
export function lookupDriverCurrentUnit(driverId: number): { truckId: number; unitNumber: string } | null {
  const driver = getDriver(driverId);
  if (!driver) return null;
  if (driver.truck_id) {
    const truck = getTruck(driver.truck_id);
    const unit = truck?.unit_number?.trim() || "";
    if (truck && unit) return { truckId: truck.id, unitNumber: unit };
  }
  return recentLoadTruck(driverId);
}

function lookupAssignableDriverUnit(driverId: number): { truckId: number; unitNumber: string } | null {
  const unit = lookupDriverCurrentUnit(driverId);
  if (!unit) return null;
  if (!truckCanAssign(getTruck(unit.truckId))) return null;
  return unit;
}

export function applyDriverTruckDefault(input: {
  previousDriverId: number | null;
  nextDriverId: number | null;
  previousTruckId: number | null;
  submittedTruckId: number | null;
  truckFieldPresent: boolean;
  truckExplicit: boolean;
  creating: boolean;
}): number | null {
  const driverUnitTruckId =
    input.nextDriverId != null ? (lookupAssignableDriverUnit(input.nextDriverId)?.truckId ?? null) : null;
  return truckIdAfterDriverAssign({ ...input, driverUnitTruckId });
}

export function fillRelayAssignmentTrucks(
  existing: {
    driver_id: number | null;
    truck_id: number | null;
    from_driver_id: number | null;
    from_truck_id: number | null;
  },
  patch: RelayAssignmentPatch,
  truckExplicit: boolean,
): RelayAssignmentPatch {
  const next = { ...patch };
  if (patch.driver_id !== undefined || patch.truck_id !== undefined) {
    next.truck_id = applyDriverTruckDefault({
      previousDriverId: existing.driver_id,
      nextDriverId: patch.driver_id !== undefined ? patch.driver_id : existing.driver_id,
      previousTruckId: existing.truck_id,
      submittedTruckId: patch.truck_id !== undefined ? (patch.truck_id ?? null) : null,
      truckFieldPresent: patch.truck_id !== undefined,
      truckExplicit,
      creating: false,
    });
  }
  if (patch.from_driver_id !== undefined || patch.from_truck_id !== undefined) {
    next.from_truck_id = applyDriverTruckDefault({
      previousDriverId: existing.from_driver_id,
      nextDriverId: patch.from_driver_id !== undefined ? patch.from_driver_id : existing.from_driver_id,
      previousTruckId: existing.from_truck_id,
      submittedTruckId: patch.from_truck_id !== undefined ? (patch.from_truck_id ?? null) : null,
      truckFieldPresent: patch.from_truck_id !== undefined,
      truckExplicit,
      creating: false,
    });
  }
  return next;
}

function recentTruckByDriver(): Map<number, { truckId: number; unitNumber: string }> {
  const rows = getDb()
    .prepare(
      `SELECT loads.driver_id AS driverId, loads.truck_id AS truckId, trucks.unit_number AS unitNumber
       FROM loads
       JOIN trucks ON trucks.id = loads.truck_id
       WHERE loads.status != 'cancelled'
         AND loads.driver_id IS NOT NULL
         AND loads.truck_id IS NOT NULL
         AND TRIM(trucks.unit_number) != ''
       ORDER BY loads.updated_at DESC, loads.id DESC`,
    )
    .all() as Array<{ driverId: number; truckId: number; unitNumber: string }>;
  const map = new Map<number, { truckId: number; unitNumber: string }>();
  for (const row of rows) {
    if (!map.has(row.driverId)) map.set(row.driverId, { truckId: row.truckId, unitNumber: row.unitNumber.trim() });
  }
  return map;
}

export function loadAssignmentUnitFacts(now = new Date()): AssignmentUnitFacts {
  const quietHours = getCompanySettings().alert_gps_quiet_hours || 2;
  const recent = recentTruckByDriver();
  const drivers = listDrivers().flatMap((driver) => {
    if (driver.truck_id) {
      const truck = getTruck(driver.truck_id);
      const unit = truck?.unit_number?.trim() || "";
      if (truck && unit) return [{ driverId: driver.id, truckId: truck.id, unitNumber: unit }];
    }
    const fallback = recent.get(driver.id);
    return fallback ? [{ driverId: driver.id, truckId: fallback.truckId, unitNumber: fallback.unitNumber }] : [];
  });
  const gpsRows = getDb()
    .prepare(
      `SELECT id, unit_number, gps_source, gps_recorded_at, gps_latitude, gps_longitude, gps_address
       FROM trucks
       WHERE gps_source = 'samsara' AND TRIM(COALESCE(gps_recorded_at, '')) != ''`,
    )
    .all() as Array<{
    id: number;
    unit_number: string;
    gps_source: string;
    gps_recorded_at: string;
    gps_latitude: number | null;
    gps_longitude: number | null;
    gps_address: string;
  }>;
  const rollingSql = ROLLING_STATUSES.map(() => "?").join(", ");
  const loadRows = (
    rollingSql
      ? getDb()
          .prepare(
            `SELECT loads.id AS loadId, loads.load_number AS loadNumber, loads.truck_id AS truckId,
                    loads.driver_id AS driverId, COALESCE(drivers.name, '') AS driverName, loads.status AS status
             FROM loads
             LEFT JOIN drivers ON drivers.id = loads.driver_id
             WHERE loads.truck_id IS NOT NULL AND loads.status IN (${rollingSql})
             ORDER BY loads.updated_at DESC, loads.id DESC`,
          )
          .all(...ROLLING_STATUSES)
      : []
  ) as Array<{
    loadId: number;
    loadNumber: string;
    truckId: number;
    driverId: number | null;
    driverName: string;
    status: string;
  }>;
  const fleet = readStoredSamsaraFleet();
  const trucks: AssignmentTruckGps[] = gpsRows
    .filter((row) => row.unit_number.trim())
    .map((row) => {
      const seated = fleet.truckDrivers.find((item) => item.truckId === row.id);
      return {
        truckId: row.id,
        unitNumber: row.unit_number.trim(),
        source: row.gps_source,
        recordedAt: row.gps_recorded_at,
        latitude: row.gps_latitude,
        longitude: row.gps_longitude,
        address: row.gps_address ?? "",
        loads: loadRows
          .filter((load) => load.truckId === row.id)
          .map((load) => ({
            loadId: load.loadId,
            loadNumber: load.loadNumber,
            driverId: load.driverId,
            driverName: load.driverName,
            status: load.status,
          })),
        gpsDriverId: seated?.tmsDriverId ?? null,
        gpsDriverName: seated?.samsaraDriverName ?? "",
      };
    });
  return { asOf: now.toISOString(), quietHours, drivers, trucks };
}
