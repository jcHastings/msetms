/**
 * Persist a driver trailer change: load trailer, audit sentence, custody, office note.
 * Does not send mail or texts and does not recalculate pay.
 */

import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import {
  TRAILER_GPS_QUIET_HOURS,
  TRAILER_NUMBER_MAX,
  TRAILER_TRUCK_FAR_MILES,
  driverTrailerChangeSentence,
  suggestDriverTrailer,
  trailerUnitLabel,
  trailerUnitsEqual,
  normalizeTrailerNumber,
  type DriverTrailerChangeFacts,
  type DriverTrailerOption,
  type TrailerGpsFix,
} from "./driver-trailer-change";
import { getDriver, getLoad, getTrailer, getTruck, listAssignableTrailers } from "./queries";
import { applyLoadCustody } from "./trailer-custody";
import { isClosedStatus, isRollingStatus } from "./types";

export function loadDriverTrailerChangeFacts(input: {
  driverId: number;
  loadId: number;
  asOf?: string;
}): DriverTrailerChangeFacts {
  const load = requireDriverLoad(input.driverId, input.loadId);
  const driver = getDriver(input.driverId);
  const trailers = listAssignableTrailers().slice().sort((left, right) =>
    left.unit_number.localeCompare(right.unit_number, undefined, { numeric: true, sensitivity: "base" }),
  );
  const otherLoads = otherInProgressLoads(load.id, input.driverId);
  const options: DriverTrailerOption[] = trailers.map((trailer) => ({
    id: trailer.id,
    unitNumber: trailer.unit_number,
    gps: gpsFix(trailer),
    otherLoadNumber: otherLoads.get(trailer.id) ?? "",
  }));
  const assignedUnit = trailerUnitLabel(load.trailer_unit || load.trailer_number);
  const latestUnit = latestTrailerUnit(input.driverId, load.id, driver?.last_trailer_id ?? null);
  const suggestion = suggestDriverTrailer({ currentUnit: assignedUnit, latestUnit });
  const truckId = load.truck_id ?? driver?.truck_id ?? null;
  const truck = truckId ? getTruck(truckId) : null;
  return {
    asOf: input.asOf ?? new Date().toISOString(),
    quietHours: TRAILER_GPS_QUIET_HOURS,
    farMiles: TRAILER_TRUCK_FAR_MILES,
    assignedUnit,
    suggestedUnit: suggestion.unit,
    suggestionSource: suggestion.source,
    latestUnit,
    truck: truck ? gpsFix(truck) : null,
    trailers: options,
  };
}

