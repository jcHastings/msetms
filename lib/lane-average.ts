import { getDb } from "./db";
import {
  compareLaneAverage,
  laneEndsWithinRadius,
  laneKey,
  laneLabel,
  resolveLanePoint,
  roundLaneMoney,
  type LaneAverageSnapshot,
  type LaneAvgCompare,
  type LaneLatLng,
  type LaneLocationHint,
} from "./lane-average-shared";

export type FleetLaneRateRow = {
  id: number;
  origin: string;
  destination: string;
  rate: number;
  route_miles: number | null;
  status: string;
  non_revenue: number;
  shipper_location_id: number | null;
  consignee_location_id: number | null;
};

export type ResolvedFleetLaneRate = FleetLaneRateRow & {
  pickup: LaneLatLng;
  delivery: LaneLatLng;
};

type LoadLaneInput = {
  id?: number | null;
  origin: string;
  destination: string;
  rate?: number | null;
  route_miles?: number | null;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
};

type LocationCoordRow = LaneLocationHint & { id: number };

type FleetLaneCache = {
  stamp: string;
  rows: ResolvedFleetLaneRate[];
  hints: LaneLocationHint[];
  byId: Map<number, LaneLatLng>;
};

let fleetLaneCache: FleetLaneCache | null = null;

function listLaneLocationRows(): LocationCoordRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, city, state, latitude AS lat, longitude AS lng
       FROM locations
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    )
    .all() as LocationCoordRow[];
}

export function listFleetLaneRates(): FleetLaneRateRow[] {
  return getDb()
    .prepare(
      `SELECT id, origin, destination, rate, route_miles, status,
              IFNULL(non_revenue, 0) AS non_revenue,
              shipper_location_id, consignee_location_id
       FROM loads
       WHERE rate IS NOT NULL AND rate > 0
         AND IFNULL(non_revenue, 0) = 0
         AND status != 'cancelled'`,
    )
    .all() as FleetLaneRateRow[];
}

