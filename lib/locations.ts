import type { Location, LocationRole, SchedulingType } from "./types";
import { labelForSchedulingType } from "./types";

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;

export type LocationInput = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  notes: string;
  role: LocationRole;
  scheduling_type: SchedulingType;
  hours: string;
  scheduling_notes: string;
  call_before?: number;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string;
};

export function normalizeLocationPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function locationPlaceKey(
  name: string,
  street: string,
  city: string,
  state: string,
): string {
  return [name, street, city, state].map(normalizeLocationPart).join("|");
}

export function formatLocationCityState(location: Pick<Location, "city" | "state" | "name">): string {
  const cityState = [location.city.trim(), location.state.trim()].filter(Boolean).join(", ");
  return cityState || location.name;
}

export function formatLocationAddress(location: Pick<Location, "street" | "city" | "state" | "zip">): string {
  const line2 = [location.city.trim(), location.state.trim()].filter(Boolean).join(", ");
  const cityZip = [line2, location.zip.trim()].filter(Boolean).join(" ");
  return [location.street.trim(), cityZip].filter(Boolean).join(", ");
}

export function formatStopCityState(
  stop: { city?: string | null; state?: string | null; name?: string | null },
  location?: { city?: string | null; state?: string | null; name?: string | null } | null,
): string {
  const city = String(stop.city || location?.city || "").trim();
  const state = String(stop.state || location?.state || "").trim();
  const cityState = [city, state].filter(Boolean).join(", ");
  return cityState || String(stop.name || location?.name || "").trim();
}

export function formatLoadLaneFromStops(
  stops: Array<{
    kind: string;
    city?: string | null;
    state?: string | null;
    name?: string | null;
    location_id?: number | null;
  }>,
  locations: Array<{ id: number; city: string; state: string; name: string }> = [],
): string {
  if (!stops.length) return "";
  const pickup = stops.find((item) => item.kind === "pickup") ?? stops[0];
  const delivery = [...stops].reverse().find((item) => item.kind === "delivery") ?? stops[stops.length - 1];
  const locFor = (id?: number | null) => (id != null ? locations.find((row) => row.id === id) ?? null : null);
  const origin = formatStopCityState(pickup, locFor(pickup.location_id));
  const destination = formatStopCityState(delivery, locFor(delivery.location_id));
  if (origin && destination) return `${origin} → ${destination}`;
  return origin || destination;
}

/** Street from the linked location when the stop row left it blank. Does not invent a city. */
export function formatStopRowAddress(
  stop: Pick<Location, "street" | "city" | "state" | "zip">,
  location?: Pick<Location, "street" | "city" | "state" | "zip"> | null,
): string {
  return formatLocationAddress({
    street: stop.street.trim() || location?.street || "",
    city: stop.city.trim() || location?.city || "",
    state: stop.state.trim() || location?.state || "",
    zip: stop.zip.trim() || location?.zip || "",
  });
}

export type LocationPickerRow = Pick<Location, "id" | "name" | "street" | "city" | "state" | "zip">;

