import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import { getLoad, getTruck } from "../queries";
import {
  SAMSARA_SAFETY_EVENT_CAP,
  SAMSARA_SAFETY_PAGE_CAP,
  parseSamsaraSafetyEvents,
  recentSafetyWindow,
  samsaraSafetyFailure,
  samsaraSafetyOk,
  safetyWindowForLoad,
  type SamsaraSafetyEvent,
  type SamsaraSafetyResult,
} from "../samsara-safety-shared";

const SAMSARA_BASE = "https://api.samsara.com";
const SAFETY_STREAM_PATH = "/fleet/safety-events/stream";
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 45_000;

type CacheEntry = { expiresAt: number; result: SamsaraSafetyResult };
const cache = new Map<string, CacheEntry>();

export function resetSamsaraSafetyCacheForTests(): void {
  cache.clear();
}

export async function listTruckSamsaraSafety(vehicleId: string, now = new Date()): Promise<SamsaraSafetyResult> {
  try {
    await loadRuntimeEnv();
    const id = String(vehicleId ?? "").trim();
    if (!id) return samsaraSafetyFailure("unmapped");
    if (!isSamsaraTokenSet()) return samsaraSafetyFailure("token_missing");
    const window = recentSafetyWindow(now);
    return listSamsaraSafetyEvents({ vehicleId: id, start: window.start, end: window.end });
  } catch {
    return samsaraSafetyFailure("unavailable");
  }
}

export async function listLoadSamsaraSafety(loadId: number, now = new Date()): Promise<SamsaraSafetyResult> {
  try {
    await loadRuntimeEnv();
    const load = getLoad(loadId);
    if (!load) return samsaraSafetyFailure("unavailable", "Load not found.");
    if (!load.truck_id) return samsaraSafetyFailure("no_truck");
    const truck = getTruck(load.truck_id);
    const vehicleId = String(truck?.samsara_vehicle_id ?? "").trim() || String(load.truck_samsara_id ?? "").trim();
    if (!vehicleId) return samsaraSafetyFailure("unmapped");
    if (!isSamsaraTokenSet()) return samsaraSafetyFailure("token_missing");
    const window = safetyWindowForLoad(load, now);
    if (!window) return samsaraSafetyFailure("no_window");
    return listSamsaraSafetyEvents({ vehicleId, start: window.start, end: window.end });
  } catch {
    return samsaraSafetyFailure("unavailable");
  }
}

export async function listSamsaraSafetyEvents(input: {
  vehicleId: string;
  start: string;
  end: string;
}): Promise<SamsaraSafetyResult> {
  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return samsaraSafetyFailure("unmapped");
  if (!isSamsaraTokenSet()) return samsaraSafetyFailure("token_missing");
  const key = `${vehicleId}|${input.start}|${input.end}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  let result: SamsaraSafetyResult;
  try {
    result = await fetchSafetyStream({ vehicleId, start: input.start, end: input.end });
  } catch {
    result = samsaraSafetyFailure("unavailable");
  }
  if (result.ok) cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

async function fetchSafetyStream(input: {
  vehicleId: string;
  start: string;
  end: string;
}): Promise<SamsaraSafetyResult> {
  const token = getSamsaraApiToken();
  if (!token) return samsaraSafetyFailure("token_missing");

  const events: SamsaraSafetyEvent[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;
  let truncated = false;

  for (let page = 0; page < SAMSARA_SAFETY_PAGE_CAP; page += 1) {
    const url = new URL(SAFETY_STREAM_PATH, SAMSARA_BASE);
    url.searchParams.set("startTime", input.start);
    url.searchParams.set("endTime", input.end);
    // Stream defaults to updatedAtTime. The load window is when the event happened.
    url.searchParams.set("queryByTimeField", "createdAtTime");
    url.searchParams.set("assetIds", input.vehicleId);
    // VG-only harsh brake / accel / turn stay off unless this is true.
    url.searchParams.set("includeVgOnlyEvents", "true");
    if (after) url.searchParams.set("after", after);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      if (events.length) return samsaraSafetyOk(capEvents(events), true);
      return samsaraSafetyFailure("unavailable");
    }

    if (response.status === 401 || response.status === 403) {
      if (events.length) return samsaraSafetyOk(capEvents(events), true);
      return samsaraSafetyFailure("scopes");
    }
    if (response.status === 429) {
      if (events.length) return samsaraSafetyOk(capEvents(events), true);
      return samsaraSafetyFailure("rate_limit");
    }
    if (!response.ok) {
      if (events.length) return samsaraSafetyOk(capEvents(events), true);
      return samsaraSafetyFailure("unavailable");
    }

    let body: { data?: unknown; pagination?: { endCursor?: string; hasNextPage?: boolean } };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      if (events.length) return samsaraSafetyOk(capEvents(events), true);
      return samsaraSafetyFailure("unavailable");
    }

    events.push(...parseSamsaraSafetyEvents(body.data, input));
    const deduped = dedupe(events);
    const cursor = String(body.pagination?.endCursor ?? "").trim();
    const hasNext = Boolean(body.pagination?.hasNextPage && cursor);
    if (deduped.length >= SAMSARA_SAFETY_EVENT_CAP) {
      return samsaraSafetyOk(
        deduped.slice(0, SAMSARA_SAFETY_EVENT_CAP),
        hasNext || deduped.length > SAMSARA_SAFETY_EVENT_CAP,
      );
    }
    if (!hasNext) return samsaraSafetyOk(deduped, false);
    if (seenCursors.has(cursor) || page === SAMSARA_SAFETY_PAGE_CAP - 1) {
      truncated = true;
      break;
    }
    seenCursors.add(cursor);
    after = cursor;
  }

  return samsaraSafetyOk(capEvents(events), truncated);
}

function dedupe(events: SamsaraSafetyEvent[]): SamsaraSafetyEvent[] {
  const seen = new Set<string>();
  const rows: SamsaraSafetyEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    rows.push(event);
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  return rows;
}

function capEvents(events: SamsaraSafetyEvent[]): SamsaraSafetyEvent[] {
  return dedupe(events).slice(0, SAMSARA_SAFETY_EVENT_CAP);
}
