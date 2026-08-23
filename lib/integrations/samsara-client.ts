import { gunzipSync } from "node:zlib";
import { getSamsaraApiToken } from "../env";

export const SAMSARA_API_BASE = "https://api.samsara.com";
/** Pin a dated schema so GPS / HOS / IFTA shapes stay stable. */
export const SAMSARA_API_VERSION = "2025-10-23";
export const SAMSARA_FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 20;

export class SamsaraHttpError extends Error {
  status: number;
  constructor(status: number, context: string) {
    super(samsaraStatusMessage(status, context));
    this.name = "SamsaraHttpError";
    this.status = status;
  }
}

export function samsaraAuthHeaders(): Record<string, string> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-Samsara-Version": SAMSARA_API_VERSION,
  };
}

export async function samsaraRequest<T>(
  pathname: string,
  init: RequestInit,
  context: string,
): Promise<T> {
  const url = pathname.startsWith("http") ? pathname : `${SAMSARA_API_BASE}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...samsaraAuthHeaders(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(SAMSARA_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new SamsaraHttpError(response.status, context);
  return (await response.json()) as T;
}

export async function samsaraPaginate(
  pathname: string,
  context: string,
  query?: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(pathname, SAMSARA_API_BASE);
    if (query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    }
    if (after) url.searchParams.set("after", after);
    const body = await samsaraRequest<{
      data?: Array<Record<string, unknown>>;
      pagination?: { endCursor?: string; hasNextPage?: boolean };
    }>(url.pathname + url.search, { method: "GET" }, context);
    items.push(...(body.data ?? []));
    if (!body.pagination?.hasNextPage || !body.pagination.endCursor) break;
    after = body.pagination.endCursor;
  }
  return items;
}

/** IFTA detail download URLs are gzipped (Samsara docs). Plain CSV is also accepted. */
export async function samsaraDownloadText(url: string, context: string): Promise<string> {
  const response = await fetch(url, {
    headers: samsaraAuthHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(SAMSARA_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new SamsaraHttpError(response.status, context);
  const bytes = Buffer.from(await response.arrayBuffer());
  return decodeMaybeGzip(bytes);
}

export function decodeMaybeGzip(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzipSync(bytes).toString("utf8");
  }
  return bytes.toString("utf8");
}

export function samsaraStatusMessage(status: number, context: string): string {
  if (status === 401 || status === 403) {
    return `Samsara ${context} rejected the API token (HTTP ${status}). Check SAMSARA_API_TOKEN and token scopes, then restart.`;
  }
  if (status === 429) return `Samsara rate-limited the ${context} request.`;
  return `Samsara ${context} failed (HTTP ${status}).`;
}

export function publicSamsaraError(error: unknown, fallback: string): string {
  if (error instanceof SamsaraHttpError) {
    return `${error.message} ${fallback}`;
  }
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return `Samsara request timed out. ${fallback}`;
  }
  return `Samsara request failed. ${fallback}`;
}
