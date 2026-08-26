import { getDb } from "./db";
import { getLocation, getLoad, getTrailer, getTruck } from "./queries";

export const GEOFENCE_MILES = 0.35;

export type GpsPoint = { latitude: number; longitude: number };

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
} | null): GpsPoint | null {
  if (!row) return null;
  if (row.gps_latitude == null || row.gps_longitude == null) return null;
  if (!Number.isFinite(row.gps_latitude) || !Number.isFinite(row.gps_longitude)) return null;
  return { latitude: row.gps_latitude, longitude: row.gps_longitude };
}

export function gpsForLoad(loadId: number): GpsPoint | null {
  const load = getLoad(loadId);
  if (!load) return null;
  const truck = load.truck_id ? getTruck(load.truck_id) : null;
  const trailer = load.trailer_id ? getTrailer(load.trailer_id) : null;
  return storedGps(truck) ?? storedGps(trailer);
}

export function applyGeofenceArrivals(loadId: number, now = new Date()): number {
  const gps = gpsForLoad(loadId);
  if (!gps) return 0;
  const stops = getDb()
    .prepare("SELECT id, location_id, arrived_at FROM load_stops WHERE load_id = ? ORDER BY sequence, id")
    .all(loadId) as Array<{ id: number; location_id: number | null; arrived_at: string }>;
  let stamped = 0;
  const stamp = now.toISOString();
  for (const stop of stops) {
    if (String(stop.arrived_at ?? "").trim()) continue;
    if (!stop.location_id) continue;
    const location = getLocation(stop.location_id);
    if (location?.latitude == null || location.longitude == null) continue;
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
    if (milesBetween(gps, { latitude: location.latitude, longitude: location.longitude }) > GEOFENCE_MILES) {
      continue;
    }
    getDb().prepare("UPDATE load_stops SET arrived_at = ? WHERE id = ? AND arrived_at = ''").run(stamp, stop.id);
    stamped += 1;
  }
  return stamped;
}