function fleetLaneStamp(): string {
  const loads = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, IFNULL(MAX(updated_at), '') AS stamp
       FROM loads
       WHERE rate IS NOT NULL AND rate > 0
         AND IFNULL(non_revenue, 0) = 0
         AND status != 'cancelled'`,
    )
    .get() as { n: number; stamp: string };
  const locations = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, IFNULL(MAX(updated_at), '') AS stamp
       FROM locations
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    )
    .get() as { n: number; stamp: string };
  return `loads:${loads.n}:${loads.stamp}|locs:${locations.n}:${locations.stamp}`;
}

function coordsByLocationId(rows: LocationCoordRow[]): Map<number, LaneLatLng> {
  const map = new Map<number, LaneLatLng>();
  for (const row of rows) {
    if (row.lat == null || row.lng == null) continue;
    map.set(row.id, { lat: row.lat, lng: row.lng });
  }
  return map;
}

function resolveLoadEnd(
  text: string,
  locationId: number | null | undefined,
  byId: Map<number, LaneLatLng>,
  hints: LaneLocationHint[],
): LaneLatLng | null {
  if (locationId != null && byId.has(locationId)) return byId.get(locationId) ?? null;
  return resolveLanePoint(text, hints);
}

function resolveLoadEnds(
  load: {
    origin: string;
    destination: string;
    shipper_location_id?: number | null;
    consignee_location_id?: number | null;
  },
  byId: Map<number, LaneLatLng>,
  hints: LaneLocationHint[],
): { pickup: LaneLatLng; delivery: LaneLatLng } | null {
  const pickup = resolveLoadEnd(load.origin, load.shipper_location_id, byId, hints);
  const delivery = resolveLoadEnd(load.destination, load.consignee_location_id, byId, hints);
  if (!pickup || !delivery) return null;
  return { pickup, delivery };
}

function snapshotFromSamples(
  origin: string,
  destination: string,
  samples: FleetLaneRateRow[],
): LaneAverageSnapshot | null {
  const key = laneKey(origin, destination);
  const label = laneLabel(origin, destination);
  if (!key && !label) return null;
  const avgRate = samples.length
    ? roundLaneMoney(samples.reduce((sum, row) => sum + row.rate, 0) / samples.length)
    : null;
  const withMiles = samples.filter((row) => row.route_miles != null && row.route_miles > 0);
  const avgPerMile = withMiles.length
    ? roundLaneMoney(
        withMiles.reduce((sum, row) => sum + row.rate / Number(row.route_miles), 0) / withMiles.length,
      )
    : null;
  return {
    key: key || label,
    label,
    sampleSize: samples.length,
    avgRate,
    avgPerMile,
  };
}

function resolveFleetRows(
  rows: FleetLaneRateRow[],
  byId: Map<number, LaneLatLng>,
  hints: LaneLocationHint[],
): ResolvedFleetLaneRate[] {
  const resolved: ResolvedFleetLaneRate[] = [];
  for (const row of rows) {
    const ends = resolveLoadEnds(row, byId, hints);
    if (!ends) continue;
    resolved.push({ ...row, pickup: ends.pickup, delivery: ends.delivery });
  }
  return resolved;
}

/** One fleet scan + pre-resolved ends. Reused until loads/locations stamp changes. */
export function getResolvedFleetLaneRates(): {
  rows: ResolvedFleetLaneRate[];
  hints: LaneLocationHint[];
  byId: Map<number, LaneLatLng>;
} {
  const stamp = fleetLaneStamp();
  if (fleetLaneCache && fleetLaneCache.stamp === stamp) {
    return { rows: fleetLaneCache.rows, hints: fleetLaneCache.hints, byId: fleetLaneCache.byId };
  }
  const locations = listLaneLocationRows();
  const hints = locations;
  const byId = coordsByLocationId(locations);
  const rows = resolveFleetRows(listFleetLaneRates(), byId, hints);
  fleetLaneCache = { stamp, rows, hints, byId };
  return { rows, hints, byId };
}

function samplesInRadius(
  candidate: LoadLaneInput,
  fleet: ResolvedFleetLaneRate[],
  byId: Map<number, LaneLatLng>,
  hints: LaneLocationHint[],
): FleetLaneRateRow[] | null {
  const ends = resolveLoadEnds(candidate, byId, hints);
  if (!ends) return null;
  return fleet.filter((row) => {
    if (candidate.id != null && row.id === candidate.id) return false;
    return laneEndsWithinRadius(ends.pickup, ends.delivery, row.pickup, row.delivery);
  });
}

function radiusContext(rows?: FleetLaneRateRow[]) {
  if (!rows) return getResolvedFleetLaneRates();
  const locations = listLaneLocationRows();
  const hints = locations;
  const byId = coordsByLocationId(locations);
  return { rows: resolveFleetRows(rows, byId, hints), hints, byId };
}

export function laneAverageMatchIds(input: {
  origin: string;
  destination: string;
  excludeLoadId?: number | null;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
}): number[] | null {
  const { hints, byId, rows } = getResolvedFleetLaneRates();
  const samples = samplesInRadius(
    {
      id: input.excludeLoadId ?? null,
      origin: input.origin,
      destination: input.destination,
      shipper_location_id: input.shipper_location_id,
      consignee_location_id: input.consignee_location_id,
    },
    rows,
    byId,
    hints,
  );
  return samples ? samples.map((row) => row.id) : null;
}

export function laneAverageSnapshot(input: {
  origin: string;
  destination: string;
  excludeLoadId?: number | null;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
  rows?: FleetLaneRateRow[];
}): LaneAverageSnapshot | null {
  const { hints, byId, rows } = radiusContext(input.rows);
  const samples = samplesInRadius(
    {
      id: input.excludeLoadId ?? null,
      origin: input.origin,
      destination: input.destination,
      shipper_location_id: input.shipper_location_id,
      consignee_location_id: input.consignee_location_id,
    },
    rows,
    byId,
    hints,
  );
  if (!samples) return null;
  return snapshotFromSamples(input.origin, input.destination, samples);
}

export function laneAverageForLoad(load: LoadLaneInput): LaneAvgCompare {
  const snapshot = laneAverageSnapshot({
    origin: load.origin,
    destination: load.destination,
    excludeLoadId: load.id ?? null,
    shipper_location_id: load.shipper_location_id,
    consignee_location_id: load.consignee_location_id,
  });
  return compareLaneAverage(load.rate ?? null, snapshot, load.route_miles ?? null);
}

export function laneAveragesForLoads(loads: LoadLaneInput[]): Map<number, LaneAvgCompare> {
  const { hints, byId, rows } = getResolvedFleetLaneRates();
  const out = new Map<number, LaneAvgCompare>();
  for (const load of loads) {
    if (load.id == null) continue;
    const samples = samplesInRadius(load, rows, byId, hints);
    const snapshot = samples ? snapshotFromSamples(load.origin, load.destination, samples) : null;
    out.set(load.id, compareLaneAverage(load.rate ?? null, snapshot, load.route_miles ?? null));
  }
  return out;
}

/** Board: load-scoped compare against the cached resolved fleet — no fresh listFleetLaneRates. */
export function laneAveragesForBoard(loads: LoadLaneInput[]): Map<number, LaneAvgCompare> {
  return laneAveragesForLoads(loads);
}
