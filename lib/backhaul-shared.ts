import { haversineMiles } from "./city-coords-shared";

export const BACKHAUL_RADIUS_MI = 150;
export const BACKHAUL_LOAD_CAP = 50;

export type BackhaulPlace = {
  city: string;
  state: string;
  label: string;
  lat: number;
  lng: number;
};

export type BackhaulLoadRow = {
  id: number;
  loadNumber: string;
  customer: string;
  pickup: string;
  delivery: string;
  miles: number;
  date: string;
  dateSort: string;
};

export type BackhaulCustomerRow = {
  name: string;
  loads: number;
  last: string;
  lastSort: string;
  nearestMi: number;
};

export type BackhaulCenter = {
  city: string;
  state: string;
  label: string;
  lat: number;
  lng: number;
};

export type BackhaulResult = {
  ok: true;
  reason?: undefined;
  center: BackhaulCenter;
  radiusMi: number;
  source: { id: number; loadNumber: string };
  loads: BackhaulLoadRow[];
  customers: BackhaulCustomerRow[];
};

export type BackhaulFailure = {
  ok: false;
  reason: "not_found" | "missing_delivery" | "geocode_failed" | "unauthorized" | "error";
  error: string;
  source?: { id: number; loadNumber: string };
};

export type BackhaulResponse = BackhaulResult | BackhaulFailure;

/** Collapse case, punctuation, and spaces for house-account matching. */
export function normalizeHouseCustomerKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Hard-exclude M&S house accounts. Matches M&S Loads, M & S Loads LLC,
 * MNS Loads, MS Loads, msloads*, and M and S Loads variants.
 */
export function isHouseCustomerName(name: string): boolean {
  const key = normalizeHouseCustomerKey(name);
  if (!key) return false;
  return key.startsWith("msloads") || key.startsWith("mandsloads") || key.startsWith("mnsloads");
}

export function splitCityState(value: string): { city: string; state: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || /^tbd$/i.test(trimmed)) return { city: "", state: "" };
  const match = trimmed.match(/^(.+),\s*([A-Za-z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  const named = trimmed.match(/^(.+),\s*([A-Za-z][A-Za-z\s]+)$/);
  if (named) return { city: named[1].trim(), state: named[2].trim() };
  return { city: trimmed, state: "" };
}

export function formatCityState(city: string, state: string): string {
  const place = city.trim();
  const st = state.trim().toUpperCase();
  if (place && st) return `${place}, ${st}`;
  return place || st;
}

/** Miles to the nearer of a load's PU / DEL. Null when neither point is usable. */
export function nearerMiles(
  center: { lat: number; lng: number },
  pickup: { lat: number; lng: number } | null,
  delivery: { lat: number; lng: number } | null,
): number | null {
  const pu = pickup ? haversineMiles(center.lat, center.lng, pickup.lat, pickup.lng) : null;
  const del = delivery ? haversineMiles(center.lat, center.lng, delivery.lat, delivery.lng) : null;
  if (pu == null && del == null) return null;
  if (pu == null) return del;
  if (del == null) return pu;
  return Math.min(pu, del);
}

export function isWithinBackhaulRadius(miles: number | null, radiusMi = BACKHAUL_RADIUS_MI): boolean {
  return miles != null && Number.isFinite(miles) && miles <= radiusMi;
}

export function sortBackhaulLoads(loads: BackhaulLoadRow[]): BackhaulLoadRow[] {
  return [...loads].sort((a, b) => {
    if (a.miles !== b.miles) return a.miles - b.miles;
    return b.dateSort.localeCompare(a.dateSort);
  });
}

export function rollupBackhaulCustomers(loads: BackhaulLoadRow[]): BackhaulCustomerRow[] {
  const byName = new Map<string, BackhaulCustomerRow>();
  for (const load of loads) {
    const name = load.customer.trim();
    if (!name || isHouseCustomerName(name)) continue;
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, {
        name,
        loads: 1,
        last: load.date,
        lastSort: load.dateSort,
        nearestMi: load.miles,
      });
      continue;
    }
    existing.loads += 1;
    if (load.dateSort > existing.lastSort) {
      existing.last = load.date;
      existing.lastSort = load.dateSort;
    }
    if (load.miles < existing.nearestMi) existing.nearestMi = load.miles;
  }
  return [...byName.values()].sort((a, b) => {
    if (a.loads !== b.loads) return b.loads - a.loads;
    return a.nearestMi - b.nearestMi;
  });
}

export function capBackhaulLoads(loads: BackhaulLoadRow[], cap = BACKHAUL_LOAD_CAP): BackhaulLoadRow[] {
  return loads.slice(0, cap);
}
