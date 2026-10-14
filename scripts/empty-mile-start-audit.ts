/**
 * Print the old and new empty-mile start for the latest working loads.
 * Opens the database read-only and writes nothing.
 *
 * Usage: tsx scripts/empty-mile-start-audit.ts <db-path> <N>
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  choosePrior,
  DELIVERY_GPS_HISTORY_MS,
  historyBoundMs,
  legacySuggestedPlace,
  stopPoint,
  type GpsSample,
  type MileLoad,
  type MileStop,
} from "../lib/empty-mile-start";
import { ACTIVE_LOAD_STATUSES } from "../lib/types";
import { archiveCutoffIso, DEFAULT_WORKING_WINDOW_DAYS } from "../lib/working-loads-shared";

type LoadRow = {
  id: number;
  load_number: string;
  status: string;
  driver_id: number | null;
  truck_id: number | null;
  created_at: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  driver_name: string | null;
  truck_unit: string | null;
};

const LOAD_COLUMNS = `loads.id, loads.load_number, loads.status, loads.driver_id, loads.truck_id,
  loads.created_at, loads.pickup_start, loads.pickup_end, loads.delivery_start, loads.delivery_end,
  drivers.name AS driver_name, trucks.unit_number AS truck_unit`;

const LOAD_FROM = `FROM loads
  LEFT JOIN drivers ON drivers.id = loads.driver_id
  LEFT JOIN trucks ON trucks.id = loads.truck_id`;

function cell(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function asMileLoad(row: LoadRow): MileLoad {
  return {
    id: row.id,
    status: row.status,
    driverId: row.driver_id,
    truckId: row.truck_id,
    createdAt: row.created_at,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    deliveryStart: row.delivery_start,
    deliveryEnd: row.delivery_end,
  };
}

function lastDelivery(stops: readonly MileStop[]): MileStop | undefined {
  return [...stops].reverse().find((stop) => stop.kind === "delivery") ?? stops[stops.length - 1];
}

function firstPickup(stops: readonly MileStop[]): MileStop | undefined {
  return stops.find((stop) => stop.kind === "pickup") ?? stops[0];
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

function gpsSince(pickupMs: number): string {
  return new Date(pickupMs - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Delivery, then pickup. Empty windows sort as ancient so they stay out of the working set. */
const ACTIVITY_SQL = `COALESCE(NULLIF(loads.delivery_end, ''), NULLIF(loads.delivery_start, ''), NULLIF(loads.pickup_end, ''), NULLIF(loads.pickup_start, ''), '1970-01-01T00:00:00.000Z')`;

function pickupBoundMs(load: LoadRow): number {
  return historyBoundMs(load.created_at, load.pickup_start, load.pickup_end);
}

export function auditEmptyMileStarts(dbPath: string, limit: number): string {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("N must be a positive integer.");
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) throw new Error(`Database not found: ${resolved}`);
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const statusSlots = ACTIVE_LOAD_STATUSES.map(() => "?").join(", ");
    const cutoff = archiveCutoffIso(new Date(), DEFAULT_WORKING_WINDOW_DAYS);
    const active = db
      .prepare(
        `SELECT ${LOAD_COLUMNS} ${LOAD_FROM}
         WHERE loads.status != 'cancelled'
           AND (
             loads.status IN (${statusSlots})
             OR loads.status = 'accounting'
             OR (loads.status IN ('delivered', 'completed') AND ${ACTIVITY_SQL} >= ?)
           )
         ORDER BY CASE WHEN loads.pickup_start = '' THEN 1 ELSE 0 END, loads.pickup_start DESC, loads.id DESC
         LIMIT ?`,
      )
      .all(...ACTIVE_LOAD_STATUSES, cutoff, limit) as LoadRow[];
    const lines = ["load_number\tdriver\tunit\told_start\tnew_start"];
    const history = db.prepare(
      `SELECT ${LOAD_COLUMNS} ${LOAD_FROM}
       WHERE loads.id != ? AND loads.status != 'cancelled' AND (loads.driver_id = ? OR loads.truck_id = ?)`,
    );
    for (const load of active) {
      const related = history.all(load.id, load.driver_id ?? -1, load.truck_id ?? -1) as LoadRow[];
      const driverLoads = related.filter((row) => load.driver_id != null && row.driver_id === load.driver_id);
      const truckLoads = related.filter((row) => load.truck_id != null && row.truck_id === load.truck_id);
      const ids = [load.id, ...related.map((row) => row.id)];
      const stops = new Map<number, MileStop[]>();
      for (const group of chunk([...new Set(ids)], 400)) {
        const rows = db
          .prepare(
            `SELECT s.load_id, s.kind, s.city, s.state, s.street, s.zip, s.name, s.schedule_source,
                    s.window_start, s.window_end, s.arrived_at, s.departed_at,
                    l.latitude AS latitude, l.longitude AS longitude
             FROM load_stops s
             LEFT JOIN locations l ON l.id = s.location_id
             WHERE s.load_id IN (${group.map(() => "?").join(", ")})
             ORDER BY s.load_id, s.sequence, s.id`,
          )
          .all(...group) as Array<MileStop & { load_id: number }>;
        for (const row of rows) {
          const list = stops.get(row.load_id) ?? [];
          list.push(row);
          stops.set(row.load_id, list);
        }
      }
      const mileLoad = asMileLoad(load);
      const mileDrivers = driverLoads.map(asMileLoad);
      const mileTrucks = truckLoads.map(asMileLoad);
      const legacy = choosePrior({
        load: mileLoad,
        driverLoads: mileDrivers,
        truckLoads: mileTrucks,
        stops,
        mode: "legacy",
      });
      const historyTruckIds = [load, ...related].flatMap((row) => (row.truck_id == null ? [] : [row.truck_id]));
      const current = choosePrior({
        load: mileLoad,
        driverLoads: mileDrivers,
        truckLoads: mileTrucks,
        stops,
        gpsByTruck: gpsByTruck(db, historyTruckIds, pickupBoundMs(load)),
        mode: "current",
      });
      const hereStops = stops.get(load.id) ?? [];
      const legacyStops = legacy.load ? (stops.get(legacy.load.id) ?? []) : [];
      const oldStart = legacySuggestedPlace({
        deliveryPlace: legacy.place,
        deliveryPoint: stopPoint(lastDelivery(legacyStops)),
        pickupMs: legacy.pickupMs,
        pickupPoint: stopPoint(firstPickup(hereStops)),
        pings: gpsForTruck(db, load.truck_id, legacy.pickupMs),
      });
      lines.push(
        [load.load_number, load.driver_name, load.truck_unit, oldStart, current.place].map(cell).join("\t"),
      );
    }
    return `${lines.join("\n")}\n`;
  } finally {
    db.close();
  }
}

