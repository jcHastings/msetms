import { getDb } from "./db";
import {
  DEADHEAD_DISTANCE_MI,
  DEADHEAD_GAP_MS,
  DEADHEAD_GPS_ENTRY_CAP_MS,
  DEADHEAD_GPS_FAR_MI,
  DEADHEAD_GPS_LEAD_MS,
  DEADHEAD_LOOKBACK_MS,
  PICKUP_ACTUAL_SLACK_MS,
  type DeadheadSuggestion,
  type DeadheadWarningCode,
  parseDeadheadSuggestion,
} from "./empty-miles-shared";
import { coordsForStop, GEOFENCE_MILES, milesBetween, type GpsPoint } from "./geofence";
import { encodePolyline, fetchLaneDirections, mapsRoutingConfigured, stopRouteLabel } from "./routing";
import { estimateStateMiles, serializeRouteStateMiles, type RouteStateMile } from "./routing-shared";
import { getDriver, getLoad, listLoadsForDriver, listLoadsForTruck } from "./queries";
import { listStops } from "./stops";
import type { LoadStop } from "./stops-shared";
import type { LoadView } from "./types";
import { gpsInstantMs, instantMs, timeZoneForStop } from "./wall-time";

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
  city: string | null;
  state: string | null;
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
        `SELECT load_id, kind, city, state, window_start, window_end, arrived_at, departed_at FROM load_stops
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

function trimTime(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function stopZone(stop: StopWindowRow | undefined): string {
  return timeZoneForStop(stop?.state, stop?.city);
}

function deliveryStop(rows: StopWindowRow[] | undefined): StopWindowRow | undefined {
  const list = rows ?? [];
  return [...list].reverse().find((row) => row.kind === "delivery") ?? list[list.length - 1];
}

function pickupStop(rows: StopWindowRow[] | undefined): StopWindowRow | undefined {
  const list = rows ?? [];
  return list.find((row) => row.kind === "pickup") ?? list[0];
}

function deliveryKeyFrom(load: LoadView, rows: StopWindowRow[] | undefined): string {
  const stop = deliveryStop(rows);
  return (
    trimTime(stop?.departed_at) ||
    trimTime(stop?.arrived_at) ||
    trimTime(stop?.window_end) ||
    trimTime(stop?.window_start) ||
    load.delivery_end ||
    load.delivery_start ||
    ""
  );
}

/**
 * A stamped arrival months off the window, or from before this load existed, is not the pickup.
 * Use the appointment window instead.
 */
function pickupArrivalUsable(arrived: string, windowStart: string, windowEnd: string, createdAt: string, zone: string): boolean {
  const arrivedMs = instantMs(arrived, zone);
  if (arrivedMs == null) return false;
  const createdMs = instantMs(createdAt);
  if (createdMs != null && arrivedMs < createdMs) return false;
  const startMs = instantMs(windowStart, zone);
  const endMs = instantMs(windowEnd, zone) ?? startMs;
  if (startMs == null) return true;
  const end = endMs ?? startMs;
  return arrivedMs >= startMs - PICKUP_ACTUAL_SLACK_MS && arrivedMs <= end + PICKUP_ACTUAL_SLACK_MS;
}

function pickupKeyFrom(load: LoadView, rows: StopWindowRow[] | undefined): string {
  const stop = pickupStop(rows);
  const zone = stopZone(stop);
  const arrived = trimTime(stop?.arrived_at);
  const departed = trimTime(stop?.departed_at);
  const windowStart = trimTime(stop?.window_start) || trimTime(load.pickup_start);
  const windowEnd = trimTime(stop?.window_end) || trimTime(load.pickup_end);
  if (arrived) {
    if (pickupArrivalUsable(arrived, windowStart, windowEnd, load.created_at, zone)) return arrived;
    if (windowStart) return windowStart;
  }
  return departed || windowStart || "";
}

type TimedKey = { at: string; atMs: number };

function timedKey(at: string, zone: string): TimedKey | null {
  if (!at) return null;
  const atMs = instantMs(at, zone);
  if (atMs == null) return null;
  return { at, atMs };
}

function usablePlace(stop: LoadStop | null): string {
  if (!stop) return "";
  if (!stop.city.trim() && !stop.street.trim() && !/\d/.test(stop.name) && !stop.state.trim()) return "";
  return stopRouteLabel(stop);
}

type PriorStop = { load: LoadView; at: string; atMs: number };

function latestPrior(candidates: LoadView[], hereMs: number, windows: Map<number, StopWindowRow[]>): PriorStop | null {
  const prior = candidates
    .map((row) => {
      const rows = windows.get(row.id);
      const timed = timedKey(deliveryKeyFrom(row, rows), stopZone(deliveryStop(rows)));
      return timed ? { load: row, ...timed } : null;
    })
    .filter((row): row is PriorStop => row != null && row.atMs <= hereMs && hereMs - row.atMs <= DEADHEAD_LOOKBACK_MS)
    .sort((left, right) => right.atMs - left.atMs || right.load.id - left.load.id);
  return prior[0] ?? null;
}

export function previousLoadForEmptyMiles(load: LoadView): LoadView | null {
  return suggestedPrior(load)?.load ?? null;
}

type PriorBundle = {
  here: string;
  hereMs: number | null;
  chosen: PriorStop | null;
  driverPrior: PriorStop | null;
  truckPrior: PriorStop | null;
  rows: LoadView[];
  windows: Map<number, StopWindowRow[]>;
};

function pickupTimed(load: LoadView): TimedKey | null {
  const rows = stopWindowsByLoad([load.id]).get(load.id);
  return timedKey(pickupKeyFrom(load, rows), stopZone(pickupStop(rows)));
}

function priorBundle(load: LoadView): PriorBundle {
  const pickup = pickupTimed(load);
  const here = pickup?.at ?? "";
  const hereMs = pickup?.atMs ?? null;
  const driverRows = load.driver_id
    ? listLoadsForDriver(load.driver_id).filter(
        (row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === load.driver_id,
      )
    : [];
  const truckRows = load.truck_id
    ? listLoadsForTruck(load.truck_id).filter((row) => row.id !== load.id && row.status !== "cancelled")
    : [];
  const rows = [...new Map([...driverRows, ...truckRows].map((row) => [row.id, row])).values()];
  const windows = hereMs != null ? stopWindowsByLoad(rows.map((row) => row.id)) : new Map<number, StopWindowRow[]>();
  const driverPrior = hereMs != null ? latestPrior(driverRows, hereMs, windows) : null;
  const truckPrior = hereMs != null ? latestPrior(truckRows, hereMs, windows) : null;
  const chosen =
    driverPrior && truckPrior
      ? driverPrior.atMs >= truckPrior.atMs
        ? driverPrior
        : truckPrior
      : (driverPrior ?? truckPrior);
  return { here, hereMs, chosen, driverPrior, truckPrior, rows, windows };
}

function suggestedPrior(load: LoadView): PriorStop | null {
  return priorBundle(load).chosen;
}

export function nextLoadForEmptyMiles(load: LoadView, driverId = load.driver_id): LoadView | null {
  if (!driverId) return null;
  const hereRows = stopWindowsByLoad([load.id]).get(load.id);
  const here = timedKey(deliveryKeyFrom(load, hereRows), stopZone(deliveryStop(hereRows)));
  if (!here) return null;
  const rows = listLoadsForDriver(driverId).filter(
    (row) => row.id !== load.id && row.status !== "cancelled" && row.driver_id === driverId,
  );
  const windows = stopWindowsByLoad(rows.map((row) => row.id));
  const later = rows
    .map((row) => {
      const stopRows = windows.get(row.id);
      const timed = timedKey(pickupKeyFrom(row, stopRows), stopZone(pickupStop(stopRows)));
      return timed ? { load: row, ...timed } : null;
    })
    .filter((row): row is { load: LoadView; at: string; atMs: number } => row != null && row.atMs >= here.atMs)
    .sort((left, right) => left.atMs - right.atMs || left.load.id - right.load.id);
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

type GpsPing = { address: string; recorded_at: string; latitude: number | null; longitude: number | null; atMs: number };

function gpsPoint(ping: GpsPing): GpsPoint | null {
  if (ping.latitude == null || ping.longitude == null) return null;
  if (!Number.isFinite(ping.latitude) || !Number.isFinite(ping.longitude)) return null;
  return { latitude: ping.latitude, longitude: ping.longitude };
}

function pingInside(ping: GpsPing, dest: GpsPoint | null): boolean {
  const point = gpsPoint(ping);
  if (!point || !dest) return false;
  return milesBetween(point, dest) <= GEOFENCE_MILES;
}

function gpsPlace(ping: GpsPing): string {
  const address = ping.address.trim();
  if (address) return address;
  const point = gpsPoint(ping);
  if (!point) return "";
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}

function gpsBeforePickup(truckId: number | null, pickupMs: number | null): GpsPing[] {
  if (!truckId || pickupMs == null) return [];
  const since = new Date(pickupMs - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const readings = getDb()
    .prepare(
      `SELECT address, recorded_at, latitude, longitude FROM truck_gps_readings
       WHERE truck_id = ? AND recorded_at != '' AND recorded_at >= ?
       ORDER BY recorded_at ASC, id ASC`,
    )
    .all(truckId, since) as Array<Omit<GpsPing, "atMs">>;
  const truck = getDb()
    .prepare("SELECT gps_address, gps_recorded_at, gps_latitude, gps_longitude FROM trucks WHERE id = ?")
    .get(truckId) as
    | { gps_address: string; gps_recorded_at: string; gps_latitude: number | null; gps_longitude: number | null }
    | undefined;
  const rows = [...readings];
  if (truck?.gps_recorded_at) {
    rows.push({
      address: truck.gps_address || "",
      recorded_at: truck.gps_recorded_at,
      latitude: truck.gps_latitude,
      longitude: truck.gps_longitude,
    });
  }
  return rows
    .map((row) => {
      const atMs = gpsInstantMs(row.recorded_at);
      return atMs == null ? null : { ...row, atMs };
    })
    .filter((row): row is GpsPing => row != null && row.atMs <= pickupMs)
    .sort((left, right) => left.atMs - right.atMs);
}

/** Last ping a few hours before pickup, or the last one before the pickup fence. Not the ping at the shipper. */
function approachGps(pings: GpsPing[], pickupMs: number, pickupPoint: GpsPoint | null): GpsPing | null {
  const outside = pings.filter((ping) => !pingInside(ping, pickupPoint));
  const recent = outside.filter((ping) => ping.atMs >= pickupMs - DEADHEAD_GPS_LEAD_MS);
  if (recent.length) return recent[recent.length - 1] ?? null;
  const beforeEntry = outside.filter((ping) => ping.atMs >= pickupMs - DEADHEAD_GPS_ENTRY_CAP_MS);
  return beforeEntry[beforeEntry.length - 1] ?? null;
}

function placesDisagree(suggested: string, gps: string): boolean {
  const city = suggested.split(",")[0]?.trim().toLowerCase() ?? "";
  if (city.length < 3 || !gps.trim()) return false;
  return !gps.toLowerCase().includes(city);
}

function anotherLoadBetween(bundle: PriorBundle, chosen: PriorStop | null): boolean {
  if (!chosen || bundle.hereMs == null) return false;
  return bundle.rows.some((row) => {
    if (row.id === chosen.load.id) return false;
    const rows = bundle.windows.get(row.id);
    const delivery = timedKey(deliveryKeyFrom(row, rows), stopZone(deliveryStop(rows)));
    const pickup = timedKey(pickupKeyFrom(row, rows), stopZone(pickupStop(rows)));
    const atMs = delivery?.atMs ?? pickup?.atMs;
    return atMs != null && atMs > chosen.atMs && atMs < bundle.hereMs!;
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
  const hereMs = bundle.hereMs;
  const prior = bundle.chosen;
  const pings = gpsBeforePickup(load.truck_id, hereMs);
  const pickupStopRow = firstPickupStop(load.id);
  const to = usablePlace(pickupStopRow) || load.origin || "";
  const deliveryStop = prior ? lastDeliveryStop(prior.load.id) : null;
  const fromDelivery = usablePlace(deliveryStop);
  const pickupPoint = pickupStopRow ? coordsForStop(pickupStopRow) : null;
  const approach = hereMs == null ? null : approachGps(pings, hereMs, pickupPoint);
  const fallbackPing = pings[pings.length - 1] ?? null;
  let from = fromDelivery;
  let basis: DeadheadSuggestion["basis"] = fromDelivery ? "previous_delivery" : "gps";
  let alternativePlace = "";
  let farMiles: number | null = null;
  const deliveryPoint = deliveryStop ? coordsForStop(deliveryStop) : null;
  const approachPoint = approach ? gpsPoint(approach) : null;
  if (fromDelivery && approach && approachPoint && deliveryPoint) {
    const miles = milesBetween(approachPoint, deliveryPoint);
    if (miles > DEADHEAD_GPS_FAR_MI) {
      const gpsFrom = gpsPlace(approach);
      if (gpsFrom) {
        alternativePlace = fromDelivery;
        from = gpsFrom;
        basis = "gps";
        farMiles = miles;
      }
    }
  }
  if (!from && fallbackPing) from = gpsPlace(fallbackPing);
  if (!from || !to) return null;
  const warnings: DeadheadWarningCode[] = [];
  const notes: string[] = [];
  if (prior && hereMs != null) {
    const gap = hereMs - prior.atMs;
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
  if (alternativePlace && approach) {
    const milesText = farMiles == null ? "" : ` (${Math.round(farMiles).toLocaleString("en-US")} mi away)`;
    notes.push(`GPS before pickup is ${from}${milesText}. ${alternativePlace} is the other start.`);
  } else if (basis === "previous_delivery" && fallbackPing?.address && fromDelivery && placesDisagree(fromDelivery, fallbackPing.address)) {
    warnings.push("gps");
    notes.push(`GPS before pickup is ${fallbackPing.address}, not this place.`);
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
    basis,
    alternativePlace,
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
      alternativePlace: "",
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
