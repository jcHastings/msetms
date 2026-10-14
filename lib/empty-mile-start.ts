/**
 * Which delivery the empty-mile suggestion starts from.
 * No database. Live suggestions use mode "current".
 * Mode "legacy" is the pre-fix rule, kept so the read-only audit can print the old start.
 */

import { DEADHEAD_GPS_ENTRY_CAP_MS, DEADHEAD_GPS_FAR_MI, DEADHEAD_GPS_LEAD_MS, DEADHEAD_LOOKBACK_MS, PICKUP_ACTUAL_SLACK_MS } from "./empty-miles-shared";
import { GEOFENCE_MILES, milesBetween } from "./geofence";
import { gpsInstantMs, instantMs, timeZoneForStop } from "./wall-time";

export type StartMode = "legacy" | "current";

export type MileLoad = {
  id: number;
  status: string;
  driverId: number | null;
  truckId: number | null;
  createdAt: string;
  pickupStart: string;
  pickupEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
};

export type MileStop = {
  kind?: string | null;
  city?: string | null;
  state?: string | null;
  street?: string | null;
  zip?: string | null;
  name?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type PriorChoice = {
  load: MileLoad | null;
  place: string;
  at: string;
  atMs: number | null;
  pickupAt: string;
  pickupMs: number | null;
};

type StopMap = { get(id: number): readonly MileStop[] | undefined };

function trim(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function isFinishedForEmptyMiles(status: string): boolean {
  return status === "delivered" || status === "completed";
}

function deliveryStopOf(stops: readonly MileStop[]): MileStop | undefined {
  return [...stops].reverse().find((row) => row.kind === "delivery") ?? stops[stops.length - 1];
}

function pickupStopOf(stops: readonly MileStop[]): MileStop | undefined {
  return stops.find((row) => row.kind === "pickup") ?? stops[0];
}

/** A stamp from before the load existed, or more than a day off the appointment, is not the stop. */
export function stopStampUsable(
  stamp: string,
  windowStart: string,
  windowEnd: string,
  createdAt: string,
  zone: string,
): boolean {
  const stampMs = instantMs(stamp, zone);
  if (stampMs == null) return false;
  const createdMs = instantMs(createdAt);
  if (createdMs != null && stampMs < createdMs) return false;
  const startMs = instantMs(windowStart, zone);
  const endMs = instantMs(windowEnd, zone) ?? startMs;
  if (startMs == null) return true;
  const end = endMs ?? startMs;
  return stampMs >= startMs - PICKUP_ACTUAL_SLACK_MS && stampMs <= end + PICKUP_ACTUAL_SLACK_MS;
}

export function deliveryKey(load: MileLoad, stops: readonly MileStop[], mode: StartMode): string {
  const stop = deliveryStopOf(stops);
  const departed = trim(stop?.departed_at);
  const arrived = trim(stop?.arrived_at);
  const windowEnd = trim(stop?.window_end) || trim(load.deliveryEnd);
  const windowStart = trim(stop?.window_start) || trim(load.deliveryStart);
  const scheduledStart = windowStart || windowEnd;
  const scheduledEnd = windowEnd || windowStart;
  const fallback = windowEnd || windowStart || trim(load.deliveryEnd) || trim(load.deliveryStart);
  if (mode === "legacy") return departed || arrived || fallback;
  const zone = timeZoneForStop(stop?.state, stop?.city);
  if (departed && stopStampUsable(departed, scheduledStart, scheduledEnd, load.createdAt, zone)) return departed;
  if (arrived && stopStampUsable(arrived, scheduledStart, scheduledEnd, load.createdAt, zone)) return arrived;
  return fallback;
}

export function pickupKey(load: MileLoad, stops: readonly MileStop[]): string {
  const stop = pickupStopOf(stops);
  const zone = timeZoneForStop(stop?.state, stop?.city);
  const arrived = trim(stop?.arrived_at);
  const departed = trim(stop?.departed_at);
  const windowStart = trim(stop?.window_start) || trim(load.pickupStart);
  const windowEnd = trim(stop?.window_end) || trim(load.pickupEnd);
  if (arrived) {
    if (stopStampUsable(arrived, windowStart, windowEnd, load.createdAt, zone)) return arrived;
    if (windowStart) return windowStart;
  }
  return departed || windowStart || "";
}

/** Street, city, state. Blank when the stop has no place a dispatcher could confirm. */
export function stopPlace(stop: MileStop | undefined): string {
  if (!stop) return "";
  const street = trim(stop.street);
  const city = trim(stop.city);
  const state = trim(stop.state);
  const zip = trim(stop.zip);
  const name = trim(stop.name);
  if (!city && !street && !/\d/.test(name) && !state) return "";
  const line = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(", ");
  return line || name;
}

export function stopPoint(stop: MileStop | undefined): { latitude: number; longitude: number } | null {
  if (!stop || stop.latitude == null || stop.longitude == null) return null;
  if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return null;
  return { latitude: stop.latitude, longitude: stop.longitude };
}

type TimedLoad = { load: MileLoad; at: string; atMs: number };

function latestDelivery(
  loads: MileLoad[],
  hereMs: number,
  stops: StopMap,
  mode: StartMode,
  lookback: boolean,
): TimedLoad | null {
  const prior = loads
    .map((row) => {
      const rows = stops.get(row.id) ?? [];
      const at = deliveryKey(row, rows, mode);
      const zone = timeZoneForStop(deliveryStopOf(rows)?.state, deliveryStopOf(rows)?.city);
      const atMs = instantMs(at, zone);
      if (atMs == null) return null;
      return { load: row, at, atMs };
    })
    .filter((row): row is TimedLoad => {
      if (!row || row.atMs > hereMs) return false;
      if (lookback && hereMs - row.atMs > DEADHEAD_LOOKBACK_MS) return false;
      return true;
    })
    .sort((left, right) => right.atMs - left.atMs || right.load.id - left.load.id);
  return prior[0] ?? null;
}

/**
 * Current: the driver's most recent delivered or completed load, by actual delivery time.
 * No 7-day cutoff. Cancelled, in-progress, and accounting loads are not a start.
 * The truck on that load is the truck the driver was on. The load's assigned unit is not mixed in.
 * Legacy: any non-cancelled driver load and any non-cancelled load on the assigned truck, newest
 * delivery inside 7 days, trusting stop stamps even when they are stale.
 */
export function choosePrior(input: {
  load: MileLoad;
  driverLoads: readonly MileLoad[];
  truckLoads: readonly MileLoad[];
  stops: StopMap;
  mode: StartMode;
}): PriorChoice {
  const pickupStops = input.stops.get(input.load.id) ?? [];
  const pickupAt = pickupKey(input.load, pickupStops);
  const pickupMs = instantMs(pickupAt, timeZoneForStop(pickupStopOf(pickupStops)?.state, pickupStopOf(pickupStops)?.city));
  const empty: PriorChoice = { load: null, place: "", at: "", atMs: null, pickupAt, pickupMs };
  if (pickupMs == null) return empty;
  const driverLoads = input.driverLoads.filter(
    (row) => row.id !== input.load.id && row.driverId != null && row.driverId === input.load.driverId,
  );
  if (input.mode === "current") {
    if (input.load.driverId == null) return empty;
    const finished = driverLoads.filter((row) => isFinishedForEmptyMiles(row.status));
    const chosen = latestDelivery(finished, pickupMs, input.stops, "current", false);
    if (!chosen) return empty;
    const place = stopPlace(deliveryStopOf(input.stops.get(chosen.load.id) ?? []));
    return { load: chosen.load, place, at: chosen.at, atMs: chosen.atMs, pickupAt, pickupMs };
  }
  const driverPrior = latestDelivery(
    driverLoads.filter((row) => row.status !== "cancelled"),
    pickupMs,
    input.stops,
    "legacy",
    true,
  );
  const truckPrior = latestDelivery(
    input.truckLoads.filter((row) => row.id !== input.load.id && row.status !== "cancelled"),
    pickupMs,
    input.stops,
    "legacy",
    true,
  );
  const chosen =
    driverPrior && truckPrior ? (driverPrior.atMs >= truckPrior.atMs ? driverPrior : truckPrior) : (driverPrior ?? truckPrior);
  if (!chosen) return empty;
  const place = stopPlace(deliveryStopOf(input.stops.get(chosen.load.id) ?? []));
  return { load: chosen.load, place, at: chosen.at, atMs: chosen.atMs, pickupAt, pickupMs };
}

export type GpsSample = {
  address: string;
  recordedAt: string;
  latitude: number | null;
  longitude: number | null;
};

type TimedPing = GpsSample & { atMs: number };

function gpsPlace(ping: GpsSample): string {
  const address = ping.address.trim();
  if (address) return address;
  if (ping.latitude == null || ping.longitude == null) return "";
  if (!Number.isFinite(ping.latitude) || !Number.isFinite(ping.longitude)) return "";
  return `${ping.latitude.toFixed(4)}, ${ping.longitude.toFixed(4)}`;
}

function pingInside(ping: TimedPing, dest: { latitude: number; longitude: number } | null): boolean {
  if (!dest || ping.latitude == null || ping.longitude == null) return false;
  if (!Number.isFinite(ping.latitude) || !Number.isFinite(ping.longitude)) return false;
  return milesBetween({ latitude: ping.latitude, longitude: ping.longitude }, dest) <= GEOFENCE_MILES;
}

function approachPing(
  pings: TimedPing[],
  pickupMs: number,
  pickupPoint: { latitude: number; longitude: number } | null,
): TimedPing | null {
  const outside = pings.filter((ping) => !pingInside(ping, pickupPoint));
  const recent = outside.filter((ping) => ping.atMs >= pickupMs - DEADHEAD_GPS_LEAD_MS);
  if (recent.length) return recent[recent.length - 1] ?? null;
  const beforeEntry = outside.filter((ping) => ping.atMs >= pickupMs - DEADHEAD_GPS_ENTRY_CAP_MS);
  return beforeEntry[beforeEntry.length - 1] ?? null;
}

/**
 * Old suggestion: a GPS ping on the assigned truck replaced the delivery when it was far away,
 * and a ping alone could be the start when no delivery was in the 7-day window.
 */
export function legacySuggestedPlace(input: {
  deliveryPlace: string;
  deliveryPoint: { latitude: number; longitude: number } | null;
  pickupMs: number | null;
  pickupPoint: { latitude: number; longitude: number } | null;
  pings: readonly GpsSample[];
}): string {
  if (input.pickupMs == null) return input.deliveryPlace;
  const pings = input.pings
    .map((ping) => {
      const atMs = gpsInstantMs(ping.recordedAt);
      return atMs == null || atMs > input.pickupMs! ? null : { ...ping, atMs };
    })
    .filter((ping): ping is TimedPing => ping != null)
    .sort((left, right) => left.atMs - right.atMs);
  const approach = approachPing(pings, input.pickupMs, input.pickupPoint);
  let from = input.deliveryPlace;
  const approachPoint = approach ? stopPoint(approach) : null;
  if (from && approach && approachPoint && input.deliveryPoint) {
    if (milesBetween(approachPoint, input.deliveryPoint) > DEADHEAD_GPS_FAR_MI) {
      const gpsFrom = gpsPlace(approach);
      if (gpsFrom) from = gpsFrom;
    }
  }
  if (!from) {
    const fallback = pings[pings.length - 1];
    if (fallback) from = gpsPlace(fallback);
  }
  return from;
}
