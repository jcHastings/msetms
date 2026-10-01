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

export function criteriaFromSearchParams(params: { q?: string | string[] | null }): LoadSearchCriteria {
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  return {
    ...defaultSearchCriteria(),
    q: String(raw ?? "").trim(),
  };
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
