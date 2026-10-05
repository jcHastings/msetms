import { findCityCenter } from "./city-coords-shared";
import { LOAD_MAP_MARKER_COLOR, type LoadMapPoint } from "./load-map-shared";

/** A saved place that already has coordinates. Not a new geocode. */
export type RelayCoordSource = {
  name?: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
};

export type RelayHandoff = {
  id: number;
  sequence: number;
  pickup: string;
  delivery: string;
  relay_lat?: number | null;
  relay_lng?: number | null;
};

/** A pin saved from Places. Out-of-range values are ignored so the text fallback can run. */
export function storedRelayCoord(relay: {
  relay_lat?: number | null;
  relay_lng?: number | null;
}): { lat: number; lng: number } | null {
  const lat = relay.relay_lat;
  const lng = relay.relay_lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export type RelayGeocode = (address: string) => Promise<{ latitude: number; longitude: number } | null>;

/** The relay pin is the handoff city stored on `delivery` (the Relay point field). */
export function relayHandoffPlace(relay: { pickup?: string | null; delivery?: string | null }): string {
  return String(relay.delivery ?? "").trim() || String(relay.pickup ?? "").trim();
}

export function relayMarkerText(index: number): string {
  const n = index > 0 ? index : 1;
  return `R${n}`;
}

/** Accessible pin name, e.g. "Relay 1 — Chicago, IL". */
export function relayAccessibleLabel(index: number, place: string): string {
  const n = index > 0 ? index : 1;
  const where = place.trim();
  return where ? `Relay ${n} — ${where}` : `Relay ${n}`;
}

export function resolveRelayCoordinate(
  place: string,
  locations: RelayCoordSource[] = [],
): { lat: number; lng: number } | null {
  const asked = place.trim();
  if (!asked) return null;
  const hit = findCityCenter(asked, locations);
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return null;
  return { lat: hit.lat, lng: hit.lng };
}

export async function resolveRelayLatLng(
  place: string,
  locations: RelayCoordSource[] = [],
  geocode?: RelayGeocode,
): Promise<{ lat: number; lng: number } | null> {
  const local = resolveRelayCoordinate(place, locations);
  if (local) return local;
  const asked = place.trim();
  if (!asked || !geocode) return null;
  try {
    const hit = await geocode(asked);
    if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
    return { lat: hit.latitude, lng: hit.longitude };
  } catch {
    return null;
  }
}

export async function buildRelayMapPoints(
  relays: RelayHandoff[],
  locations: RelayCoordSource[] = [],
  geocode?: RelayGeocode,
): Promise<LoadMapPoint[]> {
  const points: LoadMapPoint[] = [];
  for (let index = 0; index < relays.length; index += 1) {
    const relay = relays[index];
    if (!relay) continue;
    const sequence = index + 1;
    const place = relayHandoffPlace(relay);
    const coord = storedRelayCoord(relay) ?? (await resolveRelayLatLng(place, locations, geocode));
    if (!coord) continue;
    points.push({
      id: `relay-${relay.id}`,
      kind: "relay",
      label: relayAccessibleLabel(sequence, place),
      markerText: relayMarkerText(sequence),
      lat: coord.lat,
      lng: coord.lng,
      pinColor: LOAD_MAP_MARKER_COLOR.relay,
      pinShape: "diamond",
    });
  }
  return points;
}
