import { listLoadLog } from "./audit";
import { getDb } from "./db";
import { getGoogleMapsApiKey } from "./env";
import { getTrailerLocationForLoad } from "./integrations/orbcomm";
import { getLocationForLoad } from "./integrations/samsara";
import {
  stopAddressLine,
  stopsRoutePoints,
  type LoadMapPathPoint,
  type LoadMapPoint,
  type LoadTrackingEvent,
} from "./load-map-shared";
import { decodePolyline, usableRouteStops } from "./routing";
import { stopMapMarkerText, stopTypeLabel, stopTypeNumber } from "./stops-shared";
import { isOfficialDrivingRoute } from "./routing-shared";
import {
  getLoad,
  getLocation,
  getTrailer,
  getTruck,
  persistedTrailerLocation,
  persistedTruckLocation,
} from "./queries";
import { geocodeAddress } from "./places";
import { listStops } from "./stops";

export function mapsBrowserKey(): string {
  return getGoogleMapsApiKey() ?? "";
}

function validPoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
}

function storedGps<T extends { source?: string; latitude?: number | null; longitude?: number | null }>(
  location: T | null | undefined,
  source: "samsara" | "orbcomm",
): T | null {
  if (!location || location.source !== source) return null;
  if (!validPoint(location.latitude, location.longitude)) return null;
  return location;
}

async function truckGpsForLoad(loadId: number, truckId: number | null) {
  const live = storedGps(await getLocationForLoad(loadId), "samsara");
  if (live) return live;
  if (truckId == null) return null;
  const truck = getTruck(truckId);
  if (!truck) return null;
  return storedGps(persistedTruckLocation(truck), "samsara");
}

async function trailerGpsForLoad(loadId: number, trailerId: number | null) {
  const live = storedGps(await getTrailerLocationForLoad(loadId), "orbcomm");
  if (live) return live;
  if (trailerId == null) return null;
  const trailer = getTrailer(trailerId);
  if (!trailer) return null;
  return storedGps(persistedTrailerLocation(trailer), "orbcomm");
}

export function storedRoutePath(loadId: number): LoadMapPathPoint[] {
  const load = getLoad(loadId);
  const encoded = String(load?.route_polyline ?? "").trim();
  if (!encoded) return [];
  return decodePolyline(encoded);
}

export async function buildStopsMapModel(loadId: number): Promise<{
  points: LoadMapPoint[];
  path: LoadMapPathPoint[];
}> {
  const points = stopsRoutePoints(await buildLoadMapPoints(loadId));
  const stored = storedRoutePath(loadId);
  const load = getLoad(loadId);
  const official =
    load &&
    isOfficialDrivingRoute(load, { stopCount: usableRouteStops(listStops(loadId)).length }) === "google";
  return {
    points,
    path: official && stored.length >= 2 ? stored : [],
  };
}

export async function buildLoadMapPoints(loadId: number): Promise<LoadMapPoint[]> {
  const load = getLoad(loadId);
  if (!load) return [];
  const points: LoadMapPoint[] = [];
  const stops = listStops(loadId);

  for (const stop of stops) {
    const linked = stop.location_id ? getLocation(stop.location_id) : null;
    let lat = linked?.latitude ?? null;
    let lng = linked?.longitude ?? null;
    if (!validPoint(lat, lng)) {
      const address = stopAddressLine({
        street: stop.street || linked?.street,
        city: stop.city || linked?.city,
        state: stop.state || linked?.state,
        zip: stop.zip || linked?.zip,
      });
      const geocoded = await geocodeAddress(address);
      lat = geocoded?.latitude ?? null;
      lng = geocoded?.longitude ?? null;
    }
    if (!validPoint(lat, lng)) continue;
    const typeNumber = stopTypeNumber(stops, stop.id);
    const typeLabel = stopTypeLabel(stop.kind, typeNumber);
    points.push({
      id: `stop-${stop.id}`,
      kind: stop.kind === "delivery" ? "delivery" : "pickup",
      label: `${typeLabel} · ${stop.name || stop.city || stop.kind}`,
      markerText: stopMapMarkerText(stop.kind, typeNumber),
      lat: lat as number,
      lng: lng as number,
      detail: stopAddressLine(stop) || undefined,
    });
  }

  const truck = await truckGpsForLoad(loadId, load.truck_id);
  if (truck) {
    points.push({
      id: "truck",
      kind: "truck",
      label: `Truck ${("unitNumber" in truck ? truck.unitNumber : "") || load.truck_unit || ""}`.trim(),
      lat: truck.latitude as number,
      lng: truck.longitude as number,
      detail: [truck.address, truck.recordedAt].filter(Boolean).join(" · ") || undefined,
    });
  }

  const trailer = await trailerGpsForLoad(loadId, load.trailer_id);
  if (trailer) {
    points.push({
      id: "trailer",
      kind: "trailer",
      label: `Trailer ${trailer.trailerId || load.trailer_unit || ""}`.trim(),
      lat: trailer.latitude as number,
      lng: trailer.longitude as number,
      detail: [trailer.address, trailer.recordedAt].filter(Boolean).join(" · ") || undefined,
    });
  }

  const crumbs = getDb()
    .prepare(
      `SELECT latitude, longitude, address, recorded_at
       FROM reefer_readings
       WHERE load_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY recorded_at DESC
       LIMIT 20`,
    )
    .all(loadId) as Array<{
    latitude: number;
    longitude: number;
    address: string;
    recorded_at: string;
  }>;
  crumbs.forEach((crumb, index) => {
    if (!validPoint(crumb.latitude, crumb.longitude)) return;
    points.push({
      id: `track-${index}-${crumb.recorded_at}`,
      kind: "track",
      label: "Tracking ping",
      lat: crumb.latitude,
      lng: crumb.longitude,
      detail: [crumb.address, crumb.recorded_at].filter(Boolean).join(" · ") || undefined,
    });
  });

  return points;
}

export async function listLoadTrackingEvents(loadId: number): Promise<LoadTrackingEvent[]> {
  const events: LoadTrackingEvent[] = [];
  for (const row of listLoadLog(loadId)) {
    events.push({
      id: `audit-${row.id}`,
      at: row.action === "check_call" && row.old_value ? row.old_value : row.created_at,
      who: row.actor,
      note:
        row.action === "check_call"
          ? row.new_value
          : row.action === "sms"
            ? `Text to ${row.new_value}`
            : row.new_value || row.action.replaceAll("_", " "),
      source: row.action === "check_call" ? "check_call" : row.action === "sms" ? "sms" : "status",
    });
  }

  const load = getLoad(loadId);
  const truck = await truckGpsForLoad(loadId, load?.truck_id ?? null);
  if (truck?.recordedAt && validPoint(truck.latitude, truck.longitude)) {
    events.push({
      id: "samsara-latest",
      at: truck.recordedAt,
      who: "Samsara",
      note: truck.address || "Tractor GPS",
      gps: `${truck.latitude}, ${truck.longitude}`,
      source: "samsara",
    });
  }

  const trailer = await trailerGpsForLoad(loadId, load?.trailer_id ?? null);
  if (trailer?.recordedAt && validPoint(trailer.latitude, trailer.longitude)) {
    events.push({
      id: "orbcomm-latest",
      at: trailer.recordedAt,
      who: "Orbcomm",
      note: trailer.address || "Trailer GPS",
      gps: `${trailer.latitude}, ${trailer.longitude}`,
      source: "orbcomm",
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}
