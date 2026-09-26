import { SAMSARA_ID_MISSING_MESSAGE, SAMSARA_TOKEN_MISSING_MESSAGE } from "./fleet-import-shared";
import { formatDateTime } from "./format";

/** msetms owns the load. This key is how the Samsara route points back at the load number. */
export const SAMSARA_ROUTE_EXTERNAL_KEY = "msetms";

export const SAMSARA_ROUTE_SCOPES = "Read Routes + Write Routes";

export const SAMSARA_ROUTE_MESSAGES = {
  token: `${SAMSARA_TOKEN_MISSING_MESSAGE} Token needs ${SAMSARA_ROUTE_SCOPES}.`,
  scopes: `Samsara rejected the token. Add ${SAMSARA_ROUTE_SCOPES}.`,
  unmapped: SAMSARA_ID_MISSING_MESSAGE,
  incomplete: "Pickup or delivery is incomplete. Need a saved address or lat/lng.",
  noTruck: "No truck assigned.",
  request: "Samsara route did not update.",
  notFound: "Samsara route was not found.",
  rateLimit: "Samsara rate-limited the route. Try again in a minute.",
} as const;

const ROUTE_STATES = new Set(["unassigned", "scheduled", "en route", "skipped", "arrived", "departed"]);

export type SamsaraRouteStopDraft = {
  externalValue: string;
  name: string;
  kind: "pickup" | "delivery";
  locationId: number | null;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  /** Samsara address id already stored on the TMS location. Empty when the Addresses tip has not synced it. */
  samsaraAddressId: string;
  arrival: string;
  departure: string;
};

export type SamsaraRouteStopBody = {
  name: string;
  externalIds: Record<string, string>;
  addressId?: string;
  singleUseLocation?: { address?: string; latitude: number; longitude: number };
  scheduledArrivalTime?: string;
  scheduledDepartureTime?: string;
};

export type SamsaraRouteBody = {
  name: string;
  externalIds: Record<string, string>;
  stops: SamsaraRouteStopBody[];
  vehicleId?: string;
  driverId?: string;
};

export type SamsaraRouteProgress = {
  routeId: string;
  status: string;
  eta: string;
};

export type SamsaraRouteCard = {
  statusLine: string;
  etaLine: string;
  routeLine: string;
  soft: boolean;
};

export function samsaraExternalPath(value: string): string {
  return `${SAMSARA_ROUTE_EXTERNAL_KEY}:${encodeURIComponent(value)}`;
}

export function rfc3339(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function hasStopCoords(draft: Pick<SamsaraRouteStopDraft, "latitude" | "longitude">): boolean {
  return Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude);
}

export function draftCanLocate(draft: SamsaraRouteStopDraft): boolean {
  if (draft.samsaraAddressId.trim()) return true;
  if (draft.locationId) return true;
  return hasStopCoords(draft);
}

export function formatStopAddress(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const cityLine = [String(parts.city ?? "").trim(), String(parts.state ?? "").trim()].filter(Boolean).join(", ");
  const cityZip = [cityLine, String(parts.zip ?? "").trim()].filter(Boolean).join(" ");
  return [String(parts.street ?? "").trim(), cityZip].filter(Boolean).join(", ");
}

export function samsaraStopBody(
  draft: SamsaraRouteStopDraft,
  addressId: string | null,
  index: number,
): SamsaraRouteStopBody | null {
  const name = draft.name.trim() || (draft.kind === "delivery" ? "Delivery" : "Pickup");
  const base: SamsaraRouteStopBody = {
    name: name.slice(0, 200),
    externalIds: { [SAMSARA_ROUTE_EXTERNAL_KEY]: draft.externalValue },
  };
  const reused = String(addressId ?? "").trim();
  if (reused) {
    base.addressId = reused;
  } else if (hasStopCoords(draft)) {
    const single: { address?: string; latitude: number; longitude: number } = {
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
    };
    const formatted = draft.formattedAddress.trim();
    if (formatted) single.address = formatted.slice(0, 255);
    base.singleUseLocation = single;
  } else {
    return null;
  }
  applyStopTimes(base, draft, index);
  return base;
}

function applyStopTimes(body: SamsaraRouteStopBody, draft: SamsaraRouteStopDraft, index: number): void {
  const arrival = rfc3339(draft.arrival);
  const departure = rfc3339(draft.departure);
  if (index === 0) {
    const depart = departure || arrival;
    if (depart) body.scheduledDepartureTime = depart;
    if (arrival && departure) body.scheduledArrivalTime = arrival;
    return;
  }
  const arrive = arrival || departure;
  if (arrive) body.scheduledArrivalTime = arrive;
  if (arrival && departure) body.scheduledDepartureTime = departure;
}

export function samsaraRouteBody(input: {
  loadNumber: string;
  vehicleId: string;
  driverId: string;
  stops: SamsaraRouteStopBody[];
}): SamsaraRouteBody {
  const body: SamsaraRouteBody = {
    name: input.loadNumber.trim() || "Load",
    externalIds: { [SAMSARA_ROUTE_EXTERNAL_KEY]: input.loadNumber.trim() },
    stops: input.stops,
  };
  const vehicleId = input.vehicleId.trim();
  const driverId = input.driverId.trim();
  if (vehicleId) body.vehicleId = vehicleId;
  if (driverId) body.driverId = driverId;
  return body;
}

export function readSamsaraId(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const record = json as { id?: unknown; data?: unknown };
  const top = idString(record.id);
  if (top) return top;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return idString((data as { id?: unknown }).id);
  }
  return "";
}

