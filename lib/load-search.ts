import { parsePlace } from "./locations";
import {
  ACTIVE_LOAD_STATUSES,
  SEARCH_COLUMNS,
  isLoadStatus,
  type LoadSearchCriteria,
  type LoadStatus,
  type LoadView,
  type SearchColumnId,
} from "./types";

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export const DEFAULT_SEARCH_COLUMNS: SearchColumnId[] = SEARCH_COLUMNS.map((column) => column.id);

type QueryValue = string | string[] | undefined;
export type SearchParamRecord = Record<string, QueryValue>;

export function defaultLoadSearchCriteria(): LoadSearchCriteria {
  return {
    q: "",
    originState: "",
    destState: "",
    dateFrom: "",
    dateTo: "",
    datePreset: "",
    searchBy: "pickup",
    customerId: null,
    driverId: null,
    truckId: null,
    trailerId: null,
    status: "",
    includeLive: true,
    includeArchived: false,
    includeCancelled: false,
    columns: [...DEFAULT_SEARCH_COLUMNS],
    reportId: null,
  };
}

export function ymd(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function datePresetRange(
  preset: LoadSearchCriteria["datePreset"],
  now = new Date(),
): { from: string; to: string } | null {
  if (preset === "this_week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  return null;
}

export function resolveSearchDates(
  criteria: Pick<LoadSearchCriteria, "datePreset" | "dateFrom" | "dateTo">,
  now = new Date(),
): { from: string; to: string } {
  const preset = datePresetRange(criteria.datePreset, now);
  if (preset) return preset;
  return { from: criteria.dateFrom, to: criteria.dateTo };
}

export function statusesForSearch(criteria: LoadSearchCriteria): LoadStatus[] {
  const included: LoadStatus[] = [];
  if (criteria.includeLive) included.push(...ACTIVE_LOAD_STATUSES);
  if (criteria.includeArchived) included.push("delivered");
  if (criteria.includeCancelled) included.push("cancelled");
  if (criteria.status) {
    return included.includes(criteria.status) ? [criteria.status] : [];
  }
  return included;
}

export function parseSearchColumns(raw: string | string[] | undefined): SearchColumnId[] {
  const values = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = values
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SearchColumnId => SEARCH_COLUMNS.some((column) => column.id === value));
  return ids.length ? uniqueColumns(ids) : [...DEFAULT_SEARCH_COLUMNS];
}

export function parseLoadSearchParams(params: SearchParamRecord): LoadSearchCriteria {
  const includeTouched =
    hasParam(params, "include_live") ||
    hasParam(params, "include_archived") ||
    hasParam(params, "include_cancelled") ||
    hasParam(params, "searched");
  const statusRaw = firstParam(params, "status");
  const presetRaw = firstParam(params, "date_preset");
  return {
    q: firstParam(params, "q"),
    originState: normalizeState(firstParam(params, "origin_state")),
    destState: normalizeState(firstParam(params, "dest_state")),
    dateFrom: firstParam(params, "date_from"),
    dateTo: firstParam(params, "date_to"),
    datePreset: presetRaw === "this_week" || presetRaw === "this_month" ? presetRaw : "",
    searchBy: "pickup",
    customerId: parseId(firstParam(params, "customer_id")),
    driverId: parseId(firstParam(params, "driver_id")),
    truckId: parseId(firstParam(params, "truck_id")),
    trailerId: parseId(firstParam(params, "trailer_id")),
    status: isLoadStatus(statusRaw) ? statusRaw : "",
    includeLive: includeTouched ? isChecked(params, "include_live") : true,
    includeArchived: includeTouched ? isChecked(params, "include_archived") : false,
    includeCancelled: includeTouched ? isChecked(params, "include_cancelled") : false,
    columns: parseSearchColumns(params.cols ?? params.col),
    reportId: parseId(firstParam(params, "report")),
  };
}

export function loadSearchHref(criteria: LoadSearchCriteria): string {
  const params = new URLSearchParams();
  params.set("searched", "1");
  if (criteria.q) params.set("q", criteria.q);
  if (criteria.originState) params.set("origin_state", criteria.originState);
  if (criteria.destState) params.set("dest_state", criteria.destState);
  if (criteria.datePreset) params.set("date_preset", criteria.datePreset);
  if (criteria.dateFrom) params.set("date_from", criteria.dateFrom);
  if (criteria.dateTo) params.set("date_to", criteria.dateTo);
  if (criteria.customerId) params.set("customer_id", String(criteria.customerId));
  if (criteria.driverId) params.set("driver_id", String(criteria.driverId));
  if (criteria.truckId) params.set("truck_id", String(criteria.truckId));
  if (criteria.trailerId) params.set("trailer_id", String(criteria.trailerId));
  if (criteria.status) params.set("status", criteria.status);
  if (criteria.includeLive) params.set("include_live", "1");
  if (criteria.includeArchived) params.set("include_archived", "1");
  if (criteria.includeCancelled) params.set("include_cancelled", "1");
  if (criteria.columns.join(",") !== DEFAULT_SEARCH_COLUMNS.join(",")) {
    params.set("cols", criteria.columns.join(","));
  }
  if (criteria.reportId) params.set("report", String(criteria.reportId));
  const query = params.toString();
  return query ? `/loads/search?${query}` : "/loads/search";
}

export function criteriaFromReportFilters(raw: unknown): LoadSearchCriteria {
  const base = defaultLoadSearchCriteria();
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  const parsed = parseLoadSearchParams({
    q: asString(record.q),
    origin_state: asString(record.originState ?? record.origin_state),
    dest_state: asString(record.destState ?? record.dest_state),
    date_from: asString(record.dateFrom ?? record.date_from),
    date_to: asString(record.dateTo ?? record.date_to),
    date_preset: asString(record.datePreset ?? record.date_preset),
    customer_id: asString(record.customerId ?? record.customer_id),
    driver_id: asString(record.driverId ?? record.driver_id),
    truck_id: asString(record.truckId ?? record.truck_id),
    trailer_id: asString(record.trailerId ?? record.trailer_id),
    status: asString(record.status),
    include_live: record.includeLive === false ? "0" : "1",
    include_archived: record.includeArchived ? "1" : "0",
    include_cancelled: record.includeCancelled ? "1" : "0",
    cols: Array.isArray(record.columns) ? record.columns.join(",") : asString(record.columns),
    searched: "1",
  });
  return parsed;
}

export function placeMatchesState(place: string, state: string, locationState?: string | null): boolean {
  const wanted = normalizeState(state);
  if (!wanted) return true;
  if (locationState && normalizeState(locationState) === wanted) return true;
  return parsePlace(place).state === wanted;
}

export function loadMatchesStateFilters(
  load: LoadView & { shipper_state?: string | null; consignee_state?: string | null },
  criteria: LoadSearchCriteria,
): boolean {
  if (
    criteria.originState &&
    !placeMatchesState(load.origin, criteria.originState, load.shipper_state)
  ) {
    return false;
  }
  if (
    criteria.destState &&
    !placeMatchesState(load.destination, criteria.destState, load.consignee_state)
  ) {
    return false;
  }
  return true;
}

export function localDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return ymd(date);
}

export function loadMatchesDateRange(load: LoadView, from: string, to: string): boolean {
  const key = localDateKey(load.pickup_start);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function uniqueColumns(ids: SearchColumnId[]): SearchColumnId[] {
  return DEFAULT_SEARCH_COLUMNS.filter((id) => ids.includes(id));
}

function firstParam(params: SearchParamRecord, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function hasParam(params: SearchParamRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function isChecked(params: SearchParamRecord, key: string): boolean {
  const value = firstParam(params, key).toLowerCase();
  return value === "1" || value === "on" || value === "true";
}

function parseId(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeState(value: string): string {
  const state = value.trim().toUpperCase();
  return US_STATES.includes(state as (typeof US_STATES)[number]) ? state : "";
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}
