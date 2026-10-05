import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import {
  DVIR_STREAM_MAX_PAGES,
  DVIR_STREAM_PATH,
  DVIR_STREAM_START,
  dvirSoftFail,
  openDvirDefectsForVehicle,
  openDvirStreamParams,
  parseOpenDvirDefects,
  type OpenDvirCard,
  type OpenDvirDefect,
} from "../samsara-dvir-shared";

const SAMSARA_BASE = "https://api.samsara.com";
const CACHE_TTL_MS = 45_000;
const FETCH_TIMEOUT_MS = 15_000;

type StreamOk = { ok: true; defects: OpenDvirDefect[]; truncated: boolean };
type StreamResult = StreamOk | Extract<OpenDvirCard, { ok: false }>;
type StreamCache = { token: string; expiresAt: number; result: StreamResult };

let cache: StreamCache | null = null;

export function resetOpenDvirCacheForTests(): void {
  cache = null;
}

export type OpenDvirFetchOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  /** null skips env and soft-fails as a missing token. */
  token?: string | null;
};

/**
 * Open Samsara DVIR defects for one truck.
 * GET /defects/stream?isResolved=false, mapped by vehicle.id to samsara_vehicle_id.
 * Does not write truck status.
 */
export async function getOpenDvirDefectsForTruck(
  truck: { samsara_vehicle_id?: string | null },
  options: OpenDvirFetchOptions = {},
): Promise<OpenDvirCard> {
  const vehicleId = String(truck.samsara_vehicle_id ?? "").trim();
  if (!vehicleId) return dvirSoftFail("vehicle_unmapped");

  const token = await resolveToken(options.token);
  if (!token) return dvirSoftFail("token_missing");

  const stream = await loadOpenDefectStream(token, options);
  if (!stream.ok) return stream;
  return {
    ok: true,
    defects: openDvirDefectsForVehicle(stream.defects, vehicleId),
    truncated: stream.truncated,
    historySince: DVIR_STREAM_START,
  };
}

async function resolveToken(override: string | null | undefined): Promise<string> {
  if (override === null) return "";
  if (typeof override === "string") return override.trim();
  await loadRuntimeEnv();
  if (!isSamsaraTokenSet()) return "";
  return getSamsaraApiToken() ?? "";
}

async function loadOpenDefectStream(token: string, options: OpenDvirFetchOptions): Promise<StreamResult> {
  const nowMs = Date.now();
  if (cache && cache.token === token && cache.expiresAt > nowMs) return cache.result;
  const result = await fetchOpenDefectStream(token, options.fetchImpl ?? fetch, options.now ?? new Date());
  cache = { token, expiresAt: nowMs + CACHE_TTL_MS, result };
  return result;
}

async function fetchOpenDefectStream(
  token: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<StreamResult> {
  const params = openDvirStreamParams(now);
  const items: unknown[] = [];
  let after: string | undefined;
  let truncated = false;

  for (let page = 0; page < DVIR_STREAM_MAX_PAGES; page += 1) {
    const url = new URL(DVIR_STREAM_PATH, SAMSARA_BASE);
    url.searchParams.set("startTime", params.startTime);
    url.searchParams.set("endTime", params.endTime);
    url.searchParams.set("isResolved", params.isResolved);
    url.searchParams.set("limit", params.limit);
    if (after) url.searchParams.set("after", after);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/abort|timeout/i.test(message)) return dvirSoftFail("timeout");
      return dvirSoftFail("request_failed");
    }

    if (response.status === 401) return dvirSoftFail("token_rejected");
    if (response.status === 403) return dvirSoftFail("scopes_insufficient");
    if (response.status === 429) return dvirSoftFail("rate_limited");
    if (!response.ok) return dvirSoftFail("request_failed");

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return dvirSoftFail("request_failed");
    }
    if (!body || typeof body !== "object") return dvirSoftFail("request_failed");
    const data = (body as { data?: unknown }).data;
    if (data != null && !Array.isArray(data)) return dvirSoftFail("request_failed");
    if (Array.isArray(data)) items.push(...data);

    const pagination = (body as { pagination?: { endCursor?: string; hasNextPage?: boolean } }).pagination;
    const endCursor = typeof pagination?.endCursor === "string" ? pagination.endCursor : "";
    if (!pagination?.hasNextPage || !endCursor) break;
    if (page + 1 >= DVIR_STREAM_MAX_PAGES) {
      truncated = true;
      break;
    }
    after = endCursor;
  }

  return { ok: true, defects: parseOpenDvirDefects(items), truncated };
}