function idString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function readExternalValue(record: unknown, key = SAMSARA_ROUTE_EXTERNAL_KEY): string {
  if (!record || typeof record !== "object") return "";
  const ids = (record as { externalIds?: unknown }).externalIds;
  if (!ids || typeof ids !== "object" || Array.isArray(ids)) return "";
  const value = (ids as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function parseRouteProgress(route: unknown): SamsaraRouteProgress | null {
  if (!route || typeof route !== "object") return null;
  const stops = readStops(route);
  if (!stops.length && !readSamsaraId(route) && !readExternalValue(route)) return null;
  const active = pickActiveStop(stops);
  const status = active ? knownState(active.state) : "";
  const eta = active ? readStopEta(active) : "";
  return {
    routeId: readSamsaraId(route),
    status,
    eta,
  };
}

export function pickActiveStop(stops: Array<Record<string, unknown>>): Record<string, unknown> | null {
  for (const state of ["en route", "arrived", "scheduled", "unassigned"]) {
    const found = stops.find((stop) => knownState(stop.state) === state);
    if (found) return found;
  }
  return stops.length ? stops[stops.length - 1] : null;
}

/** ETA only when Samsara sent `eta`. Scheduled times are the appointment, not an ETA. */
export function readStopEta(stop: Record<string, unknown>): string {
  return rfc3339(typeof stop.eta === "string" ? stop.eta : "");
}

function knownState(value: unknown): string {
  const state = typeof value === "string" ? value.trim() : "";
  return ROUTE_STATES.has(state) ? state : "";
}

function readStops(route: unknown): Array<Record<string, unknown>> {
  if (!route || typeof route !== "object") return [];
  const stops = (route as { stops?: unknown }).stops;
  if (!Array.isArray(stops)) return [];
  return stops.filter((stop): stop is Record<string, unknown> => Boolean(stop) && typeof stop === "object");
}

export function readFeedEntries(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as { data?: unknown }).data;
  return Array.isArray(data) ? data : [];
}

export function readFeedCursor(json: unknown): { endCursor: string; hasNextPage: boolean } {
  if (!json || typeof json !== "object") return { endCursor: "", hasNextPage: false };
  const pagination = (json as { pagination?: unknown }).pagination;
  if (!pagination || typeof pagination !== "object") return { endCursor: "", hasNextPage: false };
  const cursor = (pagination as { endCursor?: unknown }).endCursor;
  const hasNext = (pagination as { hasNextPage?: unknown }).hasNextPage === true;
  return { endCursor: typeof cursor === "string" ? cursor : "", hasNextPage: hasNext };
}

export function feedRoute(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return null;
  return (entry as { route?: unknown }).route ?? null;
}

export function statusLabel(state: string): string {
  switch (state) {
    case "unassigned":
      return "Unassigned.";
    case "scheduled":
      return "Scheduled.";
    case "en route":
      return "En route.";
    case "arrived":
      return "Arrived.";
    case "departed":
      return "Departed.";
    case "skipped":
      return "Skipped.";
    default:
      return "";
  }
}

export function formatSamsaraEta(iso: string): string {
  const stamp = rfc3339(iso);
  if (!stamp) return "";
  const label = formatDateTime(stamp);
  if (!label || label === "—") return "";
  return label;
}

export function samsaraRouteCard(input: {
  truckAssigned: boolean;
  driverAssigned: boolean;
  routeId: string;
  status: string;
  eta: string;
  note: string;
}): SamsaraRouteCard {
  const routeId = input.routeId.trim();
  const note = input.note.trim();
  const routeLine = routeId ? `Route ${routeId}` : "";
  if (!input.truckAssigned && !input.driverAssigned) {
    return { statusLine: SAMSARA_ROUTE_MESSAGES.noTruck, etaLine: "", routeLine: "", soft: true };
  }
  if (note) {
    return { statusLine: note, etaLine: "", routeLine, soft: true };
  }
  const label = statusLabel(input.status.trim());
  const etaText = formatSamsaraEta(input.eta);
  const etaLine = etaText ? `ETA ${etaText}` : "";
  if (!label) {
    return {
      statusLine: routeId ? "Sent to Samsara." : SAMSARA_ROUTE_MESSAGES.request,
      etaLine: "",
      routeLine,
      soft: true,
    };
  }
  return {
    statusLine: input.status.trim() === "en route" && !etaLine ? "En route. No ETA from Samsara." : label,
    etaLine,
    routeLine,
    soft: false,
  };
}

export function mergeRouteProgress(
  fromRoute: SamsaraRouteProgress | null,
  fromFeed: SamsaraRouteProgress | null,
): SamsaraRouteProgress | null {
  if (!fromRoute && !fromFeed) return null;
  const routeId = fromRoute?.routeId || fromFeed?.routeId || "";
  const status = fromRoute?.status || fromFeed?.status || "";
  let eta = fromRoute?.eta || "";
  if (!eta && fromFeed?.eta && (status === "en route" || !fromRoute?.status)) eta = fromFeed.eta;
  if (!routeId && !status && !eta) return null;
  return { routeId, status, eta };
}

export function httpFailureMessage(status: number): string {
  if (status === 401 || status === 403) return SAMSARA_ROUTE_MESSAGES.scopes;
  if (status === 404) return SAMSARA_ROUTE_MESSAGES.notFound;
  if (status === 429) return SAMSARA_ROUTE_MESSAGES.rateLimit;
  if (status === 0) return SAMSARA_ROUTE_MESSAGES.request;
  return `Samsara route did not update (HTTP ${status}).`;
}
