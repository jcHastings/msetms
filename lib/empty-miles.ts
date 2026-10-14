import { getDb } from "./db";
import {
  DEADHEAD_DISTANCE_MI,
  DEADHEAD_GAP_MS,
  type DeadheadSuggestion,
  type DeadheadWarningCode,
  parseDeadheadSuggestion,
} from "./empty-miles-shared";
import { encodePolyline, fetchLaneDirections, mapsRoutingConfigured, stopRouteLabel } from "./routing";
import { estimateStateMiles, serializeRouteStateMiles, type RouteStateMile } from "./routing-shared";
import { getDriver, getLoad, listLoadsForDriver, listLoadsForTruck } from "./queries";
import { listStops } from "./stops";
import type { LoadStop } from "./stops-shared";
import type { LoadView } from "./types";

export type EmptyMilesGuide = {
  miles: number | null;
  states: RouteStateMile[];
  from: string;
  to: string;
  source: "google" | "";
  pending?: boolean;
  warnings?: DeadheadWarningCode[];
};

function persistOfficial(
  loadId: number,
  input: {
    miles: number | null;
    states: RouteStateMile[];
    from: string;
    to: string;
    source: "google" | "";
    polyline?: string;
    confirmed: boolean;
    suggestion?: DeadheadSuggestion | null;
  },
): EmptyMilesGuide {
  const timestamp = input.miles == null ? "" : new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE loads SET empty_miles = ?, empty_state_miles = ?, empty_from = ?, empty_to = ?,
         empty_calculated_at = ?, empty_source = ?, empty_polyline = ?, empty_confirmed = ?,
         empty_suggestion = ?, updated_at = ?
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
      input.confirmed ? 1 : 0,
      input.suggestion ? JSON.stringify(input.suggestion) : "",
      new Date().toISOString(),
      loadId,
    );
  return {
    miles: input.miles,
    states: input.states,
    from: input.from,
    to: input.to,
    source: input.source,
    pending: !input.confirmed,
    warnings: input.suggestion?.warnings ?? [],
  };
}