function gpsByTruck(db: DatabaseSync, truckIds: number[], beforeMs: number): Map<number, GpsSample[]> {
  const out = new Map<number, GpsSample[]>();
  const ids = [...new Set(truckIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length || !Number.isFinite(beforeMs)) return out;
  const since = new Date(beforeMs - DELIVERY_GPS_HISTORY_MS).toISOString().slice(0, 10);
  for (const group of chunk(ids, 200)) {
    const slots = group.map(() => "?").join(", ");
    const readings = db
      .prepare(
        `SELECT truck_id, address, recorded_at, latitude, longitude FROM truck_gps_readings
         WHERE truck_id IN (${slots}) AND recorded_at != '' AND recorded_at >= ?
           AND (source = 'samsara' OR source = '')
         ORDER BY truck_id, recorded_at ASC, id ASC`,
      )
      .all(...group, since) as Array<{
      truck_id: number;
      address: string;
      recorded_at: string;
      latitude: number | null;
      longitude: number | null;
    }>;
    for (const row of readings) {
      const list = out.get(row.truck_id) ?? [];
      list.push({
        address: row.address,
        recordedAt: row.recorded_at,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      out.set(row.truck_id, list);
    }
    const trucks = db
      .prepare(
        `SELECT id, gps_address, gps_recorded_at, gps_latitude, gps_longitude, gps_source
         FROM trucks WHERE id IN (${slots})`,
      )
      .all(...group) as Array<{
      id: number;
      gps_address: string;
      gps_recorded_at: string;
      gps_latitude: number | null;
      gps_longitude: number | null;
      gps_source: string;
    }>;
    for (const truck of trucks) {
      const source = String(truck.gps_source ?? "").trim();
      if (source && source !== "samsara") continue;
      if (!truck.gps_recorded_at || truck.gps_recorded_at < since) continue;
      const list = out.get(truck.id) ?? [];
      const already = list.some(
        (ping) =>
          ping.recordedAt === truck.gps_recorded_at &&
          ping.latitude === truck.gps_latitude &&
          ping.longitude === truck.gps_longitude,
      );
      if (already) continue;
      list.push({
        address: truck.gps_address || "",
        recordedAt: truck.gps_recorded_at,
        latitude: truck.gps_latitude,
        longitude: truck.gps_longitude,
      });
      out.set(truck.id, list);
    }
  }
  return out;
}

function gpsForTruck(db: DatabaseSync, truckId: number | null, pickupMs: number | null): GpsSample[] {
  if (!truckId || pickupMs == null) return [];
  const since = gpsSince(pickupMs);
  const readings = db
    .prepare(
      `SELECT address, recorded_at, latitude, longitude FROM truck_gps_readings
       WHERE truck_id = ? AND recorded_at != '' AND recorded_at >= ?
       ORDER BY recorded_at ASC, id ASC`,
    )
    .all(truckId, since) as Array<{
    address: string;
    recorded_at: string;
    latitude: number | null;
    longitude: number | null;
  }>;
  const truck = db
    .prepare("SELECT gps_address, gps_recorded_at, gps_latitude, gps_longitude FROM trucks WHERE id = ?")
    .get(truckId) as
    | { gps_address: string; gps_recorded_at: string; gps_latitude: number | null; gps_longitude: number | null }
    | undefined;
  const samples: GpsSample[] = readings.map((row) => ({
    address: row.address,
    recordedAt: row.recorded_at,
    latitude: row.latitude,
    longitude: row.longitude,
  }));
  if (truck?.gps_recorded_at) {
    samples.push({
      address: truck.gps_address || "",
      recordedAt: truck.gps_recorded_at,
      latitude: truck.gps_latitude,
      longitude: truck.gps_longitude,
    });
  }
  return samples;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isDirectRun()) {
  const dbPath = process.argv[2];
  const limit = Number(process.argv[3]);
  if (!dbPath || !Number.isInteger(limit) || limit < 1) {
    console.error("Usage: tsx scripts/empty-mile-start-audit.ts <db-path> <N>");
    process.exit(1);
  }
  try {
    process.stdout.write(auditEmptyMileStarts(dbPath, limit));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
