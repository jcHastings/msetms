import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import {
  getDriver,
  getLoad,
  getLocation,
  findLoadIdByNumber,
  rememberLocationSamsaraAddressId,
  saveSamsaraRouteMirror,
} from "../queries";
import { getDb } from "../db";
import { listStops } from "../stops";
import type { LoadStop } from "../stops-shared";
import type { LoadView } from "../types";
import {
  SAMSARA_ROUTE_MESSAGES,
  draftCanLocate,
  feedRoute,
  formatStopAddress,
  httpFailureMessage,
  mergeRouteProgress,
  parseRouteProgress,
  readExternalValue,
  readFeedCursor,
  readFeedEntries,
  readSamsaraId,
  rfc3339,
  samsaraExternalPath,
  samsaraRouteBody,
  samsaraRouteCard,
  samsaraStopBody,
  type SamsaraRouteCard,
  type SamsaraRouteProgress,
  type SamsaraRouteStopBody,
  type SamsaraRouteStopDraft,
} from "../samsara-routes-shared";

export {
  SAMSARA_ROUTE_MESSAGES,
  SAMSARA_ROUTE_SCOPES,
  samsaraRouteCard,
} from "../samsara-routes-shared";

const SAMSARA_BASE = "https://api.samsara.com";
const FETCH_TIMEOUT_MS = 8_000;
const FEED_PAGES = 3;
const PROGRESS_TTL_MS = 25_000;

type FetchImpl = typeof fetch;

export type SamsaraRouteDeps = {
  token?: string | null;
  fetchImpl?: FetchImpl;
};

export type SamsaraRouteSyncResult = {
  ok: true;
  mirrored: boolean;
  skipped?: boolean;
  routeId?: string;
  message: string;
};

type CacheEntry = { at: number; card: SamsaraRouteCard };
const progressCache = new Map<number, CacheEntry>();

export function resetSamsaraRouteForTests(): void {
  progressCache.clear();
}

export async function mirrorSamsaraRouteQuiet(loadId: number): Promise<void> {
  try {
    await syncSamsaraRouteForLoad(loadId);
  } catch {
    // Assign already saved. A Samsara miss must not fail Save or assign.
  }
}

export async function syncSamsaraRouteForLoad(
  loadId: number,
  deps: SamsaraRouteDeps = {},
): Promise<SamsaraRouteSyncResult> {
  try {
    return await syncInner(loadId, deps);
  } catch {
    remember(loadId, { note: SAMSARA_ROUTE_MESSAGES.request });
    return { ok: true, mirrored: false, message: SAMSARA_ROUTE_MESSAGES.request };
  }
}

