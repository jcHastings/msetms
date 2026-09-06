import { findExactCityCenter } from "./city-coords-shared";
import { formatDate } from "./format";
import { geocodeAddress } from "./places";
import { getLoad, listLoads, listLocations } from "./queries";
import { listStops } from "./stops";
import type { LoadStop } from "./stops-shared";
import type { Location, LoadView } from "./types";
import {
  BACKHAUL_RADIUS_MI,
  capBackhaulLoads,
  formatCityState,
  isHouseCustomerName,
  isWithinBackhaulRadius,
  nearerMiles,
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
  const city = stop?.city.trim() ?? "";
  const state = stop?.state.trim() ?? "";
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

function coordsFromKnown(
  place: { city: string; state: string; locationId: number | null },
  locations: Location[],
): { lat: number; lng: number } | null {
  const linked = place.locationId ? locations.find((location) => location.id === place.locationId) : null;
  if (linked?.latitude != null && linked.longitude != null) {
    return { lat: linked.latitude, lng: linked.longitude };
  }
  const known = findExactCityCenter(place.city, place.state, locationCoords(locations));
  if (!known) return null;
  return { lat: known.lat, lng: known.lng };
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
  const geo = await geocodeAddress(address || place.label);
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

export async function findBackhaulForLoad(loadId: number): Promise<BackhaulResponse> {
  const source = getLoad(loadId);
  if (!source) {
    return { ok: false, reason: "not_found", error: "Load not found." };
  }

  const locations = listLocations();
  const sourceStops = listStops(source.id);
  const deliveryStop = lastDeliveryStop(sourceStops);
  const deliveryPlace = placeFromStopOrLane(deliveryStop, source.destination);
  if (!deliveryPlace.city && !deliveryPlace.state) {
    return {
      ok: false,
      reason: "missing_delivery",
      error: "This load has no delivery city. Add a delivery stop to search for backhaul.",
      source: { id: source.id, loadNumber: source.load_number },
    };
  }

  const center = await resolvePlace(deliveryStop, source.destination, locations, true);
  if (!center) {
    return {
      ok: false,
      reason: "geocode_failed",
      error: `Could not place ${deliveryPlace.label || "the delivery city"} on the map. Check the city and state.`,
      source: { id: source.id, loadNumber: source.load_number },
    };
  }

  const candidates: BackhaulLoadRow[] = [];
  for (const load of listLoads({ status: "all" })) {
    if (load.id === source.id) continue;
    if (isHouseCustomerName(load.customer_name)) continue;
    const stops = listStops(load.id);
    const pickupStop = firstPickupStop(stops);
    const dropStop = lastDeliveryStop(stops);
    const pickup = await resolvePlace(pickupStop, load.origin, locations, false);
    const drop = await resolvePlace(dropStop, load.destination, locations, false);
    const miles = nearerMiles(center, pickup, drop);
    if (!isWithinBackhaulRadius(miles)) continue;
    const nearerIsPickup =
      pickup && (drop == null || haversineCompare(center, pickup, drop) <= 0);
    const dateIso = loadDateIso(
      nearerIsPickup ? pickupStop : dropStop,
      nearerIsPickup ? load.pickup_start : load.delivery_start || load.pickup_start,
    );
    candidates.push(
      toLoadRow(
        load,
        pickup?.label || placeFromStopOrLane(pickupStop, load.origin).label || load.origin,
        drop?.label || placeFromStopOrLane(dropStop, load.destination).label || load.destination,
        miles as number,
        dateIso,
      ),
    );
  }

  const loads = capBackhaulLoads(sortBackhaulLoads(candidates));
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
    customers: rollupBackhaulCustomers(loads),
  };
}

function haversineCompare(
  center: { lat: number; lng: number },
  pickup: { lat: number; lng: number },
  delivery: { lat: number; lng: number },
): number {
  const pu = nearerMiles(center, pickup, null) ?? Number.POSITIVE_INFINITY;
  const del = nearerMiles(center, null, delivery) ?? Number.POSITIVE_INFINITY;
  return pu - del;
}
