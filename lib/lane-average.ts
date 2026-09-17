import { getDb } from "./db";
import {
  compareLaneAverage,
  emptyLaneAverage,
  laneKey,
  laneLabel,
  roundLaneMoney,
  type LaneAverageSnapshot,
  type LaneAvgCompare,
} from "./lane-average-shared";

export type FleetLaneRateRow = {
  id: number;
  origin: string;
  destination: string;
  rate: number;
  route_miles: number | null;
  status: string;
  non_revenue: number;
};

type LoadLaneInput = {
  id?: number | null;
  origin: string;
  destination: string;
  rate?: number | null;
  route_miles?: number | null;
};

export function listFleetLaneRates(): FleetLaneRateRow[] {
  return getDb()
    .prepare(
      `SELECT id, origin, destination, rate, route_miles, status, IFNULL(non_revenue, 0) AS non_revenue
       FROM loads
       WHERE rate IS NOT NULL AND rate > 0
         AND IFNULL(non_revenue, 0) = 0
         AND status != 'cancelled'`,
    )
    .all() as FleetLaneRateRow[];
}

function snapshotFromSamples(
  origin: string,
  destination: string,
  samples: FleetLaneRateRow[],
): LaneAverageSnapshot | null {
  const key = laneKey(origin, destination);
  if (!key) return null;
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
    key,
    label: laneLabel(origin, destination),
    sampleSize: samples.length,
    avgRate,
    avgPerMile,
  };
}

export function laneAverageSnapshot(input: {
  origin: string;
  destination: string;
  excludeLoadId?: number | null;
  rows?: FleetLaneRateRow[];
}): LaneAverageSnapshot | null {
  const key = laneKey(input.origin, input.destination);
  if (!key) return null;
  const rows = input.rows ?? listFleetLaneRates();
  const samples = rows.filter((row) => {
    if (input.excludeLoadId && row.id === input.excludeLoadId) return false;
    return laneKey(row.origin, row.destination) === key;
  });
  return snapshotFromSamples(input.origin, input.destination, samples) ?? emptyLaneAverage();
}

export function laneAverageForLoad(load: LoadLaneInput): LaneAvgCompare {
  const snapshot = laneAverageSnapshot({
    origin: load.origin,
    destination: load.destination,
    excludeLoadId: load.id ?? null,
  });
  return compareLaneAverage(load.rate ?? null, snapshot, load.route_miles ?? null);
}

export function laneAveragesForLoads(loads: LoadLaneInput[]): Map<number, LaneAvgCompare> {
  const rows = listFleetLaneRates();
  const byKey = new Map<string, FleetLaneRateRow[]>();
  for (const row of rows) {
    const key = laneKey(row.origin, row.destination);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const out = new Map<number, LaneAvgCompare>();
  for (const load of loads) {
    if (load.id == null) continue;
    const key = laneKey(load.origin, load.destination);
    const samples = (byKey.get(key) ?? []).filter((row) => row.id !== load.id);
    const snapshot = snapshotFromSamples(load.origin, load.destination, samples);
    out.set(load.id, compareLaneAverage(load.rate ?? null, snapshot, load.route_miles ?? null));
  }
  return out;
}
