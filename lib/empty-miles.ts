import { getDb } from "./db";
import { encodePolyline, fetchLaneDirections, mapsRoutingConfigured, stopRouteLabel } from "./routing";
import { estimateStateMiles, serializeRouteStateMiles, type RouteStateMile } from "./routing-shared";
import { getDriver, getLoad, listLoadsForDriver } from "./queries";
import { listStops } from "./stops";
import type { LoadStop } from "./stops-shared";
import type { LoadView } from "./types";

export type EmptyMilesGuide = {
  miles: number | null;
  states: RouteStateMile[];
  from: string;
  to: string;
  source: "google" | "";
};

function persistEmptyMiles(
  loadId: number,
  input: {
    miles: number | null;
    states: RouteStateMile[];
    from: string;
    to: string;
    source: "google" | "";
    polyline?: string;
  },
): EmptyMilesGuide {
  const timestamp = input.miles == null ? "" : new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE loads SET empty_miles = ?, empty_state_miles = ?, empty_from = ?, empty_to = ?,
         empty_calculated_at = ?, empty_source = ?, empty_polyline = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.miles,
      input.states.length ? serializeRouteStateMiles(input.states) : "",
      input.from,
      input.to,
      timestamp,
      input.source,
      input.polyline ?? "",
      new Date().toISOString(),
      loadId,
    );
  return {
    miles: input.miles,
    states: input.states,
    from: input.from,
    to: input.to,
    source: input.source,
  };
}

function lastDeliveryStop(loadId: number): LoadStop | null {
  const stops = listStops(loadId);
  return [...stops].reverse().find((stop) => stop.kind === "delivery") ?? stops[stops.length - 1] ?? null;
}

function firstPickupStop(loadId: number): LoadStop | null {
  const stops = listStops(loadId);
  return stops.find((stop) => stop.kind === "pickup") ?? stops[0] ?? null;
}

function usablePlace(stop: LoadStop | null): string {
  if (!stop) return "";
  if (!stop.city.trim() && !stop.street.trim() && !/\d/.test(stop.name) && !stop.state.trim()) return "";
  return stopRouteLabel(stop);
}

function deliverySortKey(load: LoadView): string {
  const stop = lastDeliveryStop(load.id);
  return stop?.window_end || stop?.window_start || load.delivery_end || load.delivery_start || "";
}

function pickupSortKey(load: LoadView): string {
  const stop = firstPickupStop(load.id);
  return stop?.window_start || load.pickup_start || "";
}

export function previousLoadForEmptyMiles(load: LoadView): LoadView | null {
  if (!load.driver_id) return null;
  const here = pickupSortKey(load);
  if (!here) return null;
  const prior = listLoadsForDriver(load.driver_id)
    .filter((row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === load.driver_id)
    .map((row) => ({ load: row, at: deliverySortKey(row) }))
    .filter((row) => row.at && row.at <= here)
    .sort((left, right) => right.at.localeCompare(left.at) || right.load.id - left.load.id);
  return prior[0]?.load ?? null;
}

export function nextLoadForEmptyMiles(load: LoadView, driverId = load.driver_id): LoadView | null {
  if (!driverId) return null;
  const here = deliverySortKey(load);
  if (!here) return null;
  const later = listLoadsForDriver(driverId)
    .filter((row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === driverId)
    .map((row) => ({ load: row, at: pickupSortKey(row) }))
    .filter((row) => row.at && row.at >= here)
    .sort((left, right) => left.at.localeCompare(right.at) || left.load.id - right.load.id);
  return later[0]?.load ?? null;
}

export function emptyLaneForLoad(load: LoadView): { from: string; to: string } | null {
  const previous = previousLoadForEmptyMiles(load);
  if (!previous) return null;
  const from = usablePlace(lastDeliveryStop(previous.id));
  const to = usablePlace(firstPickupStop(load.id));
  if (!from || !to) return null;
  return { from, to };
}

export async function refreshLoadEmptyMiles(loadId: number): Promise<EmptyMilesGuide> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const lane = emptyLaneForLoad(load);
  if (!lane) return persistEmptyMiles(loadId, { miles: 0, states: [], from: "", to: "", source: "" });
  if (!mapsRoutingConfigured()) {
    return persistEmptyMiles(loadId, { miles: null, states: [], from: lane.from, to: lane.to, source: "" });
  }
  try {
    const { totalMiles, points } = await fetchLaneDirections(lane.from, lane.to);
    const states = estimateStateMiles(points, totalMiles);
    return persistEmptyMiles(loadId, {
      miles: totalMiles,
      states,
      from: lane.from,
      to: lane.to,
      source: "google",
      polyline: encodePolyline(points),
    });
  } catch {
    return persistEmptyMiles(loadId, { miles: null, states: [], from: lane.from, to: lane.to, source: "" });
  }
}

export async function refreshEmptyMilesAround(loadId: number, previousDriverId?: number | null): Promise<void> {
  const load = getLoad(loadId);
  if (!load) return;
  await refreshLoadEmptyMiles(loadId);
  const next = nextLoadForEmptyMiles(load);
  if (next) await refreshLoadEmptyMiles(next.id);
  if (previousDriverId && previousDriverId !== load.driver_id) {
    const name = getDriver(previousDriverId)?.name ?? "";
    if (name) {
      const orphan = nextLoadForEmptyMiles(load, previousDriverId);
      if (orphan) await refreshLoadEmptyMiles(orphan.id);
    }
  }
}
