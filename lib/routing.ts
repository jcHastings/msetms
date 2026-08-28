import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import { getGoogleMapsApiKey } from "./env";
import { getLoad } from "./queries";
import {
  isOfficialDrivingRoute,
  metersToRouteMiles,
  routeGuideFromLoad,
  serializeRouteLegMiles,
  serializeRouteStateMiles,
  type LoadRouteGuide,
  type RouteStateMile,
} from "./routing-shared";
import { listStops, type LoadStop } from "./stops";
import { usStateForPoint, usStateName } from "./us-state-lookup";

export type { LoadRouteGuide, RouteStateMile } from "./routing-shared";
export { routeGuideFromLoad } from "./routing-shared";

export type RouteRefreshResult = {
  ok: boolean;
  configured: boolean;
  totalMiles: number | null;
  states: RouteStateMile[];
  source: LoadRouteGuide["source"];
  message: string;
};

type LatLng = { lat: number; lng: number };

export function mapsRoutingConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function stopRouteLabel(stop: Pick<LoadStop, "street" | "city" | "state" | "zip" | "name">): string {
  const line = [stop.street, [stop.city, stop.state].filter(Boolean).join(", "), stop.zip]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  if (line) return line;
  return stop.name.trim();
}

export function usableRouteStops(stops: LoadStop[]): LoadStop[] {
  return stops.filter((stop) => Boolean(stop.city.trim() || stop.street.trim() || /\d/.test(stop.name)));
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    out += encodeSigned(lat - lastLat);
    out += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

function encodeSigned(value: number): string {
  let next = value < 0 ? ~(value << 1) : value << 1;
  let chunk = "";
  while (next >= 0x20) {
    chunk += String.fromCharCode((0x20 | (next & 0x1f)) + 63);
    next >>= 5;
  }
  chunk += String.fromCharCode(next + 63);
  return chunk;
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateStateMiles(points: LatLng[], totalMiles: number): RouteStateMile[] {
  if (points.length < 2 || totalMiles <= 0) return [];
  const raw = new Map<string, { name: string; miles: number }>();
  let assigned = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const miles = haversineMiles(a, b);
    if (miles <= 0) continue;
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const state = usStateForPoint(mid.lat, mid.lng) ?? usStateForPoint(a.lat, a.lng);
    if (!state) continue;
    const current = raw.get(state.code) ?? { name: state.name, miles: 0 };
    current.miles += miles;
    raw.set(state.code, current);
    assigned += miles;
  }
  if (assigned <= 0) return [];
  const scale = totalMiles / assigned;
  return [...raw.entries()]
    .map(([state, row]) => ({
      state,
      name: row.name || usStateName(state),
      miles: Math.round(row.miles * scale * 10) / 10,
    }))
    .filter((row) => row.miles > 0)
    .sort((a, b) => b.miles - a.miles || a.state.localeCompare(b.state));
}

function persistRoute(
  loadId: number,
  input: {
    totalMiles: number | null;
    legMiles?: number[];
    states: RouteStateMile[];
    source: LoadRouteGuide["source"];
    polyline?: string;
  },
): LoadRouteGuide {
  const timestamp = new Date().toISOString();
  const legMiles = input.legMiles ?? [];
  const existing = getLoad(loadId);
  const polyline = input.polyline !== undefined ? input.polyline : String(existing?.route_polyline ?? "");
  getDb()
    .prepare(
      `UPDATE loads SET route_miles = ?, route_leg_miles = ?, route_state_miles = ?, route_calculated_at = ?, route_source = ?, route_polyline = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.totalMiles,
      serializeRouteLegMiles(legMiles),
      input.states.length ? serializeRouteStateMiles(input.states) : "",
      timestamp,
      input.source,
      polyline,
      timestamp,
      loadId,
    );
  return {
    totalMiles: input.totalMiles,
    legMiles,
    states: input.states,
    calculatedAt: timestamp,
    source: input.source,
  };
}

function currentGuide(loadId: number): LoadRouteGuide {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  return routeGuideFromLoad(load, { stopCount: usableRouteStops(listStops(loadId)).length });
}

function clearUnofficialRouteMiles(loadId: number, existing: LoadRouteGuide): LoadRouteGuide {
  if (existing.source === "manual") return existing;
  const load = getLoad(loadId);
  if (!load) return existing;
  const official = isOfficialDrivingRoute(load, { stopCount: usableRouteStops(listStops(loadId)).length });
  if (official === "manual" || official === "google") return existing;
  if (load.route_miles == null && !String(load.route_leg_miles ?? "").trim() && !String(load.route_polyline ?? "").trim()) {
    return existing;
  }
  return persistRoute(loadId, { totalMiles: null, legMiles: [], states: [], source: "", polyline: "" });
}

export function saveManualRouteMiles(loadId: number, miles: number | null): LoadRouteGuide {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  const rounded = miles == null || Number.isNaN(miles) ? null : Math.round(Math.max(0, miles) * 10) / 10;
  const saved = persistRoute(loadId, { totalMiles: rounded, states: [], source: rounded == null ? "" : "manual" });
  recordLoadAudit({
    loadId,
    action: "route",
    field: "miles",
    newValue: rounded == null ? "" : `${rounded} (manual)`,
  });
  return saved;
}

type DirectionsPayload = {
  status: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{ distance?: { value?: number } }>;
  }>;
};

export async function fetchLaneDirections(
  origin: string,
  destination: string,
  waypoints: string[] = [],
): Promise<{ totalMiles: number; legMiles: number[]; points: LatLng[] }> {
  const key = getGoogleMapsApiKey();
  if (!key) throw new Error("missing-key");
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("mode", "driving");
  if (waypoints.length) url.searchParams.set("waypoints", waypoints.slice(0, 23).join("|"));
  url.searchParams.set("key", key);
  // Do not log `url` — the query string includes the server key.
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Route could not be calculated.");
  const payload = (await response.json()) as DirectionsPayload;
  if (payload.status !== "OK" || !payload.routes?.[0]) {
    throw new Error(payload.status === "ZERO_RESULTS" ? "Google could not find a driving route." : "Route could not be calculated.");
  }
  const route = payload.routes[0];
  const legs = route.legs ?? [];
  const meters = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
  if (!legs.length || meters <= 0) throw new Error("Route could not be calculated.");
  const totalMiles = metersToRouteMiles(meters);
  const legMiles = legs.map((leg) => metersToRouteMiles(leg.distance?.value ?? 0));
  const points = decodePolyline(route.overview_polyline?.points ?? "");
  return { totalMiles, legMiles, points };
}

async function fetchGoogleDirections(
  stops: LoadStop[],
): Promise<{ totalMiles: number; legMiles: number[]; points: LatLng[] }> {
  const origin = stopRouteLabel(stops[0]);
  const destination = stopRouteLabel(stops[stops.length - 1]);
  const middle = stops.slice(1, -1).slice(0, 23).map(stopRouteLabel);
  return fetchLaneDirections(origin, destination, middle);
}

export async function refreshLoadRoute(
  loadId: number,
  options: { quiet?: boolean } = {},
): Promise<RouteRefreshResult> {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  let existing = currentGuide(loadId);
  const configured = mapsRoutingConfigured();
  if (!configured) {
    existing = clearUnofficialRouteMiles(loadId, existing);
    return {
      ok: true,
      configured: false,
      totalMiles: existing.totalMiles,
      states: existing.states,
      source: existing.source,
      message: "Enter miles manually.",
    };
  }
  const usable = usableRouteStops(listStops(loadId));
  if (usable.length < 2) {
    existing = clearUnofficialRouteMiles(loadId, existing);
    return {
      ok: true,
      configured: true,
      totalMiles: existing.totalMiles,
      states: existing.states,
      source: existing.source,
      message: "Need at least two stops with a city.",
    };
  }
  try {
    const { totalMiles, legMiles, points } = await fetchGoogleDirections(usable);
    const states = estimateStateMiles(points, totalMiles);
    persistRoute(loadId, { totalMiles, legMiles, states, source: "google", polyline: encodePolyline(points) });
    recordLoadAudit({
      loadId,
      action: "route",
      field: "miles",
      newValue: `${totalMiles} (Google)`,
    });
    return {
      ok: true,
      configured: true,
      totalMiles,
      states,
      source: "google",
      message: "Route miles updated from Google Directions.",
    };
  } catch (error) {
    existing = clearUnofficialRouteMiles(loadId, existing);
    if (options.quiet) {
      return {
        ok: false,
        configured: true,
        totalMiles: existing.totalMiles,
        states: existing.states,
        source: existing.source,
        message: error instanceof Error ? error.message : "Route could not be calculated.",
      };
    }
    throw error instanceof Error ? error : new Error("Route could not be calculated.");
  }
}

export async function refreshLoadRouteQuiet(loadId: number): Promise<void> {
  try {
    await refreshLoadRoute(loadId, { quiet: true });
  } catch {
    // Stop saves must succeed even when Google is down or the key is missing.
  }
  try {
    const { refreshEmptyMilesAround } = await import("./empty-miles");
    await refreshEmptyMilesAround(loadId);
  } catch {
    // Empty miles stay 0 when Directions is down.
  }
}
