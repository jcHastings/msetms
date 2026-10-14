import { usStateForPoint, usStateName } from "./us-state-lookup";

export type RouteStateMile = {
  state: string;
  name: string;
  miles: number;
};

export type RouteLatLng = { lat: number; lng: number };

export type LoadRouteGuide = {
  totalMiles: number | null;
  legMiles: number[];
  states: RouteStateMile[];
  calculatedAt: string;
  source: "google" | "manual" | "";
};

export const METERS_PER_MILE = 1609.344;

export function metersToRouteMiles(meters: number): number {
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

export function formatRouteMiles(miles: number | null | undefined): string {
  if (miles == null || Number.isNaN(miles)) return "—";
  return `${miles.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} mi`;
}

export function parseRouteStateMiles(raw: string | null | undefined): RouteStateMile[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const item = row as Partial<RouteStateMile>;
        const miles = Number(item.miles);
        if (!item.state || Number.isNaN(miles)) return null;
        return {
          state: String(item.state).toUpperCase(),
          name: String(item.name ?? item.state),
          miles: Math.round(miles * 10) / 10,
        };
      })
      .filter((row): row is RouteStateMile => Boolean(row));
  } catch {
    return [];
  }
}

export function serializeRouteStateMiles(rows: RouteStateMile[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      state: row.state,
      name: row.name,
      miles: Math.round(row.miles * 10) / 10,
    })),
  );
}

export function parseRouteLegMiles(raw: string | null | undefined): number[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => (typeof value === "number" ? value : Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.round(value * 10) / 10);
  } catch {
    return [];
  }
}

export function serializeRouteLegMiles(miles: number[]): string {
  return JSON.stringify(miles.map((value) => Math.round(value * 10) / 10));
}