async function syncInner(loadId: number, deps: SamsaraRouteDeps): Promise<SamsaraRouteSyncResult> {
  const load = getLoad(loadId);
  if (!load) return { ok: true, mirrored: false, skipped: true, message: "" };
  if (!load.truck_id && !load.driver_id) {
    return { ok: true, mirrored: false, skipped: true, message: "" };
  }
  if (!load.truck_id) {
    return finishSoft(loadId, SAMSARA_ROUTE_MESSAGES.noTruck);
  }
  const truckVehicleId = String(load.truck_samsara_id ?? "").trim();
  if (!truckVehicleId) {
    return finishSoft(loadId, SAMSARA_ROUTE_MESSAGES.unmapped);
  }
  const token = await resolveToken(deps);
  if (!token) return finishSoft(loadId, SAMSARA_ROUTE_MESSAGES.token);
  const drafts = draftsForLoad(load);
  if (!drafts.length || drafts.some((draft) => !draftCanLocate(draft))) {
    return finishSoft(loadId, SAMSARA_ROUTE_MESSAGES.incomplete);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const driverId = load.driver_id ? String(getDriver(load.driver_id)?.samsara_driver_id ?? "").trim() : "";
  const resolved = await resolveStopBodies(token, drafts, fetchImpl);
  if ("message" in resolved) return finishSoft(loadId, resolved.message);

  const body = samsaraRouteBody({
    loadNumber: load.load_number,
    vehicleId: truckVehicleId,
    driverId,
    stops: resolved.stops,
  });
  const upsert = await upsertRoute(token, load, body, fetchImpl);
  if (!upsert.routeId) return finishSoft(loadId, upsert.message);
  progressCache.delete(loadId);
  remember(loadId, {
    routeId: upsert.routeId,
    note: "",
    syncedAt: new Date().toISOString(),
  });
  return { ok: true, mirrored: true, routeId: upsert.routeId, message: "" };
}

export async function refreshSamsaraRouteProgress(
  loadId: number,
  deps: SamsaraRouteDeps = {},
): Promise<SamsaraRouteCard> {
  const load = getLoad(loadId);
  if (!load) {
    return samsaraRouteCard({
      truckAssigned: false,
      driverAssigned: false,
      routeId: "",
      status: "",
      eta: "",
      note: "",
    });
  }
  const cached = progressCache.get(loadId);
  if (!deps.fetchImpl && cached && Date.now() - cached.at < PROGRESS_TTL_MS) return cached.card;

  const card = await readProgress(load, deps);
  if (!deps.fetchImpl) progressCache.set(loadId, { at: Date.now(), card });
  return card;
}

async function readProgress(load: LoadView, deps: SamsaraRouteDeps): Promise<SamsaraRouteCard> {
  const stored = cardFromLoad(load);
  if (!load.truck_id && !load.driver_id) return stored;
  const token = await resolveToken(deps);
  if (!token) return stored;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const fromFeed = await readAuditFeed(token, load, fetchImpl);
    const fromRoute = await readRoute(token, load, fetchImpl);
    if (fromRoute.auth) {
      remember(load.id, { note: SAMSARA_ROUTE_MESSAGES.scopes });
      return samsaraRouteCard({ ...snapshot(load), note: SAMSARA_ROUTE_MESSAGES.scopes });
    }
    const merged = mergeRouteProgress(fromRoute.progress, fromFeed);
    if (!merged) return stored;
    remember(load.id, {
      routeId: merged.routeId || load.samsara_route_id,
      status: merged.status,
      eta: merged.eta,
      note: "",
      syncedAt: new Date().toISOString(),
    });
    const fresh = getLoad(load.id) ?? load;
    return cardFromLoad(fresh);
  } catch {
    return stored;
  }
}

function cardFromLoad(load: LoadView): SamsaraRouteCard {
  return samsaraRouteCard(snapshot(load));
}

function snapshot(load: LoadView) {
  return {
    truckAssigned: Boolean(load.truck_id),
    driverAssigned: Boolean(load.driver_id),
    routeId: String(load.samsara_route_id ?? ""),
    status: String(load.samsara_route_status ?? ""),
    eta: String(load.samsara_route_eta ?? ""),
    note: String(load.samsara_route_note ?? ""),
  };
}

function finishSoft(loadId: number, message: string): SamsaraRouteSyncResult {
  progressCache.delete(loadId);
  remember(loadId, { note: message, syncedAt: new Date().toISOString() });
  return { ok: true, mirrored: false, message };
}

function remember(
  loadId: number,
  patch: { routeId?: string; status?: string; eta?: string; note?: string; syncedAt?: string },
): void {
  try {
    saveSamsaraRouteMirror(loadId, patch);
  } catch {
    // The load row is already saved. Mirror columns are optional.
  }
}

async function resolveToken(deps: SamsaraRouteDeps): Promise<string> {
  if (deps.token !== undefined) return String(deps.token ?? "").trim();
  await loadRuntimeEnv();
  if (!isSamsaraTokenSet()) return "";
  return getSamsaraApiToken()?.trim() ?? "";
}

function draftsForLoad(load: LoadView): SamsaraRouteStopDraft[] {
  const stops = listStops(load.id, { geofence: false });
  const rows = stops.length ? stops : virtualStops(load);
  const hasPickup = rows.some((stop) => stop.kind === "pickup");
  const hasDelivery = rows.some((stop) => stop.kind === "delivery");
  if (!hasPickup || !hasDelivery || rows.length < 2) return [];
  return rows.map((stop, index) => draftFromStop(load, stop, index));
}

function virtualStops(load: LoadView): LoadStop[] {
  const pickup = virtualStop(load, "pickup", load.shipper_location_id, load.origin, load.pickup_start, load.pickup_end);
  const delivery = virtualStop(
    load,
    "delivery",
    load.consignee_location_id,
    load.destination,
    load.delivery_start,
    load.delivery_end,
  );
  return [pickup, delivery];
}

