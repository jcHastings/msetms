import { findExactCityCenter, normalizeCityKey, US_CITY_CENTERS } from "./city-coords-shared";
import { getDb } from "./db";
import { formatDate } from "./format";
import { geocodeAddress } from "./places";
import { getLoad, listLocations } from "./queries";
import { showsSampleData } from "./settings";
import { listStops, listStopsForLoads } from "./stops";
import type { LoadStop } from "./stops-shared";
import type { Location, LoadView } from "./types";
import {
  BACKHAUL_GEOCODE_TIMEOUT_MS,
  BACKHAUL_LOOKBACK_MONTHS,
  BACKHAUL_MISSING_TITLE,
  BACKHAUL_RADIUS_MI,
  BACKHAUL_SEARCH_FAILED,
  BACKHAUL_SERVER_BUDGET_MS,
  BACKHAUL_TIMEOUT_MESSAGE,
  capBackhaulLoads,
  formatCityState,
  isBlankPlacePart,
  isHouseCustomerName,
  isWithinBackhaulRadius,
  pickupMiles,
  rollupBackhaulCustomers,
  sortBackhaulLoads,
  splitCityState,
  type BackhaulLoadRow,
  type BackhaulPlace,
  type BackhaulResponse,
} from "./backhaul-shared";

export {
  BACKHAUL_LOAD_CAP,
  BACKHAUL_RADIUS_MI,
  isHouseCustomerName,
  normalizeHouseCustomerKey,
} from "./backhaul-shared";
export type { BackhaulResponse, BackhaulResult } from "./backhaul-shared";

function locationCoords(locations: Location[]): Array<{
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
}> {
  return locations.map((location) => ({
    name: location.name,
    city: location.city,
    state: location.state,
    lat: location.latitude,
    lng: location.longitude,
  }));
}

function lastDeliveryStop(stops: LoadStop[]): LoadStop | null {
  return [...stops].reverse().find((stop) => stop.kind === "delivery") ?? null;
}

function firstPickupStop(stops: LoadStop[]): LoadStop | null {
  return stops.find((stop) => stop.kind === "pickup") ?? null;
}

function placeFromStopOrLane(
  stop: LoadStop | null,
  lane: string,
): { city: string; state: string; label: string; locationId: number | null } {
  const city = isBlankPlacePart(stop?.city ?? "") ? "" : (stop?.city.trim() ?? "");
  const state = isBlankPlacePart(stop?.state ?? "") ? "" : (stop?.state.trim() ?? "");
  if (city || state) {
    return {
      city,
      state,
      label: formatCityState(city, state) || lane.trim(),
      locationId: stop?.location_id ?? null,
    };
  }
  const split = splitCityState(lane);
  return {
    city: split.city,
    state: split.state,
    label: formatCityState(split.city, split.state) || lane.trim(),
    locationId: stop?.location_id ?? null,
  };
}

function locationPlaceAgrees(
  location: Pick<Location, "city" | "state">,
  place: { city: string; state: string },
): boolean {
  const locCity = normalizeCityKey(location.city);
  const locState = normalizeCityKey(location.state);
  const placeCity = normalizeCityKey(place.city);
  const placeState = normalizeCityKey(place.state);
  if (placeCity && locCity && locCity !== placeCity) return false;
  if (placeState && locState && locState !== placeState) return false;
  if (placeCity && !locCity) return false;
  return true;
}

function coordsFromKnown(
  place: { city: string; state: string; locationId: number | null },
  locations: Location[],
): { lat: number; lng: number } | null {
  // City-table / exact city+state first. Never use a linked warehouse in another
  // city (Buffalo stop → Bronx dock coords) and never substring-match Brooklyn Park → Brooklyn.
  const known = findExactCityCenter(place.city, place.state, locationCoords(locations));
  if (known) return { lat: known.lat, lng: known.lng };
  const linked = place.locationId ? locations.find((location) => location.id === place.locationId) : null;
  if (
    linked?.latitude != null &&
    linked.longitude != null &&
    locationPlaceAgrees(linked, place)
  ) {
    return { lat: linked.latitude, lng: linked.longitude };
  }
  return null;
}