export function locationSearchHaystack(location: LocationPickerRow): string {
  return [location.name, location.street, location.city, location.state, location.zip]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function locationQueryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function locationMatchesQuery(location: LocationPickerRow, query: string): boolean {
  const tokens = locationQueryTokens(query);
  if (!tokens.length) return false;
  const haystack = locationSearchHaystack(location);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Typeahead over the whole Locations book. Any name or address fragment matches
 * (no customer or facility is special-cased). Empty query returns nothing so
 * thousands of rows are never dumped into the menu.
 */
export function filterLocationsForPicker<T extends LocationPickerRow>(
  locations: T[],
  query: string,
  limit = 50,
): T[] {
  if (!locationQueryTokens(query).length) return [];
  const matched: T[] = [];
  for (const location of locations) {
    if (!locationMatchesQuery(location, query)) continue;
    matched.push(location);
    if (matched.length >= limit) break;
  }
  return matched;
}

export function formatLocationLabel(location: Location): string {
  const place = formatLocationCityState(location);
  return place && place !== location.name ? `${location.name} — ${place}` : location.name;
}

export function formatSchedulingSummary(location: Location): string {
  const parts = [labelForSchedulingType(location.scheduling_type)];
  if (location.call_before) parts.push("Call before pickup/delivery");
  if (location.hours.trim()) parts.push(`Hours: ${location.hours.trim()}`);
  if (location.scheduling_notes.trim()) parts.push(location.scheduling_notes.trim());
  return parts.join(" · ");
}

export function locationMatchesRole(location: Location, role: "shipper" | "receiver"): boolean {
  return location.role === "both" || location.role === role;
}

export type StopLocationMatch = {
  name: string;
  street?: string;
  city?: string;
  state?: string;
};

export function normalizeLocationName(value: string): string {
  return value.trim().toLowerCase().replace(/[.,#']/g, "").replace(/\s+/g, " ");
}

function cityStateAgrees(
  location: Pick<Location, "city" | "state">,
  stop: StopLocationMatch,
): boolean {
  const stopCityRaw = normalizeLocationName(stop.city ?? "");
  const stopCity = stopCityRaw.replace(/\s+[a-z]{2}$/, "").trim();
  const locCity = normalizeLocationName(location.city);
  const state = (stop.state ?? "").trim().toUpperCase() || extractStateCode(stop.city ?? "");
  if (stopCity && locCity && locCity !== stopCity && locCity !== stopCityRaw) {
    return false;
  }
  if (state.length === 2 && location.state.trim() && location.state.trim().toUpperCase() !== state) {
    return false;
  }
  return true;
}

function pickUniqueLocation<T extends Pick<Location, "id" | "name" | "city" | "state">>(
  hits: T[],
  stop: StopLocationMatch,
): T | null {
  if (hits.length === 1) return cityStateAgrees(hits[0], stop) ? hits[0] : null;
  if (hits.length > 1) {
    const narrowed = hits.filter((location) => cityStateAgrees(location, stop));
    return narrowed.length === 1 ? narrowed[0] : null;
  }
  return null;
}

/** Exact name, or one unique contains-match when city/state agree. Never invent a row. */
export function matchLocationForStop<T extends Pick<Location, "id" | "name" | "street" | "city" | "state" | "zip" | "phone">>(
  locations: T[],
  stop: StopLocationMatch,
): T | null {
  const needle = normalizeLocationName(stop.name);
  if (!needle || needle.length < 3) return null;
  const city = normalizeLocationName(stop.city ?? "");
  if (city && needle === city) return null;

  const exact = pickUniqueLocation(
    locations.filter((location) => normalizeLocationName(location.name) === needle),
    stop,
  );
  if (exact) return exact;

  return pickUniqueLocation(
    locations.filter((location) => {
      const name = normalizeLocationName(location.name);
      if (name.length < 3) return false;
      return name.includes(needle) || needle.includes(name);
    }),
    stop,
  );
}

export function isPlaceholderStopName(name: string, city = ""): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^(pickup|delivery)$/i.test(trimmed)) return true;
  return Boolean(city.trim() && normalizeLocationName(trimmed) === normalizeLocationName(city));
}

export function fillBlank(existing: string, incoming: string): string {
  return existing.trim() ? existing : incoming.trim();
}

export function applyLocationToStop<T extends {
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  location_id?: number | null;
}>(stop: T, location: Pick<Location, "id" | "name" | "street" | "city" | "state" | "zip" | "phone">): T {
  return {
    ...stop,
    location_id: stop.location_id ?? location.id,
    name: isPlaceholderStopName(stop.name, stop.city ?? "") ? location.name : fillBlank(stop.name, location.name),
    street: fillBlank(stop.street ?? "", location.street),
    city: fillBlank(stop.city ?? "", location.city),
    state: fillBlank(stop.state ?? "", location.state),
    zip: fillBlank(stop.zip ?? "", location.zip),
    phone: fillBlank(stop.phone ?? "", location.phone),
  };
}

export function formatStopPartyAddress(parts: { street?: string; city?: string; state?: string; zip?: string }): string {
  const cityState = [parts.city?.trim(), parts.state?.trim()].filter(Boolean).join(", ");
  const cityZip = [cityState, parts.zip?.trim()].filter(Boolean).join(" ");
  const street = parts.street?.trim() ?? "";
  return [street, cityZip].filter(Boolean).join("\n");
}

export function extractStateCode(place: string): string {
  const trimmed = String(place ?? "").trim();
  const zip = trimmed.match(/,\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (zip) return zip[1].toUpperCase();
  const tail = trimmed.match(/\b([A-Za-z]{2})$/);
  return tail ? tail[1].toUpperCase() : "";
}
