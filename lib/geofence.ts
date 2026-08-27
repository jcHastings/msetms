import { getDb } from "./db";
import { stopAddressLine } from "./load-map-shared";
import { geocodeAddress } from "./places";
import { getLocation, getLoad, getTruck } from "./queries";

export const GEOFENCE_MILES = 2;

export type GpsPoint = { latitude: number; longitude: number };

type StopFenceRow = {
  id: number;
  location_id: number | null;
  arrived_at: string;
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
} | null): GpsPoint | null {
  if (!row) return null;
  if (row.gps_source && row.gps_source !== "samsara") return null;
  if (row.gps_latitude == null || row.gps_longitude == null) return null;
  if (!Number.isFinite(row.gps_latitude) || !Number.isFinite(row.gps_longitude)) return null;
  return { latitude: row.gps_latitude, longitude: row.gps_longitude };
}

export function gpsForLoad(loadId: number): GpsPoint | null {
  const load = getLoad(loadId);
  if (!load?.truck_id) return null;
  return storedGps(getTruck(load.truck_id));
}

function listFenceStops(loadId: number): StopFenceRow[] {
  return getDb()
    .prepare(
      `SELECT id, location_id, arrived_at, name, street, city, state, zip
       FROM load_stops WHERE load_id = ? ORDER BY sequence, id`,
    )
    .all(loadId) as StopFenceRow[];
}

function coordsForStop(stop: StopFenceRow, extra?: Map<number, GpsPoint>): GpsPoint | null {
  const extraPoint = extra?.get(stop.id);
  if (extraPoint) return extraPoint;
  if (!stop.location_id) return null;
  const location = getLocation(stop.location_id);
  if (location?.latitude == null || location.longitude == null) return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return { latitude: location.latitude, longitude: location.longitude };
}

export function applyGeofenceArrivals(
  loadId: number,
  now = new Date(),
  extraCoords?: Map<number, GpsPoint>,
): number {
  const gps = gpsForLoad(loadId);
  if (!gps) return 0;
  const stops = listFenceStops(loadId);
  let stamped = 0;
  const stamp = now.toISOString();
  for (const stop of stops) {
    if (String(stop.arrived_at ?? "").trim()) continue;
    const dest = coordsForStop(stop, extraCoords);
    if (!dest) continue;
    if (milesBetween(gps, dest) > GEOFENCE_MILES) continue;
    getDb().prepare("UPDATE load_stops SET arrived_at = ? WHERE id = ? AND arrived_at = ''").run(stamp, stop.id);
    stamped += 1;
  }
  return stamped;
}

export async function applyGeofenceArrivalsWithGeocode(loadId: number, now = new Date()): Promise<number> {
  const extra = new Map<number, GpsPoint>();
  for (const stop of listFenceStops(loadId)) {
    if (String(stop.arrived_at ?? "").trim()) continue;
    if (coordsForStop(stop)) continue;
    const geo = await geocodeAddress(stopAddressLine(stop) || String(stop.name ?? ""));
    if (geo) extra.set(stop.id, geo);
  }
  return applyGeofenceArrivals(loadId, now, extra);
}

export function applyGeofenceArrivalsForTruck(truckId: number, now = new Date()): number {
  const loads = getDb()
    .prepare("SELECT id FROM loads WHERE truck_id = ? AND status != 'cancelled'")
    .all(truckId) as Array<{ id: number }>;
  let stamped = 0;
  for (const load of loads) stamped += applyGeofenceArrivals(load.id, now);
  return stamped;
}
