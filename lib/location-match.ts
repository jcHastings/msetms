/**
 * Suggest an existing facility for a rate-con stop or a new location.
 * This never writes. A caller saves an alias only after the dispatcher clicks Use.
 */
import { haversineMiles } from "./places-shared";

/** About 100 meters. Geocode inside this radius is the primary signal. */
export const GEOCODE_MATCH_METERS = 100;
const METERS_PER_MILE = 1609.344;
/** Pins closer than this are a tie. Name similarity breaks it. */
const GEOCODE_TIE_METERS = 15;

export type FacilityAlias = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type FacilityRecord = FacilityAlias & {
  id: number;
  latitude?: number | null;
  longitude?: number | null;
  archived_at?: string | null;
  aliases?: FacilityAlias[];
};

export type IncomingFacility = {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FacilityMatchReason = "alias" | "geocode" | "address" | "zip_house";

export type FacilityMatch = {
  id: number;
  name: string;
  reason: FacilityMatchReason;
  distanceMeters: number | null;
};

export type NormalizedFacilityAddress = {
  line: string;
  house: string;
  core: string;
  zip5: string;
};

const DIRECTION: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
};

const SUFFIX: Record<string, string> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  rd: "road",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  hwy: "highway",
  pkwy: "parkway",
  ct: "court",
  pl: "place",
  cir: "circle",
  trl: "trail",
  ter: "terrace",
};

const SUITE = new Set(["suite", "ste", "unit", "apt", "apartment", "bldg", "building", "floor", "fl", "room", "rm"]);
const DROPPED = new Set([...Object.values(DIRECTION), ...Object.values(SUFFIX), "way"]);

export function zip5(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 5);
}

/** Lowercase, strip punctuation and suite, expand St/Ave/Rd/Blvd and N/S/E/W. */
export function normalizeFacilityAddress(input: {
  street?: string | null;
  zip?: string | null;
}): NormalizedFacilityAddress {
  const rawTokens = String(input.street ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const withoutSuite: string[] = [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index] ?? "";
    if (SUITE.has(token)) {
      index += 1;
      continue;
    }
    withoutSuite.push(token);
  }
  const expanded = withoutSuite.map((token, index) => {
    if (DIRECTION[token]) return DIRECTION[token];
    if (index === withoutSuite.length - 1 && SUFFIX[token]) return SUFFIX[token];
    return token;
  });
  const house = /^\d+[a-z]?$/.test(expanded[0] ?? "") ? expanded[0] : "";
  const rest = house ? expanded.slice(1) : expanded;
  const core = rest.filter((token) => !DROPPED.has(token)).join(" ");
  return {
    line: expanded.join(" "),
    house,
    core,
    zip5: zip5(input.zip),
  };
}

export function suggestFacilityMatch(
  locations: FacilityRecord[],
  incoming: IncomingFacility,
): FacilityMatch | null {
  const active = locations.filter((location) => String(location.archived_at ?? "").trim() === "");
  const alias = bestAlias(active, incoming);
  if (alias) return alias;
  const geo = geocodeCandidates(active, incoming);
  if (geo.length) return pickGeocode(geo, incoming);
  const address = addressCandidates(active, incoming);
  if (!address.length) return null;
  return pickAddress(address, incoming);
}

type AddressHit = {
  location: FacilityRecord;
  tier: 3 | 2 | 1;
  reason: "address" | "zip_house";
};

function bestAlias(locations: FacilityRecord[], incoming: IncomingFacility): FacilityMatch | null {
  const hits: FacilityRecord[] = [];
  for (const location of locations) {
    for (const alias of location.aliases ?? []) {
      if (aliasAddressHit(alias, incoming)) {
        hits.push(location);
        break;
      }
    }
  }
  const chosen = pickByName(hits, incoming.name ?? "");
  if (!chosen) return null;
  return { id: chosen.id, name: chosen.name, reason: "alias", distanceMeters: null };
}

function aliasAddressHit(alias: FacilityAlias, incoming: IncomingFacility): boolean {
  const saved = normalizeFacilityAddress(alias);
  const next = normalizeFacilityAddress(incoming);
  if (!saved.line || saved.line !== next.line) return false;
  if (saved.zip5 && next.zip5) return saved.zip5 === next.zip5;
  if (saved.zip5 || next.zip5) return false;
  return placeAgrees(alias, incoming);
}

