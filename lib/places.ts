import { getGoogleMapsApiKey } from "./env";
import type { PlaceDetails, PlaceSuggestion } from "./places-shared";

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
  url.searchParams.set("key", key);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Places search failed.");
  const payload = (await response.json()) as {
    status: string;
    predictions?: Array<{ place_id: string; description: string }>;
    error_message?: string;
  };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error("Places search is not available.");
  }
  return (payload.predictions ?? []).slice(0, 6).map((item) => ({
    placeId: item.place_id,
    label: item.description,
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const key = getGoogleMapsApiKey();
  if (!key) throw new Error("Add GOOGLE_MAPS_API_KEY to enable search.");
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,formatted_address,address_component,geometry");
  url.searchParams.set("key", key);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Place details failed.");
  const payload = (await response.json()) as {
    status: string;
    result?: {
      name?: string;
      formatted_address?: string;
      address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      geometry?: { location?: { lat: number; lng: number } };
    };
  };
  if (payload.status !== "OK" || !payload.result) throw new Error("That place could not be loaded.");
  const components = payload.result.address_components ?? [];
  const pick = (...types: string[]) =>
    components.find((item) => types.every((type) => item.types.includes(type)))?.short_name ??
    components.find((item) => types.some((type) => item.types.includes(type)))?.long_name ??
    "";
  const streetNumber = pick("street_number");
  const route = components.find((item) => item.types.includes("route"))?.long_name ?? "";
  return {
    name: payload.result.name ?? "",
    street: [streetNumber, route].filter(Boolean).join(" "),
    city: pick("locality") || pick("sublocality") || pick("administrative_area_level_3"),
    state: pick("administrative_area_level_1"),
    zip: pick("postal_code"),
    formatted: payload.result.formatted_address ?? "",
    latitude: payload.result.geometry?.location?.lat ?? null,
    longitude: payload.result.geometry?.location?.lng ?? null,
  };
}
