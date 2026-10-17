/**
 * Shared location identity. Matching and merge grouping both use this
 * normalization so "Pine Harbor Foods, LLC" and "Pine Harbor Foods" can be
 * the same facility.
 */
import { GEOCODE_MATCH_METERS, normalizeFacilityAddress, zip5 } from "./location-match";
import { haversineMiles } from "./places-shared";

const METERS_PER_MILE = 1609.344;
const NAME_SUFFIXES = new Set(["inc", "llc", "co"]);

export type LocationResolveRow = {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  verified_at?: string | null;
  archived_at?: string | null;
  merged_into?: number | null;
  hours?: string | null;
  created_at?: string | null;
  linkCount?: number | null;
  aliases?: Array<{ name?: string | null }>;
};

export type LocationResolveInput = {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type SqlDb = {
  prepare: (sql: string) => { all: () => unknown[] };
};

/** Case, punctuation, Inc/LLC/Co suffixes, and whitespace. */
export function normalizeMergeName(value: string | null | undefined): string {
  const tokens = String(value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function normalizeMergeStreet(value: string | null | undefined): string {
  return normalizeFacilityAddress({ street: value ?? "" }).line;
}

export function normalizeMergeZip(value: string | null | undefined): string {
  return zip5(value);
}

export function normalizeMergeCity(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeMergeState(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function locationHasStreet(row: { street?: string | null }): boolean {
  return normalizeMergeStreet(row.street) !== "";
}

export function locationCompleteness(row: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  google_place_id?: string | null;
  verified_at?: string | null;
  hours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): number {
  const text = [row.street, row.city, row.state, row.zip, row.phone, row.google_place_id, row.verified_at, row.hours];
  let score = text.filter((value) => String(value ?? "").trim() !== "").length;
  if (finiteCoord(row.latitude) != null && finiteCoord(row.longitude) != null) score += 1;
  return score;
}

export function loadLocationLinkCounts(db: SqlDb): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT location_id, COUNT(*) AS n FROM (
         SELECT shipper_location_id AS location_id FROM loads WHERE shipper_location_id IS NOT NULL
         UNION ALL
         SELECT consignee_location_id FROM loads WHERE consignee_location_id IS NOT NULL
         UNION ALL
         SELECT location_id FROM load_stops WHERE location_id IS NOT NULL
         UNION ALL
         SELECT location_id FROM load_template_stops WHERE location_id IS NOT NULL
         UNION ALL
         SELECT location_id FROM load_swaps WHERE location_id IS NOT NULL
         UNION ALL
         SELECT location_id FROM location_aliases
         UNION ALL
         SELECT location_id FROM location_verify_cache
       )
       WHERE location_id IS NOT NULL
       GROUP BY location_id`,
    )
    .all() as Array<{ location_id: number; n: number }>;
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(Number(row.location_id), Number(row.n) || 0);
  return counts;
}

function finiteCoord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function metersBetween(
  left: { latitude?: number | null; longitude?: number | null },
  right: { latitude?: number | null; longitude?: number | null },
): number | null {
  const lat = finiteCoord(left.latitude);
  const lng = finiteCoord(left.longitude);
  const otherLat = finiteCoord(right.latitude);
  const otherLng = finiteCoord(right.longitude);
  if (lat == null || lng == null || otherLat == null || otherLng == null) return null;
  const miles = haversineMiles({ lat, lng }, { lat: otherLat, lng: otherLng });
  if (miles == null) return null;
  return miles * METERS_PER_MILE;
}

function linkCountOf(
  row: LocationResolveRow,
  linkCounts?: Map<number, number> | Record<number, number>,
): number {
  if (linkCounts instanceof Map) return linkCounts.get(row.id) ?? Number(row.linkCount ?? 0);
  if (linkCounts && Object.prototype.hasOwnProperty.call(linkCounts, row.id)) {
    return Number(linkCounts[row.id] ?? 0);
  }
  return Number(row.linkCount ?? 0);
}

function cityStateAgrees(row: LocationResolveRow, city: string, state: string): boolean {
  if (!city && !state) return false;
  const rowCity = normalizeMergeCity(row.city);
  const rowState = normalizeMergeState(row.state);
  if (city && rowCity && city !== rowCity) return false;
  if (state && rowState && state !== rowState) return false;
  return true;
}

/**
 * Pick one kept row. Archived rows are never returned. merged_into is followed
 * to the live keeper. Several candidates are ranked (address, verified, links,
 * oldest) instead of returning null, which is what used to create a blank-street copy.
 */
export function resolveLocation<T extends LocationResolveRow>(
  rows: T[],
  incoming: LocationResolveInput,
  linkCounts?: Map<number, number> | Record<number, number>,
): T | null {
  const name = normalizeMergeName(incoming.name);
  if (!name) return null;
  const byId = new Map<number, T>();
  for (const row of rows) byId.set(row.id, row);

  function keeperOf(start: T): T | null {
    const seen = new Set<number>();
    let current: T | undefined = start;
    while (current) {
      if (seen.has(current.id)) return null;
      seen.add(current.id);
      const nextId = Number(current.merged_into);
      if (!Number.isFinite(nextId) || nextId <= 0) {
        if (String(current.archived_at ?? "").trim() !== "") return null;
        return current;
      }
      current = byId.get(nextId);
      if (!current) return null;
    }
    return null;
  }

  const incomingStreet = normalizeMergeStreet(incoming.street);
  const incomingZip = normalizeMergeZip(incoming.zip);
  const incomingPlace = String(incoming.google_place_id ?? "").trim();
  const incomingCity = normalizeMergeCity(incoming.city);
  const incomingState = normalizeMergeState(incoming.state);
  const matched = new Map<number, T>();

  function knownAs(row: T): boolean {
    if (normalizeMergeName(row.name) === name) return true;
    return (row.aliases ?? []).some((alias) => normalizeMergeName(alias.name) === name);
  }

  function add(row: T) {
    if (!knownAs(row)) return;
    const kept = keeperOf(row);
    if (!kept) return;
    matched.set(kept.id, kept);
  }

  for (const row of rows) {
    if (!knownAs(row)) continue;
    const street = normalizeMergeStreet(row.street);
    const zip = normalizeMergeZip(row.zip);
    const place = String(row.google_place_id ?? "").trim();
    const meters = metersBetween(incoming, row);
    const streetZip =
      Boolean(incomingStreet && incomingZip && street && zip && street === incomingStreet && zip === incomingZip);
    const placeHit = Boolean(incomingPlace && place && incomingPlace === place);
    const geoHit = meters != null && meters <= GEOCODE_MATCH_METERS;
    if (streetZip || placeHit || geoHit) add(row);
  }

  if (!incomingStreet) {
    const pool = rows.filter((row) => knownAs(row) && cityStateAgrees(row, incomingCity, incomingState));
    // A blank street plus the same name and city/state counts. One addressed
    // candidate wins the rank. Several addressed candidates are still ranked
    // so the caller does not create another copy.
    for (const row of pool) add(row);
  }

  const candidates = [...matched.values()];
  if (!candidates.length) return null;
  candidates.sort((left, right) => compareResolved(left, right, linkCounts));
  return candidates[0] ?? null;
}

function compareResolved(
  left: LocationResolveRow,
  right: LocationResolveRow,
  linkCounts?: Map<number, number> | Record<number, number>,
): number {
  const street = Number(locationHasStreet(right)) - Number(locationHasStreet(left));
  if (street) return street;
  const verified =
    Number(String(right.verified_at ?? "").trim() !== "") - Number(String(left.verified_at ?? "").trim() !== "");
  if (verified) return verified;
  const links = linkCountOf(right, linkCounts) - linkCountOf(left, linkCounts);
  if (links) return links;
  const created = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
  if (created) return created;
  return left.id - right.id;
}