export function driverChangeLoadTrailer(input: {
  driverId: number;
  loadId: number;
  trailerId: number | null;
  customNumber: string;
}): { changed: boolean } {
  const load = requireDriverLoad(input.driverId, input.loadId);
  const next = resolveTrailerPick(input.trailerId, input.customNumber);
  const fromUnit = trailerUnitLabel(load.trailer_unit || load.trailer_number);
  const sameUnit = trailerUnitsEqual(fromUnit, next.unit);
  const sameId = (load.trailer_id ?? null) === next.trailerId;
  if (sameUnit && sameId) return { changed: false };

  const sentence = driverTrailerChangeSentence(fromUnit, next.unit);
  const at = new Date().toISOString();
  getDb().transaction(() => {
    getDb()
      .prepare(
        `UPDATE loads
         SET trailer_id = ?, trailer_number = ?, driver_trailer_note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.trailerId, next.unit, sentence, at, load.id);
    if (next.trailerId) {
      getDb()
        .prepare("UPDATE drivers SET last_trailer_id = ?, updated_at = ? WHERE id = ?")
        .run(next.trailerId, at, input.driverId);
    }
    applyLoadCustody({
      loadId: load.id,
      loadNumber: load.load_number,
      previous: {
        trailerId: load.trailer_id,
        driverId: load.driver_id,
        truckId: load.truck_id,
        status: load.status,
      },
      next: {
        trailerId: next.trailerId,
        driverId: load.driver_id,
        truckId: load.truck_id,
        status: load.status,
      },
    });
  })();
  recordLoadAudit({
    loadId: load.id,
    loadNumber: load.load_number,
    action: "driver_trailer",
    field: "trailer",
    oldValue: fromUnit,
    newValue: next.unit,
  });
  return { changed: true };
}

function requireDriverLoad(driverId: number, loadId: number) {
  const load = getLoad(loadId);
  if (!load || !driverMayChangeTrailer(load.id, driverId, load.driver_id)) {
    throw new Error("That load is not assigned to you.");
  }
  if (isClosedStatus(load.status)) throw new Error("This load is closed.");
  return load;
}

function driverMayChangeTrailer(loadId: number, driverId: number, primaryDriverId: number | null): boolean {
  if (primaryDriverId === driverId) return true;
  const row = getDb()
    .prepare(
      `SELECT id FROM load_relays
       WHERE load_id = ? AND (driver_id = ? OR from_driver_id = ?)
       LIMIT 1`,
    )
    .get(loadId, driverId, driverId) as { id: number } | undefined;
  return Boolean(row);
}

function resolveTrailerPick(
  trailerId: number | null,
  customNumber: string,
): { trailerId: number | null; unit: string } {
  const typed = customNumber.trim();
  if (typed) {
    const custom = normalizeTrailerNumber(typed);
    if (!custom) {
      throw new Error(
        typed.length > TRAILER_NUMBER_MAX
          ? "Trailer number is too long."
          : "Use letters and numbers for the trailer number.",
      );
    }
    const match = findAssignableByUnit(custom);
    if (match) return { trailerId: match.id, unit: match.unit_number };
    return { trailerId: null, unit: custom };
  }
  if (trailerId == null) throw new Error("Pick a trailer or type a trailer number.");
  const trailer = getTrailer(trailerId);
  if (!trailer || !isAssignable(trailer)) throw new Error("That trailer is not available.");
  return { trailerId: trailer.id, unit: trailer.unit_number };
}

function findAssignableByUnit(unit: string) {
  const want = unit.toLowerCase();
  return listAssignableTrailers().find((trailer) => trailer.unit_number.trim().toLowerCase() === want) ?? null;
}

function isAssignable(trailer: { active: number; status: string }): boolean {
  return trailer.active !== 0 && trailer.status !== "maintenance" && trailer.status !== "out_of_service";
}

function gpsFix(row: {
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_recorded_at?: string;
  gps_source?: string;
}): TrailerGpsFix | null {
  if (row.gps_latitude == null && row.gps_longitude == null) return null;
  return {
    latitude: row.gps_latitude ?? null,
    longitude: row.gps_longitude ?? null,
    recordedAt: row.gps_recorded_at || "",
    source: row.gps_source || "",
  };
}

function otherInProgressLoads(loadId: number, driverId: number): Map<number, string> {
  const rows = getDb()
    .prepare(
      `SELECT id, load_number, status, driver_id, trailer_id
       FROM loads
       WHERE trailer_id IS NOT NULL
         AND id != ?
         AND driver_id IS NOT NULL
         AND driver_id != ?
         AND status != 'cancelled'`,
    )
    .all(loadId, driverId) as Array<{
    id: number;
    load_number: string;
    status: string;
    driver_id: number;
    trailer_id: number;
  }>;
  const byTrailer = new Map<number, { id: number; loadNumber: string }>();
  for (const row of rows) {
    if (!isRollingStatus(row.status)) continue;
    const existing = byTrailer.get(row.trailer_id);
    if (!existing || row.id < existing.id) {
      byTrailer.set(row.trailer_id, { id: row.id, loadNumber: row.load_number });
    }
  }
  return new Map([...byTrailer.entries()].map(([trailerId, row]) => [trailerId, row.loadNumber]));
}

function latestTrailerUnit(driverId: number, loadId: number, lastTrailerId: number | null): string {
  const rows = getDb()
    .prepare(
      `SELECT loads.trailer_id, loads.trailer_number,
              trailers.unit_number AS unit, trailers.active AS active, trailers.status AS status
       FROM loads
       LEFT JOIN trailers ON trailers.id = loads.trailer_id
       WHERE loads.driver_id = ?
         AND loads.id != ?
         AND loads.status != 'cancelled'
       ORDER BY loads.updated_at DESC, loads.id DESC
       LIMIT 20`,
    )
    .all(driverId, loadId) as Array<{
    trailer_id: number | null;
    trailer_number: string;
    unit: string | null;
    active: number | null;
    status: string | null;
  }>;
  for (const row of rows) {
    if (row.trailer_id && row.unit && row.active !== 0 && row.status !== "maintenance" && row.status !== "out_of_service") {
      return trailerUnitLabel(row.unit);
    }
    if (!row.trailer_id && trailerUnitLabel(row.trailer_number)) return trailerUnitLabel(row.trailer_number);
  }
  if (lastTrailerId) {
    const trailer = getTrailer(lastTrailerId);
    if (trailer && isAssignable(trailer)) return trailer.unit_number;
  }
  return "";
}