async function resolvePlace(
  stop: LoadStop | null,
  lane: string,
  locations: Location[],
  allowGeocode: boolean,
): Promise<BackhaulPlace | null> {
  const place = placeFromStopOrLane(stop, lane);
  if (!place.city && !place.state) return null;
  const known = coordsFromKnown(place, locations);
  if (known) {
    return { city: place.city, state: place.state, label: place.label || formatCityState(place.city, place.state), ...known };
  }
  if (!allowGeocode) return null;
  const address = [stop?.street, place.city, place.state, stop?.zip].filter(Boolean).join(", ");
  const geo = await geocodeAddress(address || place.label, { timeoutMs: BACKHAUL_GEOCODE_TIMEOUT_MS });
  if (!geo) return null;
  return {
    city: place.city,
    state: place.state,
    label: place.label || formatCityState(place.city, place.state),
    lat: geo.latitude,
    lng: geo.longitude,
  };
}

function loadDateIso(stop: LoadStop | null, fallback: string): string {
  const fromStop = stop?.window_start || stop?.window_end || "";
  return fromStop || fallback || "";
}

function toLoadRow(
  load: LoadView,
  pickupLabel: string,
  deliveryLabel: string,
  miles: number,
  dateIso: string,
): BackhaulLoadRow {
  return {
    id: load.id,
    loadNumber: load.load_number,
    customer: load.customer_name,
    pickup: pickupLabel,
    delivery: deliveryLabel,
    miles: Math.round(miles),
    date: dateIso ? formatDate(dateIso) : "—",
    dateSort: dateIso,
  };
}

type HistoryLoad = {
  id: number;
  load_number: string;
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
};

function lookbackCutoff(now: Date): string {
  const cut = new Date(now.getTime());
  cut.setMonth(cut.getMonth() - BACKHAUL_LOOKBACK_MONTHS);
  return cut.toISOString();
}

function searchBox(lat: number, lng: number, radiusMi: number): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const latDelta = radiusMi / 69;
  const cos = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusMi / (69 * Math.max(0.2, Math.abs(cos)));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

function timeoutResult(source?: { id: number; loadNumber: string }): BackhaulResponse {
  return {
    ok: false,
    reason: "timeout",
    error: BACKHAUL_TIMEOUT_MESSAGE,
    detail: BACKHAUL_TIMEOUT_MESSAGE,
    source,
  };
}

/**
 * Non-cancelled loads from the last 18 months whose pickup coordinates sit in
 * the bounding box. Exact miles are applied after this prefilter.
 */
function prefilteredHistoryIds(sourceId: number, center: { lat: number; lng: number }, cutoff: string): number[] {
  const box = searchBox(center.lat, center.lng, BACKHAUL_RADIUS_MI);
  const cities = US_CITY_CENTERS.filter(
    (row) => row.lat >= box.minLat && row.lat <= box.maxLat && row.lng >= box.minLng && row.lng <= box.maxLng,
  );
  const citySql = cities.map(() => "(LOWER(TRIM(s.city)) = ? AND UPPER(TRIM(s.state)) = ?)").join(" OR ");
  const originSql = cities.map(() => "LOWER(TRIM(loads.origin)) = ?").join(" OR ");
  const sampleSql = showsSampleData() ? "" : " AND loads.is_sample = 0";
  const params: Array<string | number> = [
    sourceId,
    cutoff,
    box.minLat,
    box.maxLat,
    box.minLng,
    box.maxLng,
  ];
  for (const city of cities) params.push(city.city.toLowerCase(), city.state.toUpperCase());
  for (const city of cities) params.push(`${city.city}, ${city.state}`.toLowerCase());
  const rows = getDb()
    .prepare(
      `SELECT loads.id
       FROM loads
       WHERE loads.status != 'cancelled'
         AND loads.id != ?
         AND COALESCE(NULLIF(loads.pickup_start, ''), NULLIF(loads.delivery_start, ''), loads.created_at) >= ?
         ${sampleSql}
         AND (
           EXISTS (
             SELECT 1 FROM load_stops s
             LEFT JOIN locations loc ON loc.id = s.location_id
             WHERE s.load_id = loads.id
               AND s.kind = 'pickup'
               AND (
                 (loc.latitude BETWEEN ? AND ? AND loc.longitude BETWEEN ? AND ?)
                 ${citySql ? `OR ${citySql}` : ""}
               )
           )
           ${originSql ? `OR ${originSql}` : ""}
         )`,
    )
    .all(...params) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

function historyLoads(ids: number[]): HistoryLoad[] {
  if (ids.length === 0) return [];
  const rows: HistoryLoad[] = [];
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    rows.push(
      ...(getDb()
        .prepare(
          `SELECT loads.id, loads.load_number, customers.name AS customer_name, loads.origin, loads.destination, loads.pickup_start
           FROM loads
           JOIN customers ON customers.id = loads.customer_id
           WHERE loads.id IN (${chunk.map(() => "?").join(", ")})`,
        )
        .all(...chunk) as HistoryLoad[]),
    );
  }
  return rows;
}