function geocodeCandidates(
  locations: FacilityRecord[],
  incoming: IncomingFacility,
): Array<{ location: FacilityRecord; meters: number }> {
  const lat = finiteCoord(incoming.latitude);
  const lng = finiteCoord(incoming.longitude);
  if (lat == null || lng == null) return [];
  const hits: Array<{ location: FacilityRecord; meters: number }> = [];
  for (const location of locations) {
    const locLat = finiteCoord(location.latitude);
    const locLng = finiteCoord(location.longitude);
    if (locLat == null || locLng == null) continue;
    const miles = haversineMiles({ lat, lng }, { lat: locLat, lng: locLng });
    if (miles == null) continue;
    const meters = miles * METERS_PER_MILE;
    if (meters <= GEOCODE_MATCH_METERS) hits.push({ location, meters });
  }
  return hits;
}

function pickGeocode(
  hits: Array<{ location: FacilityRecord; meters: number }>,
  incoming: IncomingFacility,
): FacilityMatch {
  const sorted = [...hits].sort((a, b) => a.meters - b.meters || a.location.id - b.location.id);
  const closest = sorted[0]!;
  const tied = sorted.filter((hit) => hit.meters - closest.meters <= GEOCODE_TIE_METERS);
  const chosen = pickByName(
    tied.map((hit) => hit.location),
    incoming.name ?? "",
  )!;
  const meters = tied.find((hit) => hit.location.id === chosen.id)?.meters ?? closest.meters;
  return {
    id: chosen.id,
    name: chosen.name,
    reason: "geocode",
    distanceMeters: Math.round(meters),
  };
}

function addressCandidates(locations: FacilityRecord[], incoming: IncomingFacility): AddressHit[] {
  const next = normalizeFacilityAddress(incoming);
  if (!next.line) return [];
  const hits: AddressHit[] = [];
  for (const location of locations) {
    const saved = normalizeFacilityAddress(location);
    if (!saved.line) continue;
    const zipAgrees = Boolean(next.zip5 && saved.zip5 && next.zip5 === saved.zip5);
    const exact = saved.line === next.line && zipCompatible(saved.zip5, next.zip5) && (zipAgrees || placeAgrees(location, incoming));
    if (exact) {
      hits.push({ location, tier: 3, reason: "address" });
      continue;
    }
    if (!zipAgrees || !next.house || next.house !== saved.house || !next.core || !saved.core) continue;
    if (fuzzyStreet(next.core, saved.core)) {
      hits.push({ location, tier: 2, reason: "address" });
      continue;
    }
    hits.push({ location, tier: 1, reason: "zip_house" });
  }
  return hits;
}

function pickAddress(hits: AddressHit[], incoming: IncomingFacility): FacilityMatch {
  const bestTier = Math.max(...hits.map((hit) => hit.tier));
  const tierHits = hits.filter((hit) => hit.tier === bestTier);
  const chosen = pickByName(
    tierHits.map((hit) => hit.location),
    incoming.name ?? "",
  )!;
  const reason = tierHits.find((hit) => hit.location.id === chosen.id)?.reason ?? "address";
  return { id: chosen.id, name: chosen.name, reason, distanceMeters: null };
}

function pickByName<T extends { id: number; name: string }>(rows: T[], incomingName: string): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const score = nameSimilarity(incomingName, b.name) - nameSimilarity(incomingName, a.name);
    if (score !== 0) return score;
    return a.id - b.id;
  })[0] ?? null;
}

function zipCompatible(saved: string, incoming: string): boolean {
  if (saved && incoming) return saved === incoming;
  return true;
}

function placeAgrees(saved: { city: string; state: string }, incoming: IncomingFacility): boolean {
  const cityIn = normalizeName(incoming.city ?? "");
  const citySaved = normalizeName(saved.city);
  if (cityIn && citySaved && cityIn !== citySaved) return false;
  const stateIn = String(incoming.state ?? "").trim().toUpperCase();
  const stateSaved = saved.state.trim().toUpperCase();
  if (stateIn && stateSaved && stateIn !== stateSaved) return false;
  return Boolean(cityIn || stateIn);
}

function fuzzyStreet(incoming: string, saved: string): boolean {
  if (incoming === saved) return true;
  const budget = streetBudget(incoming, saved);
  if (!budget) return false;
  if (Math.abs(incoming.length - saved.length) > budget) return false;
  return editDistance(incoming, saved) <= budget;
}

function streetBudget(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

function finiteCoord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Name similarity is a tiebreaker only. Callers must not match on this alone. */
function nameSimilarity(incoming: string, saved: string): number {
  const left = normalizeName(incoming);
  const right = normalizeName(saved);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const length = Math.max(left.length, right.length);
  if (!length) return 0;
  return 1 - editDistance(left, right) / length;
}

/** Optimal string alignment distance (Levenshtein plus adjacent transposition). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = matrix[i]!;
      const prev = matrix[i - 1]!;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j]!, matrix[i - 2]![j - 2]! + 1);
      }
    }
  }
  return matrix[a.length]![b.length]!;
}
