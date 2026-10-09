export const SEARCH_COLUMNS = [
  { key: "load_id", label: "Load ID" },
  { key: "pickups", label: "Pickups" },
  { key: "deliveries", label: "Deliveries" },
  { key: "customer", label: "Customer" },
  { key: "driver", label: "Driver" },
  { key: "truck", label: "Truck" },
  { key: "trailer", label: "Trailer" },
  { key: "refs", label: "Refs" },
  { key: "notes", label: "Notes" },
  { key: "status", label: "Status" },
] as const;

export type SearchColumnKey = (typeof SEARCH_COLUMNS)[number]["key"];

export type LoadSearchCriteria = {
  q: string;
  originState: string;
  destState: string;
  dateFrom: string;
  dateTo: string;
  searchBy: "pickup";
  customerId: number | null;
  driverId: number | null;
  truckId: number | null;
  trailerId: number | null;
  status: string;
  includeLive: boolean;
  includeArchived: boolean;
  includeCancelled: boolean;
};

export type SavedReport = {
  id: number;
  name: string;
  filters_json: string;
  columns_json: string;
  created_at: string;
  updated_at: string;
};

export function defaultSearchColumns(): SearchColumnKey[] {
  return SEARCH_COLUMNS.map((column) => column.key);
}

export function defaultSearchCriteria(): LoadSearchCriteria {
  return {
    q: "",
    originState: "",
    destState: "",
    dateFrom: "",
    dateTo: "",
    searchBy: "pickup",
    customerId: null,
    driverId: null,
    truckId: null,
    trailerId: null,
    status: "",
    includeLive: true,
    includeArchived: false,
    includeCancelled: false,
  };
}

function firstParam(value: string | string[] | null | undefined): string {
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

function flagOn(value: string | string[] | null | undefined): boolean {
  const text = firstParam(value).toLowerCase();
  return text === "1" || text === "true" || text === "on";
}

export type SearchParamInput = {
  q?: string | string[] | null;
  archived?: string | string[] | null;
  includeArchived?: string | string[] | null;
  live?: string | string[] | null;
  cancelled?: string | string[] | null;
  status?: string | string[] | null;
  originState?: string | string[] | null;
  destState?: string | string[] | null;
  dateFrom?: string | string[] | null;
  dateTo?: string | string[] | null;
  customerId?: string | string[] | null;
  driverId?: string | string[] | null;
  truckId?: string | string[] | null;
  trailerId?: string | string[] | null;
};

function optionalParamId(value: string | string[] | null | undefined): number | null {
  const parsed = Number.parseInt(firstParam(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function criteriaFromSearchParams(params: SearchParamInput): LoadSearchCriteria {
  const defaults = defaultSearchCriteria();
  return {
    ...defaults,
    q: firstParam(params.q),
    originState: firstParam(params.originState).toUpperCase(),
    destState: firstParam(params.destState).toUpperCase(),
    dateFrom: firstParam(params.dateFrom),
    dateTo: firstParam(params.dateTo),
    customerId: optionalParamId(params.customerId),
    driverId: optionalParamId(params.driverId),
    truckId: optionalParamId(params.truckId),
    trailerId: optionalParamId(params.trailerId),
    status: firstParam(params.status),
    includeLive: firstParam(params.live) === "0" ? false : defaults.includeLive,
    includeArchived: flagOn(params.archived) || flagOn(params.includeArchived),
    includeCancelled: flagOn(params.cancelled),
  };
}

/** Shareable search URL. `archived=1` is the Include archived switch. */
export function searchShareQuery(criteria: LoadSearchCriteria): string {
  const params = new URLSearchParams();
  if (criteria.q.trim()) params.set("q", criteria.q.trim());
  if (criteria.includeArchived) params.set("archived", "1");
  if (!criteria.includeLive) params.set("live", "0");
  if (criteria.includeCancelled) params.set("cancelled", "1");
  if (criteria.status) params.set("status", criteria.status);
  if (criteria.originState) params.set("originState", criteria.originState);
  if (criteria.destState) params.set("destState", criteria.destState);
  if (criteria.dateFrom) params.set("dateFrom", criteria.dateFrom);
  if (criteria.dateTo) params.set("dateTo", criteria.dateTo);
  if (criteria.customerId) params.set("customerId", String(criteria.customerId));
  if (criteria.driverId) params.set("driverId", String(criteria.driverId));
  if (criteria.truckId) params.set("truckId", String(criteria.truckId));
  if (criteria.trailerId) params.set("trailerId", String(criteria.trailerId));
  return params.toString();
}

function ymd(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local Sunday–Saturday window. */
export function weekDateRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { dateFrom: ymd(start), dateTo: ymd(end) };
}

/** Local first–last day of the current month. */
export function monthDateRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: ymd(start), dateTo: ymd(end) };
}

export function isSearchColumnKey(value: string): value is SearchColumnKey {
  return SEARCH_COLUMNS.some((column) => column.key === value);
}

export function parseSavedColumns(raw: string): SearchColumnKey[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultSearchColumns();
    const keys = parsed.filter((item): item is SearchColumnKey => typeof item === "string" && isSearchColumnKey(item));
    return keys.length ? keys : defaultSearchColumns();
  } catch {
    return defaultSearchColumns();
  }
}

export function parseSavedFilters(raw: string): LoadSearchCriteria {
  try {
    const parsed = JSON.parse(raw) as Partial<LoadSearchCriteria>;
    const defaults = defaultSearchCriteria();
    return {
      ...defaults,
      q: String(parsed.q ?? ""),
      originState: String(parsed.originState ?? "").toUpperCase(),
      destState: String(parsed.destState ?? "").toUpperCase(),
      dateFrom: String(parsed.dateFrom ?? ""),
      dateTo: String(parsed.dateTo ?? ""),
      searchBy: "pickup",
      customerId: typeof parsed.customerId === "number" ? parsed.customerId : null,
      driverId: typeof parsed.driverId === "number" ? parsed.driverId : null,
      truckId: typeof parsed.truckId === "number" ? parsed.truckId : null,
      trailerId: typeof parsed.trailerId === "number" ? parsed.trailerId : null,
      status: String(parsed.status ?? ""),
      includeLive: parsed.includeLive !== false,
      includeArchived: Boolean(parsed.includeArchived),
      includeCancelled: Boolean(parsed.includeCancelled),
    };
  } catch {
    return defaultSearchCriteria();
  }
}