export function decodePolyline(encoded: string): RouteLatLng[] {
  const points: RouteLatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const text = String(encoded ?? "");
  while (index < text.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = text.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = text.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function segmentChordMiles(a: RouteLatLng, b: RouteLatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Miles from the saved route to the nearest point. Farther than this is off the loaded route. */
export const SWAP_OFF_ROUTE_MILES = 5;

export type RouteSplitAtPoint = {
  fromMiles: number;
  toMiles: number;
  fromPoints: RouteLatLng[];
  toPoints: RouteLatLng[];
  offsetMiles: number;
  offRoute: boolean;
};

function projectOntoSegment(
  a: RouteLatLng,
  b: RouteLatLng,
  target: RouteLatLng,
): { point: RouteLatLng; fraction: number } {
  const abLat = b.lat - a.lat;
  const abLng = b.lng - a.lng;
  const denom = abLat * abLat + abLng * abLng;
  if (denom <= 0) return { point: a, fraction: 0 };
  const raw = ((target.lat - a.lat) * abLat + (target.lng - a.lng) * abLng) / denom;
  const fraction = Math.max(0, Math.min(1, raw));
  return {
    point: { lat: a.lat + abLat * fraction, lng: a.lng + abLng * fraction },
    fraction,
  };
}

function roundRouteMile(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Split a saved driving polyline at the point nearest the swap.
 * Distances scale to the stored loaded miles. The offset to a point off the line is not added.
 */
export function splitRouteAtPoint(
  points: RouteLatLng[],
  target: RouteLatLng,
  totalMiles: number,
): RouteSplitAtPoint | null {
  if (points.length < 2 || !(totalMiles > 0) || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
    return null;
  }
  let chord = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let bestPoint = points[0];
  let bestIndex = 1;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = segmentChordMiles(start, end);
    const projected = projectOntoSegment(start, end, target);
    const distance = segmentChordMiles(projected.point, target);
    const along = chord + projected.fraction * length;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = along;
      bestPoint = projected.point;
      bestIndex = index;
    }
    chord += length;
  }
  if (!(chord > 0)) return null;
  const fromMiles = roundRouteMile(totalMiles * (bestAlong / chord));
  const toMiles = roundRouteMile(Math.max(0, totalMiles - fromMiles));
  return {
    fromMiles,
    toMiles,
    fromPoints: [...points.slice(0, bestIndex), bestPoint],
    toPoints: [bestPoint, ...points.slice(bestIndex)],
    offsetMiles: roundRouteMile(bestDistance),
    offRoute: bestDistance > SWAP_OFF_ROUTE_MILES,
  };
}

/**
 * Walk a Google Directions polyline and assign each step to the state that point is in.
 * Scales to the official driving total. A 2–3 point air hop across states returns [].
 */
export function estimateStateMiles(points: RouteLatLng[], totalMiles: number): RouteStateMile[] {
  if (points.length < 2 || !(totalMiles > 0)) return [];
  const vertexStates = points.map((point) => usStateForPoint(point.lat, point.lng)?.code ?? "");
  const known = new Set(vertexStates.filter(Boolean));
  if (points.length <= 3 && known.size > 1) return [];

  const raw = new Map<string, { name: string; miles: number }>();
  let chord = 0;
  let assigned = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const miles = segmentChordMiles(a, b);
    if (miles <= 0) continue;
    chord += miles;
    const samples = Math.max(1, Math.min(16, Math.ceil(miles * 4)));
    for (let step = 0; step < samples; step += 1) {
      const t = (step + 0.5) / samples;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const state = usStateForPoint(lat, lng);
      if (!state) continue;
      const slice = miles / samples;
      const current = raw.get(state.code) ?? { name: state.name, miles: 0 };
      current.miles += slice;
      raw.set(state.code, current);
      assigned += slice;
    }
  }
  if (chord <= 0 || assigned <= 0 || assigned / chord < 0.85) return [];
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

export function stateMilesFromPolyline(encoded: string | null | undefined, totalMiles: number | null | undefined): RouteStateMile[] {
  if (totalMiles == null || !(totalMiles > 0)) return [];
  const points = decodePolyline(String(encoded ?? ""));
  return estimateStateMiles(points, totalMiles);
}

export function emptyStateMilesFromLoad(load: {
  empty_miles?: number | null;
  empty_source?: string | null;
  empty_state_miles?: string | null;
  empty_polyline?: string | null;
  empty_confirmed?: number | boolean | null;
}): RouteStateMile[] {
  if (load.empty_confirmed === 0 || load.empty_confirmed === false) return [];
  if (officialEmptyMiles(load.empty_miles, load.empty_source, load.empty_confirmed) == null) return [];
  const encoded = String(load.empty_polyline ?? "").trim();
  if (!encoded) return [];
  return stateMilesFromPolyline(encoded, load.empty_miles);
}

/** Count points in an encoded polyline without allocating the path. */
export function encodedPolylinePointCount(encoded: string): number {
  const text = encoded.trim();
  if (!text) return 0;
  let index = 0;
  let count = 0;
  while (index < text.length) {
    for (let pass = 0; pass < 2; pass += 1) {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        if (index >= text.length) return count;
        byte = text.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
    }
    count += 1;
  }
  return count;
}

export type OfficialRouteOptions = {
  stopCount?: number;
};

export function expectedRouteLegCount(stopCount: number | null | undefined): number | null {
  if (stopCount == null || stopCount < 2) return null;
  return stopCount - 1;
}

export function minDrivingPolylinePoints(stopCount?: number | null): number {
  const stops = stopCount != null && stopCount > 0 ? stopCount : 2;
  return Math.max(20, stops * 6);
}

/** True only for a dense Directions overview path, not a stop-to-stop air line. */
export function isDrivingPolyline(encoded: string, stopCount?: number | null): boolean {
  const count = encodedPolylinePointCount(encoded);
  const stops = stopCount != null && stopCount > 0 ? stopCount : 2;
  if (count < 3) return false;
  if (count <= stops + 1) return false;
  return count >= minDrivingPolylinePoints(stops);
}

export function isOfficialDrivingRoute(
  load: {
    route_source?: string | null;
    route_polyline?: string | null;
    route_leg_miles?: string | null;
  },
  options: OfficialRouteOptions = {},
): "google" | "manual" | "" {
  if (load.route_source === "manual") return "manual";
  if (load.route_source !== "google") return "";
  const legs = parseRouteLegMiles(load.route_leg_miles);
  if (legs.length === 0) return "";
  if (!isDrivingPolyline(load.route_polyline ?? "", options.stopCount)) return "";
  const expected = expectedRouteLegCount(options.stopCount);
  if (expected != null && legs.length !== expected) return "";
  return "google";
}

export function officialEmptyMiles(
  miles: number | null | undefined,
  source: string | null | undefined,
  confirmed?: number | boolean | null,
): number | null {
  // Omitted means the caller has no confirmation flag (older helpers and fixtures).
  // An explicit 0 keeps stored deadhead out of IFTA until a dispatcher confirms it.
  if (confirmed === 0 || confirmed === false) return null;
  if (source === "google") return miles ?? null;
  if (miles == null) return null;
  if (miles === 0) return 0;
  return null;
}

/** Miles between stop[index] and stop[index+1]. Never invents a split of the total. */
export function milesForStopGap(
  gapIndex: number,
  stopCount: number,
  guide: Pick<LoadRouteGuide, "totalMiles" | "legMiles">,
): number | null {
  const stored = guide.legMiles[gapIndex];
  if (stored != null && Number.isFinite(stored)) return stored;
  if (stopCount === 2 && gapIndex === 0 && guide.totalMiles != null) return guide.totalMiles;
  return null;
}

export function routeGuideFromLoad(
  load: {
    route_miles?: number | null;
    route_leg_miles?: string | null;
    route_state_miles?: string | null;
    route_calculated_at?: string | null;
    route_source?: string | null;
    route_polyline?: string | null;
  },
  options: OfficialRouteOptions = {},
): LoadRouteGuide {
  const source = isOfficialDrivingRoute(load, options);
  const official = Boolean(source);
  const legMiles = parseRouteLegMiles(load.route_leg_miles);
  return {
    totalMiles: official ? load.route_miles ?? null : null,
    legMiles: official ? (legMiles.length === 0 && load.route_miles != null ? [] : legMiles) : [],
    states:
      official && source === "google"
        ? stateMilesFromPolyline(load.route_polyline, load.route_miles)
        : official
          ? parseRouteStateMiles(load.route_state_miles)
          : [],
    calculatedAt: official ? load.route_calculated_at ?? "" : "",
    source,
  };
}