function virtualStop(
  load: LoadView,
  kind: "pickup" | "delivery",
  locationId: number | null,
  lane: string,
  windowStart: string,
  windowEnd: string,
): LoadStop {
  const location = locationId ? getLocation(locationId) : null;
  const split = splitLane(lane);
  return {
    id: 0,
    load_id: load.id,
    sequence: kind === "pickup" ? 1 : 2,
    kind,
    location_id: location?.id ?? null,
    name: location?.name || split.city || lane,
    street: location?.street ?? "",
    city: location?.city || split.city,
    state: location?.state || split.state,
    zip: location?.zip ?? "",
    phone: location?.phone ?? "",
    window_start: windowStart,
    window_end: windowEnd,
    confirmation: "",
    cargo: "",
    reference: "",
    instructions: "",
    notes: "",
    arrived_at: "",
    departed_at: "",
    delivered: 0,
    schedule_type: "",
  };
}

function splitLane(value: string): { city: string; state: string } {
  const match = value.trim().match(/^(.+),\s*([A-Za-z]{2})$/);
  if (!match) return { city: value.trim(), state: "" };
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function draftFromStop(load: LoadView, stop: LoadStop, index: number): SamsaraRouteStopDraft {
  const location = stop.location_id ? getLocation(stop.location_id) : null;
  const formatted = formatStopAddress({
    street: stop.street || location?.street,
    city: stop.city || location?.city,
    state: stop.state || location?.state,
    zip: stop.zip || location?.zip,
  });
  const externalValue = stop.id ? `stop-${stop.id}` : `${load.load_number}-${stop.kind}-${index + 1}`;
  return {
    externalValue,
    name: (stop.name || location?.name || (stop.kind === "delivery" ? "Delivery" : "Pickup")).trim(),
    kind: stop.kind,
    locationId: location?.id ?? null,
    formattedAddress: formatted,
    latitude: finiteCoord(location?.latitude),
    longitude: finiteCoord(location?.longitude),
    samsaraAddressId: String(location?.samsara_address_id ?? "").trim(),
    arrival: rfc3339(stop.window_start),
    departure: rfc3339(stop.window_end),
  };
}

function finiteCoord(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function resolveStopBodies(
  token: string,
  drafts: SamsaraRouteStopDraft[],
  fetchImpl: FetchImpl,
): Promise<{ stops: SamsaraRouteStopBody[] } | { message: string }> {
  const cache = new Map<number, string>();
  const stops: SamsaraRouteStopBody[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const addressId = await resolveAddressId(token, draft, fetchImpl, cache);
    const body = samsaraStopBody(draft, addressId || null, index, drafts.length);
    if (!body) return { message: SAMSARA_ROUTE_MESSAGES.incomplete };
    stops.push(body);
  }
  return { stops };
}

/** Prefer a stored Samsara address id, else GET /addresses/msetms:{locationId}. Never creates an address. */
async function resolveAddressId(
  token: string,
  draft: SamsaraRouteStopDraft,
  fetchImpl: FetchImpl,
  cache: Map<number, string>,
): Promise<string> {
  const stored = draft.samsaraAddressId.trim();
  if (stored) return stored;
  const locationId = draft.locationId;
  if (!locationId) return "";
  const cached = cache.get(locationId);
  if (cached) return cached;
  const path = `/addresses/${samsaraExternalPath(String(locationId))}`;
  const existing = await samsaraRequest(token, "GET", path, undefined, fetchImpl);
  if (existing.status < 200 || existing.status >= 300) return "";
  const existingId = readSamsaraId(existing.json);
  if (!existingId) return "";
  cache.set(locationId, existingId);
  rememberLocationSamsaraAddressId(locationId, existingId);
  return existingId;
}

async function upsertRoute(
  token: string,
  load: LoadView,
  body: ReturnType<typeof samsaraRouteBody>,
  fetchImpl: FetchImpl,
): Promise<{ routeId: string; message: string }> {
  let routeId = String(load.samsara_route_id ?? "").trim();
  if (!routeId) {
    const found = await samsaraRequest(
      token,
      "GET",
      `/fleet/routes/${samsaraExternalPath(load.load_number)}`,
      undefined,
      fetchImpl,
    );
    if (found.status === 401 || found.status === 403) {
      return { routeId: "", message: SAMSARA_ROUTE_MESSAGES.scopes };
    }
    if (found.status >= 200 && found.status < 300) routeId = readSamsaraId(found.json);
  }
  if (routeId) {
    const patched = await samsaraRequest(token, "PATCH", `/fleet/routes/${encodeURIComponent(routeId)}`, body, fetchImpl);
    if (patched.status === 404) routeId = "";
    else if (patched.status >= 200 && patched.status < 300) {
      return { routeId: readSamsaraId(patched.json) || routeId, message: "" };
    } else {
      return { routeId: "", message: httpFailureMessage(patched.status) };
    }
  }
  const created = await samsaraRequest(token, "POST", "/fleet/routes", body, fetchImpl);
  if (created.status >= 200 && created.status < 300) {
    const id = readSamsaraId(created.json);
    if (id) return { routeId: id, message: "" };
  }
  return { routeId: "", message: httpFailureMessage(created.status) };
}

async function readRoute(
  token: string,
  load: LoadView,
  fetchImpl: FetchImpl,
): Promise<{ auth: boolean; progress: SamsaraRouteProgress | null }> {
  const storedId = String(load.samsara_route_id ?? "").trim();
  const path = storedId
    ? `/fleet/routes/${encodeURIComponent(storedId)}`
    : `/fleet/routes/${samsaraExternalPath(load.load_number)}`;
  const response = await samsaraRequest(token, "GET", path, undefined, fetchImpl);
  if (response.status === 401 || response.status === 403) return { auth: true, progress: null };
  if (response.status < 200 || response.status >= 300) return { auth: false, progress: null };
  const data = response.json && typeof response.json === "object" ? (response.json as { data?: unknown }).data : null;
  return { auth: false, progress: parseRouteProgress(data ?? response.json) };
}

async function readAuditFeed(
  token: string,
  load: LoadView,
  fetchImpl: FetchImpl,
): Promise<SamsaraRouteProgress | null> {
  let after = readStoredFeedCursor();
  let matched: SamsaraRouteProgress | null = null;
  for (let page = 0; page < FEED_PAGES; page += 1) {
    const params = new URLSearchParams();
    params.set("expand", "route");
    if (after) params.set("after", after);
    const response = await samsaraRequest(
      token,
      "GET",
      `/fleet/routes/audit-logs/feed?${params.toString()}`,
      undefined,
      fetchImpl,
    );
    if (response.status === 401 || response.status === 403) return matched;
    if (response.status < 200 || response.status >= 300) return matched;
    for (const entry of readFeedEntries(response.json)) {
      const route = feedRoute(entry);
      const progress = parseRouteProgress(route);
      if (!progress) continue;
      const loadNumber = readExternalValue(route);
      const loadId = loadNumber ? findLoadIdByNumber(loadNumber) : null;
      const sameRoute = Boolean(progress.routeId) && progress.routeId === String(load.samsara_route_id ?? "").trim();
      const sameLoad = loadNumber === load.load_number || loadId === load.id || sameRoute;
      if (loadId && loadId !== load.id && (progress.routeId || progress.status || progress.eta)) {
        remember(loadId, {
          routeId: progress.routeId || undefined,
          status: progress.status || undefined,
          eta: progress.eta || undefined,
          syncedAt: new Date().toISOString(),
        });
      }
      if (sameLoad) {
        const prev = matched as SamsaraRouteProgress | null;
        matched = {
          routeId: progress.routeId || prev?.routeId || "",
          status: progress.status || prev?.status || "",
          eta: progress.eta || prev?.eta || "",
        };
      }
    }
    const cursor = readFeedCursor(response.json);
    if (cursor.endCursor) {
      after = cursor.endCursor;
      writeStoredFeedCursor(cursor.endCursor);
    }
    if (!cursor.hasNextPage) break;
  }
  return matched;
}

function readStoredFeedCursor(): string {
  try {
    const row = getDb().prepare("SELECT cursor FROM samsara_route_feed WHERE id = 1").get() as
      | { cursor?: string }
      | undefined;
    return String(row?.cursor ?? "");
  } catch {
    return "";
  }
}

function writeStoredFeedCursor(cursor: string): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO samsara_route_feed (id, cursor, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
      )
      .run(cursor, new Date().toISOString());
  } catch {
    // Cursor is an optimization. The route GET still has the current stop.
  }
}

async function samsaraRequest(
  token: string,
  method: string,
  path: string,
  body: unknown,
  fetchImpl: FetchImpl,
): Promise<{ status: number; json: unknown }> {
  try {
    const response = await fetchImpl(`${SAMSARA_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json };
  } catch {
    return { status: 0, json: null };
  }
}
