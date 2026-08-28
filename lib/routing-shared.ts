export type RouteStateMile = {
  state: string;
  name: string;
  miles: number;
};

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

export function officialEmptyMiles(miles: number | null | undefined, source: string | null | undefined): number | null {
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
    states: official ? parseRouteStateMiles(load.route_state_miles) : [],
    calculatedAt: official ? load.route_calculated_at ?? "" : "",
    source,
  };
}