export async function findBackhaulForLoad(
  loadId: number,
  options?: { now?: Date; budgetMs?: number },
): Promise<BackhaulResponse> {
  const started = Date.now();
  const budget = options?.budgetMs ?? BACKHAUL_SERVER_BUDGET_MS;
  const now = options?.now ?? new Date();
  const timedOut = () => Date.now() - started >= budget;
  const source = getLoad(loadId);
  if (!source) {
    return { ok: false, reason: "not_found", error: "Load not found." };
  }
  const sourceRef = { id: source.id, loadNumber: source.load_number };
  if (timedOut()) return timeoutResult(sourceRef);

  const locations = listLocations();
  const sourceStops = listStops(source.id, { geofence: false });
  const deliveryStop = lastDeliveryStop(sourceStops);
  const deliveryPlace = placeFromStopOrLane(deliveryStop, source.destination);
  if (!deliveryPlace.city && !deliveryPlace.state) {
    return {
      ok: false,
      reason: "missing_delivery",
      error: BACKHAUL_MISSING_TITLE,
      detail: "Set a delivery city and state on this load, then search again.",
      source: sourceRef,
    };
  }

  const center = await resolvePlace(deliveryStop, source.destination, locations, true);
  if (timedOut()) return timeoutResult(sourceRef);
  if (!center) {
    return {
      ok: false,
      reason: "geocode_failed",
      error: BACKHAUL_SEARCH_FAILED,
      detail: `Could not place ${deliveryPlace.label || "the delivery city"} on the map.`,
      source: sourceRef,
    };
  }

  const ids = prefilteredHistoryIds(source.id, center, lookbackCutoff(now));
  const stopsByLoad = listStopsForLoads(ids, locations);
  const candidates: BackhaulLoadRow[] = [];
  for (const load of historyLoads(ids)) {
    if (timedOut()) return timeoutResult(sourceRef);
    if (isHouseCustomerName(load.customer_name)) continue;
    const stops = stopsByLoad.get(load.id) ?? [];
    const pickupStop = firstPickupStop(stops);
    const dropStop = lastDeliveryStop(stops);
    const pickup = await resolvePlace(pickupStop, load.origin, locations, false);
    const miles = pickupMiles(center, pickup);
    if (!isWithinBackhaulRadius(miles)) continue;
    const dateIso = loadDateIso(pickupStop, load.pickup_start);
    candidates.push(
      toLoadRow(
        {
          id: load.id,
          load_number: load.load_number,
          customer_name: load.customer_name,
          origin: load.origin,
          destination: load.destination,
        } as LoadView,
        pickup?.label || placeFromStopOrLane(pickupStop, load.origin).label || load.origin,
        placeFromStopOrLane(dropStop, load.destination).label || load.destination,
        miles as number,
        dateIso,
      ),
    );
  }

  const sorted = sortBackhaulLoads(candidates);
  const loads = capBackhaulLoads(sorted);
  return {
    ok: true,
    center: {
      city: center.city,
      state: center.state,
      label: center.label,
      lat: center.lat,
      lng: center.lng,
    },
    radiusMi: BACKHAUL_RADIUS_MI,
    source: { id: source.id, loadNumber: source.load_number },
    loads,
    customers: rollupBackhaulCustomers(sorted),
    total: sorted.length,
  };
}
