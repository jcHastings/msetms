import { getGoogleMapsApiKey } from "./env";
import { parseAddressComponents, type AddressComponent, type PlaceDetails, type PlaceSuggestion } from "./places-shared";

export type { PlaceDetails, PlaceSuggestion } from "./places-shared";

export function placesEnabled(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const key = getGoogleMapsApiKey();
  if (!key) return [];
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", trimmed);
  url.searchParams.set("components", "country:us");
  url.searchParams.set("key", key);
  // Do not log `url` — the query string includes the server key.
  const response = await fetch(url);
  if (!response.ok) throw new Error("Places search failed.");
  const payload = (await response.json()) as {
    status: string;
    predictions?: Array<{ place_id: string; description: string }>;
  };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error("Places search is not available.");
  }
  return (payload.predictions ?? []).slice(0, 6).map((item) => ({
    placeId: item.place_id,
    label: item.description,
  }));
}

type GoogleFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type GooglePlacePayload = {
  name?: string;
  formatted_address?: string;
  address_components?: AddressComponent[];
  geometry?: { location?: { lat: number; lng: number } };
};

export function placeDetailsFromPayload(placeId: string, result: GooglePlacePayload): PlaceDetails {
  const parsed = parseAddressComponents(result.address_components ?? []);
  const poi = (result.address_components ?? []).find((item) =>
    (item.types ?? []).some((type) => type === "point_of_interest" || type === "establishment"),
  );
  const poiName = String(poi?.long_name || poi?.longText || "").trim();
  return {
    placeId,
    name: String(result.name ?? "").trim() || poiName,
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    country: parsed.country,
    formatted: result.formatted_address ?? "",
    latitude: result.geometry?.location?.lat ?? null,
    longitude: result.geometry?.location?.lng ?? null,
  };
}

export async function getPlaceDetails(placeId: string, fetchImpl: GoogleFetch = fetch): Promise<PlaceDetails> {
  const key = getGoogleMapsApiKey();
  if (!key) throw new Error("Search is off.");
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,formatted_address,address_component,geometry");
  url.searchParams.set("key", key);
  // Do not log `url` — the query string includes the server key.
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error("Place details failed.");
  const payload = (await response.json()) as { status: string; result?: GooglePlacePayload };
  if (payload.status !== "OK" || !payload.result) throw new Error("That place could not be loaded.");
  return placeDetailsFromPayload(placeId, payload.result);
}

/**
 * Best Google match for an existing location. Find Place, then Place Details.
 * Geocoding is the fallback. Returns null when the key is missing or nothing matches.
 */
export async function findBestPlace(query: string, fetchImpl: GoogleFetch = fetch): Promise<PlaceDetails | null> {
  const key = getGoogleMapsApiKey();
  const trimmed = query.trim();
  if (!key || trimmed.length < 3) return null;
  try {
    const placeId = await findPlaceId(trimmed, key, fetchImpl);
    if (placeId) return await getPlaceDetails(placeId, fetchImpl);
    return await geocodePlace(trimmed, key, fetchImpl);
  } catch {
    return null;
  }
}

async function findPlaceId(query: string, key: string, fetchImpl: GoogleFetch): Promise<string | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id");
  url.searchParams.set("key", key);
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status: string;
    candidates?: Array<{ place_id?: string }>;
  };
  if (payload.status !== "OK") return null;
  const placeId = String(payload.candidates?.[0]?.place_id ?? "").trim();
  return placeId || null;
}

async function geocodePlace(query: string, key: string, fetchImpl: GoogleFetch): Promise<PlaceDetails | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status: string;
    results?: Array<GooglePlacePayload & { place_id?: string }>;
  };
  const result = payload.results?.[0];
  if (payload.status !== "OK" || !result) return null;
  const placeId = String(result.place_id ?? "").trim();
  if (!placeId) return null;
  return placeDetailsFromPayload(placeId, result);
}

/** Fail-soft geocode. Never invents a point when Google has no result. */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const key = getGoogleMapsApiKey();
  const trimmed = address.trim();
  if (!key || trimmed.length < 5) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", key);
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status: string;
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
  };
  const loc = payload.results?.[0]?.geometry?.location;
  if (payload.status !== "OK" || loc == null || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return null;
  }
  return { latitude: loc.lat, longitude: loc.lng };
}
