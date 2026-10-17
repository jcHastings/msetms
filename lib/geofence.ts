import { getDb } from "./db";
import { stopAddressLine } from "./load-map-shared";
import { matchLocationForStop } from "./locations";
import { geocodeAddress } from "./places";
import {
  getLocation,
  getLoad,
  getTruck,
  listLocations,
  listTruckGpsReadings,
  saveLocationCoords,
} from "./queries";
import { isClosedStatus } from "./types";
import { gpsInstantMs, instantMs, timeZoneForStop } from "./wall-time";
import { applyWorkflowAfterGeofence } from "./workflow";

export const GEOFENCE_MILES = 2;
/** One ping this far out is a depart. Closer exits need two pings outside the 2-mile fence. */
export const GEOFENCE_DEPART_MILES = 2.5;
/** Pings earlier than this before the first stop window are another trip. */
export const GEOFENCE_WINDOW_LEAD_MS = 12 * 60 * 60 * 1000;

export type GpsPoint = { latitude: number; longitude: number };
export type GpsPing = GpsPoint & { recordedAt: string };

type StopFenceRow = {
  id: number;
  location_id: number | null;
  arrived_at: string;
  departed_at: string;
  window_start: string;
  window_end: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export function milesBetween(a: GpsPoint, b: GpsPoint): number {
  const radius = 3959;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function storedGps(row: {
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_source?: string;
  gps_recorded_at?: string;
} | null): GpsPing | null {
  if (!row) return null;
  if (row.gps_source && row.gps_source !== "samsara") return null;
  if (row.gps_latitude == null || row.gps_longitude == null) return null;
  if (!Number.isFinite(row.gps_latitude) || !Number.isFinite(row.gps_longitude)) return null;
  return {
    latitude: row.gps_latitude,
    longitude: row.gps_longitude,
    recordedAt: String(row.gps_recorded_at ?? "").trim(),
  };
}

export function gpsForLoad(loadId: number): GpsPoint | null {
  const load = getLoad(loadId);
  if (!load?.truck_id) return null;
  return storedGps(getTruck(load.truck_id));
}

function geofenceFloorMs(loadId: number, stops: StopFenceRow[]): number | null {
  const load = getLoad(loadId);
  if (!load) return null;
  const marks: number[] = [];
  const created = instantMs(load.created_at);
  if (created != null) marks.push(created);
  const dispatched = getDb()
    .prepare(
      `SELECT MIN(created_at) AS at FROM load_audit
       WHERE load_id = ? AND field = 'status' AND new_value = 'dispatched'`,
    )
    .get(loadId) as { at: string | null } | undefined;
  const dispatchMs = instantMs(dispatched?.at ?? "");
  if (dispatchMs != null) marks.push(dispatchMs);
  const first = stops[0];
  const zone = timeZoneForStop(first?.state, first?.city);
  const windowRaw = String(first?.window_start || first?.window_end || load.pickup_start || "").trim();
  const windowMs = instantMs(windowRaw, zone);
  if (windowMs != null) marks.push(windowMs - GEOFENCE_WINDOW_LEAD_MS);
  if (!marks.length) return null;
  return Math.max(...marks);
}

function pingAfterFloor(ping: GpsPing, floor: number | null, nowMs: number): boolean {
  if (floor == null) return true;
  const at = gpsInstantMs(ping.recordedAt) ?? nowMs;
  return at > floor;
}

export function gpsPingsForLoad(loadId: number): GpsPing[] {
  const load = getLoad(loadId);
  if (!load?.truck_id) return [];
  const truck = getTruck(load.truck_id);
  const pings: GpsPing[] = listTruckGpsReadings(load.truck_id)
    .filter((row) => row.source === "samsara")
    .map((row) => ({
      latitude: row.latitude,
      longitude: row.longitude,
      recordedAt: row.recorded_at,
    }));
  const current = storedGps(truck);
  if (current) {
    const already = pings.some(
      (ping) =>
        ping.recordedAt === current.recordedAt &&
        ping.latitude === current.latitude &&
        ping.longitude === current.longitude,
    );
    if (!already) pings.push(current);
  }
  const floor = geofenceFloorMs(loadId, listFenceStops(loadId));
  const nowMs = Date.now();
  return pings
    .filter((ping) => Number.isFinite(ping.latitude) && Number.isFinite(ping.longitude))
    .filter((ping) => pingAfterFloor(ping, floor, nowMs))
    .sort((left, right) => (gpsInstantMs(left.recordedAt) ?? 0) - (gpsInstantMs(right.recordedAt) ?? 0));
}

function listFenceStops(loadId: number): StopFenceRow[] {
  return getDb()
    .prepare(
      `SELECT id, location_id, arrived_at, departed_at, window_start, window_end, name, street, city, state, zip
       FROM load_stops WHERE load_id = ? ORDER BY sequence, id`,
    )
    .all(loadId) as StopFenceRow[];
}

type LocationDirectory = { rows?: ReturnType<typeof listLocations> };

function locationsOnce(directory?: LocationDirectory): ReturnType<typeof listLocations> {
  if (!directory) return listLocations();
  if (!directory.rows) directory.rows = listLocations();
  return directory.rows;
}

export function coordsForStop(
  stop: {
    id?: number;
    location_id?: number | null;
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  },
  extra?: Map<number, GpsPoint>,
  directory?: LocationDirectory,
): GpsPoint | null {
  const extraPoint = stop.id != null ? extra?.get(stop.id) : undefined;
  if (extraPoint) return extraPoint;
  if (stop.location_id) {
    const location = getLocation(stop.location_id);
    if (location?.latitude != null && location.longitude != null) {
      if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
        return { latitude: location.latitude, longitude: location.longitude };
      }
    }
  }
  const matched = matchLocationForStop(locationsOnce(directory), {
    name: stop.name ?? "",
    street: stop.street ?? "",
    city: stop.city ?? "",
    state: stop.state ?? "",
  });
  if (matched?.latitude != null && matched.longitude != null) {
    if (Number.isFinite(matched.latitude) && Number.isFinite(matched.longitude)) {
      return { latitude: matched.latitude, longitude: matched.longitude };
    }
  }
  return null;
}

function samePing(left: GpsPing, right: GpsPing): boolean {
  return left.recordedAt === right.recordedAt && left.latitude === right.latitude && left.longitude === right.longitude;
}

/** Outside streak already on the books before this live ping. A single replay ping cannot see it. */
function outsideStreakBefore(loadId: number, dest: GpsPoint, arrivedMs: number, current: GpsPing): number {
  const currentMs = gpsInstantMs(current.recordedAt) ?? Number.POSITIVE_INFINITY;
  let streak = 0;
  for (const ping of gpsPingsForLoad(loadId)) {
    if (samePing(ping, current)) continue;
    const at = gpsInstantMs(ping.recordedAt) ?? 0;
    if (at < arrivedMs || at > currentMs) continue;
    streak = milesBetween(ping, dest) > GEOFENCE_MILES ? streak + 1 : 0;
  }
  return streak;
}

function stampIfEmpty(stopId: number, field: "arrived_at" | "departed_at", iso: string): boolean {
  const result = getDb()
    .prepare(`UPDATE load_stops SET ${field} = ? WHERE id = ? AND ${field} = ''`)
    .run(iso, stopId);
  return result.changes > 0;
}

export function applyGeofenceArrivals(
  loadId: number,
  now = new Date(),
  extraCoords?: Map<number, GpsPoint>,
  onlyPing?: GpsPing,
): number {
  const stops = listFenceStops(loadId);
  if (!stops.length) return 0;
  const load = getLoad(loadId);
  const open = Boolean(load && !isClosedStatus(load.status));
  const allStamped = stops.every(
    (stop) => String(stop.arrived_at ?? "").trim() && String(stop.departed_at ?? "").trim(),
  );
  let stamped = 0;
  if (!allStamped) {
    const floor = geofenceFloorMs(loadId, stops);
    const nowMs = now.getTime();
    const pings = (onlyPing ? [onlyPing] : gpsPingsForLoad(loadId)).filter((ping) => pingAfterFloor(ping, floor, nowMs));
    if (pings.length) {
      const directory: LocationDirectory = {};
      const fallback = now.toISOString();
      let priorDepartedMs: number | null = null;
      for (const stop of stops) {
        const zone = timeZoneForStop(stop.state, stop.city);
        let arrived = String(stop.arrived_at ?? "").trim();
        let departed = String(stop.departed_at ?? "").trim();
        let arrivedMs = instantMs(arrived, zone);
        let departedMs = instantMs(departed, zone);
        if (arrived && departed) {
          if (departedMs != null) priorDepartedMs = departedMs;
          continue;
        }
        const dest = coordsForStop(stop, extraCoords, directory);
        if (!dest) {
          if (departedMs != null) priorDepartedMs = departedMs;
          continue;
        }
        let consecutiveOutside =
          onlyPing && arrived && !departed && arrivedMs != null
            ? outsideStreakBefore(loadId, dest, arrivedMs, onlyPing)
            : 0;
        for (const ping of pings) {
          const atMs = gpsInstantMs(ping.recordedAt) ?? nowMs;
          if (priorDepartedMs != null && atMs < priorDepartedMs) continue;
          const at = ping.recordedAt || fallback;
          const miles = milesBetween(ping, dest);
          const inside = miles <= GEOFENCE_MILES;
          const outside = miles > GEOFENCE_MILES;
          if (!arrived && inside) {
            if (stampIfEmpty(stop.id, "arrived_at", at)) stamped += 1;
            arrived = at;
            arrivedMs = atMs;
          }
          const confirmedLeave =
            miles > GEOFENCE_DEPART_MILES || (outside && consecutiveOutside + 1 >= 2);
          if (arrived && !departed && confirmedLeave && arrivedMs != null && atMs >= arrivedMs) {
            if (stampIfEmpty(stop.id, "departed_at", at)) stamped += 1;
            departed = at;
            departedMs = atMs;
          }
          consecutiveOutside = outside ? consecutiveOutside + 1 : 0;
          if (arrived && departed) break;
        }
        if (departedMs != null) priorDepartedMs = departedMs;
      }
    }
  }
  if (open && (stamped > 0 || allStamped)) applyWorkflowAfterGeofence(loadId);
  return stamped;
}

export async function applyGeofenceArrivalsWithGeocode(loadId: number, now = new Date()): Promise<number> {
  try {
    const { refreshTruckGpsHistoryForLoad } = await import("./integrations/samsara");
    await refreshTruckGpsHistoryForLoad(loadId);
  } catch {
    // Missing key / no vehicle / Samsara down: use stored pings only.
  }
  const extra = new Map<number, GpsPoint>();
  for (const stop of listFenceStops(loadId)) {
    if (coordsForStop(stop)) continue;
    const geo = await geocodeAddress(stopAddressLine(stop) || String(stop.name ?? ""));
    if (!geo) continue;
    extra.set(stop.id, geo);
    if (stop.location_id) saveLocationCoords(stop.location_id, geo.latitude, geo.longitude);
  }
  return applyGeofenceArrivals(loadId, now, extra);
}

export function stillInsideGeofenceAt(
  dest: GpsPoint,
  pings: GpsPing[],
  mark: Date,
  departedAt?: string | null,
): boolean {
  const departed = String(departedAt ?? "").trim();
  if (departed) {
    const left = new Date(departed);
    if (!Number.isNaN(left.getTime()) && left.getTime() <= mark.getTime()) return false;
  }
  const atOrAfter = pings.filter((ping) => {
    const at = new Date(ping.recordedAt);
    return !Number.isNaN(at.getTime()) && at.getTime() >= mark.getTime();
  });
  const sample = atOrAfter[0] ?? pings[pings.length - 1];
  if (!sample) return !departed;
  return milesBetween(sample, dest) <= GEOFENCE_MILES;
}

/** Live GPS. Closed loads keep their stamps; pass onlyPing so this save does not replay truck_gps_readings. */
export function applyGeofenceArrivalsForTruck(truckId: number, now = new Date(), onlyPing?: GpsPing): number {
  const loads = getDb()
    .prepare(
      `SELECT id FROM loads
       WHERE truck_id = ? AND status NOT IN ('delivered', 'completed', 'accounting', 'cancelled')`,
    )
    .all(truckId) as Array<{ id: number }>;
  let stamped = 0;
  for (const load of loads) stamped += applyGeofenceArrivals(load.id, now, undefined, onlyPing);
  return stamped;
}
