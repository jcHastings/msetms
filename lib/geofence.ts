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

export const GEOFENCE_MILES = 2;

export type GpsPoint = { latitude: number; longitude: number };
export type GpsPing = GpsPoint & { recordedAt: string };

type StopFenceRow = {
  id: number;
  location_id: number | null;
  arrived_at: string;
  departed_at: string;
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
  return pings
    .filter((ping) => Number.isFinite(ping.latitude) && Number.isFinite(ping.longitude))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

function listFenceStops(loadId: number): StopFenceRow[] {
  return getDb()
    .prepare(
      `SELECT id, location_id, arrived_at, departed_at, name, street, city, state, zip
       FROM load_stops WHERE load_id = ? ORDER BY sequence, id`,
    )
    .all(loadId) as StopFenceRow[];
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
  const matched = matchLocationForStop(listLocations(), {
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
): number {
  const pings = gpsPingsForLoad(loadId);
  if (!pings.length) return 0;
  const stops = listFenceStops(loadId);
  let stamped = 0;
  const fallback = now.toISOString();
  for (const stop of stops) {
    const dest = coordsForStop(stop, extraCoords);
    if (!dest) continue;
    let arrived = String(stop.arrived_at ?? "").trim();
    let departed = String(stop.departed_at ?? "").trim();
    for (const ping of pings) {
      const at = ping.recordedAt || fallback;
      const inside = milesBetween(ping, dest) <= GEOFENCE_MILES;
      if (!arrived && inside) {
        if (stampIfEmpty(stop.id, "arrived_at", at)) stamped += 1;
        arrived = at;
      }
      if (arrived && !departed && !inside && at >= arrived) {
        if (stampIfEmpty(stop.id, "departed_at", at)) stamped += 1;
        departed = at;
      }
    }
  }
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

export function applyGeofenceArrivalsForTruck(truckId: number, now = new Date()): number {
  const loads = getDb()
    .prepare("SELECT id FROM loads WHERE truck_id = ? AND status != 'cancelled'")
    .all(truckId) as Array<{ id: number }>;
  let stamped = 0;
  for (const load of loads) stamped += applyGeofenceArrivals(load.id, now);
  return stamped;
}
