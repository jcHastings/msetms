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
  formatted: string;
  latitude: number | null;
  longitude: number | null;
};

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