function persistSuggestion(loadId: number, suggestion: DeadheadSuggestion): EmptyMilesGuide {
  getDb()
    .prepare(`UPDATE loads SET empty_suggestion = ?, empty_confirmed = 0, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(suggestion), new Date().toISOString(), loadId);
  return {
    miles: suggestion.miles,
    states: suggestion.states,
    from: suggestion.from,
    to: suggestion.to,
    source: suggestion.source,
    pending: true,
    warnings: suggestion.warnings,
  };
}

function lastDeliveryStop(loadId: number): LoadStop | null {
  const stops = listStops(loadId, { geofence: false });
  return [...stops].reverse().find((stop) => stop.kind === "delivery") ?? stops[stops.length - 1] ?? null;
}

function firstPickupStop(loadId: number): LoadStop | null {
  const stops = listStops(loadId, { geofence: false });
  return stops.find((stop) => stop.kind === "pickup") ?? stops[0] ?? null;
}

type StopWindowRow = {
  load_id: number;
  kind: string;
  window_start: string | null;
  window_end: string | null;
  arrived_at: string | null;
  departed_at: string | null;
};

/**
 * Sort keys for many loads in one query. listStops() runs a geofence pass and reads every
 * location per call, so calling it once per driver load pinned the CPU for minutes on drivers
 * with hundreds of imported ITS loads (load 1006275, 10/13).
 */
function stopWindowsByLoad(loadIds: number[]): Map<number, StopWindowRow[]> {
  const out = new Map<number, StopWindowRow[]>();
  const ids = [...new Set(loadIds)];
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    if (!chunk.length) continue;
    const rows = getDb()
      .prepare(
        `SELECT load_id, kind, window_start, window_end, arrived_at, departed_at FROM load_stops
         WHERE load_id IN (${chunk.map(() => "?").join(", ")}) ORDER BY load_id, sequence, id`,
      )
      .all(...chunk) as StopWindowRow[];
    for (const row of rows) {
      const list = out.get(row.load_id) ?? [];
      list.push(row);
      out.set(row.load_id, list);
    }
  }
  return out;
}

function actualOrWindow(actual: string | null | undefined, fallback: string | null | undefined): string {
  return String(actual ?? "").trim() || String(fallback ?? "").trim();
}

function deliveryKeyFrom(load: LoadView, rows: StopWindowRow[] | undefined): string {
  const list = rows ?? [];
  const stop = [...list].reverse().find((row) => row.kind === "delivery") ?? list[list.length - 1];
  return (
    actualOrWindow(stop?.departed_at, "") ||
    actualOrWindow(stop?.arrived_at, "") ||
    actualOrWindow(stop?.window_end, stop?.window_start) ||
    load.delivery_end ||
    load.delivery_start ||
    ""
  );
}

function pickupKeyFrom(load: LoadView, rows: StopWindowRow[] | undefined): string {
  const list = rows ?? [];
  const stop = list.find((row) => row.kind === "pickup") ?? list[0];
  return (
    actualOrWindow(stop?.arrived_at, "") ||
    actualOrWindow(stop?.departed_at, "") ||
    actualOrWindow(stop?.window_start, "") ||
    load.pickup_start ||
    ""
  );
}

function usablePlace(stop: LoadStop | null): string {
  if (!stop) return "";
  if (!stop.city.trim() && !stop.street.trim() && !/\d/.test(stop.name) && !stop.state.trim()) return "";
  return stopRouteLabel(stop);
}

function deliverySortKey(load: LoadView): string {
  return deliveryKeyFrom(load, stopWindowsByLoad([load.id]).get(load.id));
}

function pickupSortKey(load: LoadView): string {
  return pickupKeyFrom(load, stopWindowsByLoad([load.id]).get(load.id));
}

type PriorStop = { load: LoadView; at: string };

function latestPrior(candidates: LoadView[], here: string, windows: Map<number, StopWindowRow[]>): PriorStop | null {
  const prior = candidates
    .map((row) => ({ load: row, at: deliveryKeyFrom(row, windows.get(row.id)) }))
    .filter((row) => row.at && row.at <= here)
    .sort((left, right) => right.at.localeCompare(left.at) || right.load.id - left.load.id);
  return prior[0] ?? null;
}

export function previousLoadForEmptyMiles(load: LoadView): LoadView | null {
  return suggestedPrior(load)?.load ?? null;
}

type PriorBundle = {
  here: string;
  chosen: PriorStop | null;
  driverPrior: PriorStop | null;
  truckPrior: PriorStop | null;
  rows: LoadView[];
  windows: Map<number, StopWindowRow[]>;
};

function priorBundle(load: LoadView): PriorBundle {
  const here = pickupSortKey(load);
  const driverRows = load.driver_id
    ? listLoadsForDriver(load.driver_id).filter(
        (row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === load.driver_id,
      )
    : [];
  const truckRows = load.truck_id
    ? listLoadsForTruck(load.truck_id).filter((row) => row.id !== load.id && row.status !== "cancelled")
    : [];
  const rows = [...new Map([...driverRows, ...truckRows].map((row) => [row.id, row])).values()];
  const windows = here ? stopWindowsByLoad(rows.map((row) => row.id)) : new Map<number, StopWindowRow[]>();
  const driverPrior = here ? latestPrior(driverRows, here, windows) : null;
  const truckPrior = here ? latestPrior(truckRows, here, windows) : null;
  const chosen =
    driverPrior && truckPrior ? (driverPrior.at >= truckPrior.at ? driverPrior : truckPrior) : (driverPrior ?? truckPrior);
  return { here, chosen, driverPrior, truckPrior, rows, windows };
}

function suggestedPrior(load: LoadView): PriorStop | null {
  return priorBundle(load).chosen;
}

export function nextLoadForEmptyMiles(load: LoadView, driverId = load.driver_id): LoadView | null {
  if (!driverId) return null;
  const here = deliverySortKey(load);
  if (!here) return null;
  const rows = listLoadsForDriver(driverId).filter(
    (row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === driverId,
  );
  const windows = stopWindowsByLoad(rows.map((row) => row.id));
  const later = rows
    .map((row) => ({ load: row, at: pickupKeyFrom(row, windows.get(row.id)) }))
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

type GpsPing = { address: string; recorded_at: string; latitude: number | null; longitude: number | null };

function gpsBeforePickup(truckId: number | null, pickupAt: string): GpsPing | null {
  if (!truckId || !pickupAt) return null;
  const reading = getDb()
    .prepare(
      `SELECT address, recorded_at, latitude, longitude FROM truck_gps_readings
       WHERE truck_id = ? AND recorded_at != '' AND recorded_at <= ?
       ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    )
    .get(truckId, pickupAt) as GpsPing | undefined;
  const truck = getDb()
    .prepare("SELECT gps_address, gps_recorded_at, gps_latitude, gps_longitude FROM trucks WHERE id = ?")
    .get(truckId) as
    | { gps_address: string; gps_recorded_at: string; gps_latitude: number | null; gps_longitude: number | null }
    | undefined;
  const truckPing =
    truck && truck.gps_recorded_at && truck.gps_recorded_at <= pickupAt
      ? {
          address: truck.gps_address || "",
          recorded_at: truck.gps_recorded_at,
          latitude: truck.gps_latitude,
          longitude: truck.gps_longitude,
        }
      : null;
  if (reading && truckPing) return reading.recorded_at >= truckPing.recorded_at ? reading : truckPing;
  return reading ?? truckPing;
}

function placesDisagree(suggested: string, gps: string): boolean {
  const city = suggested.split(",")[0]?.trim().toLowerCase() ?? "";
  if (city.length < 3 || !gps.trim()) return false;
  return !gps.toLowerCase().includes(city);
}

