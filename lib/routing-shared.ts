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

export function routeGuideFromLoad(load: {
  route_miles?: number | null;
  route_leg_miles?: string | null;
  route_state_miles?: string | null;
  route_calculated_at?: string | null;
  route_source?: string | null;
}): LoadRouteGuide {
  const source = load.route_source === "google" || load.route_source === "manual" ? load.route_source : "";
  const legMiles = parseRouteLegMiles(load.route_leg_miles);
  return {
    totalMiles: load.route_miles ?? null,
    legMiles:
      legMiles.length === 0 && load.route_miles != null ? [] : legMiles,
    states: parseRouteStateMiles(load.route_state_miles),
    calculatedAt: load.route_calculated_at ?? "",
    source,
  };
}
