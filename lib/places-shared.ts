export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

const NY_BOROUGH_CITIES = new Set([
  "bronx",
  "the bronx",
  "brooklyn",
  "manhattan",
  "queens",
  "staten island",
]);

function normalizeCityName(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isNyBoroughCity(city: string): boolean {
  return NY_BOROUGH_CITIES.has(normalizeCityName(city));
}

/** Bronx / Brooklyn / Manhattan / Queens / Staten Island are NY. Do not invent a city. */
export function nyBoroughStateError(city: string, state: string): string | null {
  if (!isNyBoroughCity(city)) return null;
  const region = state.trim().toUpperCase();
  if (!region || region === "NY") return null;
  return `${city.trim()} is in New York. Use NY, not ${region}.`;
}

export function applyNyBoroughState(city: string, state: string): string {
  return isNyBoroughCity(city) ? "NY" : state;
}

export function assertNyBoroughState(city: string, state: string): void {
  const error = nyBoroughStateError(city, state);
  if (error) throw new Error(error);
}

export type PlaceDetails = {
  placeId: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** ISO country or short name from Google. Empty when the result has none. */
  country: string;
  formatted: string;
  latitude: number | null;
  longitude: number | null;
};

export type AddressComponent = {
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
  types?: string[];
};

function componentName(component: AddressComponent, kind: "long" | "short"): string {
  if (kind === "short") {
    return String(component.short_name || component.shortText || component.long_name || component.longText || "").trim();
  }
  return String(component.long_name || component.longText || component.short_name || component.shortText || "").trim();
}

function componentTypes(component: AddressComponent): string[] {
  return Array.isArray(component.types) ? component.types : [];
}

/** Street, city, state, ZIP, and country from a Google `address_components` list. */
export function parseAddressComponents(components: AddressComponent[]): {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
} {
  const list = Array.isArray(components) ? components : [];
  const find = (...types: string[]) =>
    list.find((item) => {
      const itemTypes = componentTypes(item);
      return types.every((type) => itemTypes.includes(type));
    }) ??
    list.find((item) => {
      const itemTypes = componentTypes(item);
      return types.some((type) => itemTypes.includes(type));
    });
  const short = (...types: string[]) => {
    const hit = find(...types);
    return hit ? componentName(hit, "short") : "";
  };
  const long = (...types: string[]) => {
    const hit = find(...types);
    return hit ? componentName(hit, "long") : "";
  };
  const streetNumber = short("street_number");
  const route = long("route");
  const city = long("locality") || long("postal_town") || long("sublocality") || long("administrative_area_level_3");
  const rawState = short("administrative_area_level_1");
  return {
    street: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state: applyNyBoroughState(city, rawState),
    zip: short("postal_code"),
    country: short("country") || long("country"),
  };
}

/** Readable relay point, e.g. "Pilot Travel Center, Oklahoma City, OK". */
export function relayPointLabel(place: { name?: string | null; city?: string | null; state?: string | null }): string {
  const name = String(place.name ?? "").trim();
  const cityState = [String(place.city ?? "").trim(), String(place.state ?? "").trim()].filter(Boolean).join(", ");
  if (name && cityState) {
    if (name.toLowerCase().endsWith(cityState.toLowerCase())) return name;
    return `${name}, ${cityState}`;
  }
  return name || cityState;
}

export function parseCoordPair(
  latRaw: unknown,
  lngRaw: unknown,
): { lat: number | null; lng: number | null } {
  const latEmpty = latRaw == null || String(latRaw).trim() === "";
  const lngEmpty = lngRaw == null || String(lngRaw).trim() === "";
  if (latEmpty && lngEmpty) return { lat: null, lng: null };
  const lat = typeof latRaw === "number" ? latRaw : Number(String(latRaw).trim());
  const lng = typeof lngRaw === "number" ? lngRaw : Number(String(lngRaw).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Latitude and longitude must both be numbers.");
  }
  if (lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (lng < -180 || lng > 180) throw new Error("Longitude must be between -180 and 180.");
  return { lat, lng };
}

export function locationIsVerified(row: { verified_at?: string | null }): boolean {
  return Boolean(String(row.verified_at ?? "").trim());
}

const EARTH_MILES = 3958.7613;

/** Great-circle distance in miles. Null when either pin is missing. */
export function haversineMiles(
  from: { lat: number | null; lng: number | null },
  to: { lat: number | null; lng: number | null },
): number | null {
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  if (![from.lat, from.lng, to.lat, to.lng].every((value) => Number.isFinite(value))) return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceMiles(miles: number | null): string {
  if (miles == null || !Number.isFinite(miles)) return "No saved pin to measure";
  if (miles < 0.1) return "Under 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

export function matchLocationForPlace(
  locations: Array<{ id: number; name: string; street: string; city: string; state: string; zip: string }>,
  place: PlaceDetails,
): number | null {
  const city = place.city.trim().toLowerCase();
  const state = place.state.trim().toLowerCase();
  const street = place.street.trim().toLowerCase();
  const zip = place.zip.trim();
  const formatted = place.formatted.trim().toLowerCase();
  const name = place.name.trim().toLowerCase();
  if (!city && !street && !formatted) return null;

  const scored = locations
    .map((location) => {
      let score = 0;
      if (city && location.city.trim().toLowerCase() === city) score += 2;
      if (state && location.state.trim().toLowerCase() === state) score += 1;
      if (zip && location.zip.trim() && location.zip.trim() === zip) score += 2;
      if (street && location.street.trim().toLowerCase() === street) score += 3;
      const savedStreet = location.street.trim().toLowerCase();
      if (formatted && savedStreet.length > 4 && formatted.includes(savedStreet)) score += 2;
      if (name && location.name.trim().toLowerCase() === name) score += 2;
      return { id: location.id, score };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}