function anotherLoadBetween(bundle: PriorBundle, chosen: PriorStop | null): boolean {
  if (!chosen || !bundle.here) return false;
  return bundle.rows.some((row) => {
    if (row.id === chosen.load.id) return false;
    const at = deliveryKeyFrom(row, bundle.windows.get(row.id)) || pickupKeyFrom(row, bundle.windows.get(row.id));
    return Boolean(at && at > chosen.at && at < bundle.here);
  });
}

async function routeEmptyLane(from: string, to: string): Promise<{
  miles: number | null;
  states: RouteStateMile[];
  polyline: string;
  source: "google" | "";
}> {
  if (!mapsRoutingConfigured()) return { miles: null, states: [], polyline: "", source: "" };
  try {
    const { totalMiles, points } = await fetchLaneDirections(from, to);
    return {
      miles: totalMiles,
      states: estimateStateMiles(points, totalMiles),
      polyline: encodePolyline(points),
      source: "google",
    };
  } catch {
    return { miles: null, states: [], polyline: "", source: "" };
  }
}

export async function buildDeadheadSuggestion(load: LoadView): Promise<DeadheadSuggestion | null> {
  const bundle = priorBundle(load);
  const here = bundle.here;
  const prior = bundle.chosen;
  const ping = gpsBeforePickup(load.truck_id, here);
  const to = usablePlace(firstPickupStop(load.id)) || load.origin || "";
  const fromDelivery = prior ? usablePlace(lastDeliveryStop(prior.load.id)) : "";
  const from = fromDelivery || ping?.address || "";
  if (!from || !to) return null;
  const warnings: DeadheadWarningCode[] = [];
  const notes: string[] = [];
  if (prior) {
    const gap = Date.parse(here) - Date.parse(prior.at);
    if (Number.isFinite(gap) && gap > DEADHEAD_GAP_MS) {
      warnings.push("gap");
      notes.push("The gap since that delivery is more than 3 days.");
    }
  }
  if (
    (bundle.driverPrior && bundle.truckPrior && bundle.driverPrior.load.id !== bundle.truckPrior.load.id) ||
    anotherLoadBetween(bundle, prior)
  ) {
    warnings.push("between");
    notes.push("Another load falls between this start and the pickup.");
  }
  if (ping?.address && fromDelivery && placesDisagree(fromDelivery, ping.address)) {
    warnings.push("gps");
    notes.push(`GPS before pickup is ${ping.address}, not this place.`);
  }
  const routed = await routeEmptyLane(from, to);
  if (routed.miles != null && routed.miles > DEADHEAD_DISTANCE_MI) {
    warnings.push("distance");
    notes.push(`Suggested empty miles are ${Math.round(routed.miles).toLocaleString("en-US")}, over ${DEADHEAD_DISTANCE_MI}.`);
  }
  return {
    driverName: load.driver_name?.trim() || "the driver",
    place: from,
    from,
    to,
    miles: routed.miles,
    states: routed.states,
    polyline: routed.polyline,
    source: routed.source,
    basis: fromDelivery ? "previous_delivery" : "gps",
    warnings,
    notes,
  };
}

export async function refreshLoadEmptyMiles(loadId: number): Promise<EmptyMilesGuide> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (Number(load.empty_confirmed) === 1) {
    return {
      miles: load.empty_miles,
      states: [],
      from: load.empty_from,
      to: load.empty_to,
      source: load.empty_source === "google" ? "google" : "",
      pending: false,
      warnings: [],
    };
  }
  const suggestion = await buildDeadheadSuggestion(load);
  if (!suggestion) {
    return persistOfficial(loadId, { miles: 0, states: [], from: "", to: "", source: "", confirmed: true, suggestion: null });
  }
  return persistSuggestion(loadId, suggestion);
}

export async function confirmLoadDeadhead(loadId: number, overridePlace?: string): Promise<EmptyMilesGuide> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const stored = parseDeadheadSuggestion(load.empty_suggestion);
  const place = String(overridePlace ?? "").trim() || stored?.place || "";
  if (!place) throw new Error("Pick a start place first.");
  const to = usablePlace(firstPickupStop(loadId)) || stored?.to || load.origin;
  if (!to) throw new Error("This load has no pickup to measure from.");
  const samePlace = stored && place === stored.place && stored.miles != null;
  const routed = samePlace
    ? { miles: stored.miles, states: stored.states, polyline: stored.polyline, source: stored.source }
    : await routeEmptyLane(place, to);
  const suggestion: DeadheadSuggestion = {
    ...(stored ?? {
      driverName: load.driver_name?.trim() || "the driver",
      basis: "previous_delivery",
      warnings: [],
      notes: [],
    }),
    place,
    from: place,
    to,
    miles: routed.miles,
    states: routed.states,
    polyline: routed.polyline,
    source: routed.source,
  };
  return persistOfficial(loadId, {
    miles: routed.miles,
    states: routed.states,
    from: place,
    to,
    source: routed.source,
    polyline: routed.polyline,
    confirmed: true,
    suggestion,
  });
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
