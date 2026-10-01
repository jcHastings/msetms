import { getDb } from "./db";
import { VERIFY_BATCH_LIMIT, locationVerifyQuery } from "./location-verify";
import { findBestPlace } from "./places";
import { parseCoordPair, type PlaceDetails } from "./places-shared";
import { getLocation, listLocations, updateLocation } from "./queries";
import type { Location } from "./types";

type CacheRow = {
  location_id: number;
  query_key: string;
  payload_json: string;
  looked_up_at: string;
};

export type CachedPlaceLookup = {
  query: string;
  place: PlaceDetails | null;
  lookedUpAt: string;
};

function unverified(location: Location): boolean {
  return !String(location.verified_at ?? "").trim();
}

export function listUnverifiedLocations(): Location[] {
  return listLocations().filter(unverified);
}

export function readVerifyCache(locationId: number, query: string): CachedPlaceLookup | null {
  const row = getDb()
    .prepare(
      `SELECT location_id, query_key, payload_json, looked_up_at
       FROM location_verify_cache WHERE location_id = ? AND query_key = ?`,
    )
    .get(locationId, query) as CacheRow | undefined;
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json) as { place?: PlaceDetails | null };
    return {
      query: row.query_key,
      place: payload.place ?? null,
      lookedUpAt: row.looked_up_at,
    };
  } catch {
    return null;
  }
}

function writeVerifyCache(locationId: number, query: string, place: PlaceDetails | null): CachedPlaceLookup {
  const lookedUpAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO location_verify_cache (location_id, query_key, payload_json, looked_up_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(location_id, query_key) DO UPDATE SET payload_json = excluded.payload_json, looked_up_at = excluded.looked_up_at`,
    )
    .run(locationId, query, JSON.stringify({ place }), lookedUpAt);
  return { query, place, lookedUpAt };
}

export async function lookupLocationPlace(
  locationId: number,
  options?: { force?: boolean; fetchImpl?: typeof fetch },
): Promise<CachedPlaceLookup> {
  const location = getLocation(locationId);
  if (!location) throw new Error("Location not found.");
  const query = locationVerifyQuery(location);
  if (!query) throw new Error("This location has no name or address to look up.");
  if (!options?.force) {
    const cached = readVerifyCache(locationId, query);
    if (cached) return cached;
  }
  const place = await findBestPlace(query, options?.fetchImpl ?? fetch);
  return writeVerifyCache(locationId, query, place);
}

export async function lookupUnverifiedBatch(options?: {
  limit?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ lookedUp: number }> {
  const limit = Math.min(Math.max(options?.limit ?? VERIFY_BATCH_LIMIT, 1), VERIFY_BATCH_LIMIT);
  const pending = listUnverifiedLocations().filter((location) => {
    const query = locationVerifyQuery(location);
    return query && !readVerifyCache(location.id, query);
  });
  const batch = pending.slice(0, limit);
  for (const location of batch) {
    await lookupLocationPlace(location.id, { fetchImpl: options?.fetchImpl });
  }
  return { lookedUp: batch.length };
}

/** Writes Google's address only after the dispatcher accepts. Stops are left alone. */
export function acceptVerifiedPlace(locationId: number, place: PlaceDetails): void {
  const existing = getLocation(locationId);
  if (!existing) throw new Error("Location not found.");
  const placeId = place.placeId.trim();
  if (!placeId) throw new Error("Google did not return a place.");
  const coords = parseCoordPair(place.latitude, place.longitude);
  if (coords.lat == null || coords.lng == null) throw new Error("Google did not return a map pin.");
  updateLocation(locationId, {
    name: place.name.trim() || existing.name,
    street: place.street.trim(),
    city: place.city.trim() || existing.city,
    state: (place.state.trim() || existing.state).toUpperCase(),
    zip: place.zip.trim(),
    phone: existing.phone,
    notes: existing.notes,
    role: existing.role,
    scheduling_type: existing.scheduling_type,
    hours: existing.hours,
    scheduling_notes: existing.scheduling_notes,
    call_before: existing.call_before,
    latitude: coords.lat,
    longitude: coords.lng,
    google_place_id: placeId,
    country: place.country.trim() || existing.country,
    verified_at: new Date().toISOString(),
  });
}

export function acceptCachedPlace(locationId: number): PlaceDetails {
  const location = getLocation(locationId);
  if (!location) throw new Error("Location not found.");
  const cached = readVerifyCache(locationId, locationVerifyQuery(location));
  if (!cached?.place) throw new Error("Look up a Google match before accepting it.");
  acceptVerifiedPlace(locationId, cached.place);
  return cached.place;
}
