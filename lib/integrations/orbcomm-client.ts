import {
  getOrbcommAccountId,
  getOrbcommApiBase,
  getOrbcommClientId,
  getOrbcommClientSecret,
  getOrbcommOrgKey,
  getOrbcommPassword,
  getOrbcommUsername,
} from "../env";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Official Transportation Platform B2B (Postman: SynB2BGatewayService).
 * Auth is username + password → access token. Snapshot paths below are the
 * only place to add a contract-specific asset URL later.
 */
export const ORBCOMM_GENERATE_TOKEN_PATH = "/SynB2BGatewayService/api/generateToken";
export const ORBCOMM_REFRESH_TOKEN_PATH = "/SynB2BGatewayService/api/refreshToken";

/**
 * Partner accounts expose different snapshot URLs. When ORBCOMM enables one,
 * add it here (first match with rows wins). Do not scrape the web portal.
 */
export const ORBCOMM_SNAPSHOT_PATHS = [
  "/SynB2BGatewayService/api/GetAssetLatestPositions",
  "/SynB2BGatewayService/api/assetStatus",
  "/SynB2BGatewayService/api/assets/status",
  "/SynB2BGatewayService/api/ReeferStatus",
];

export class OrbcommHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(orbcommStatusMessage(status));
    this.name = "OrbcommHttpError";
    this.status = status;
  }
}

export function orbcommTokenBody(): Record<string, string> {
  const userName = getOrbcommUsername() ?? "";
  const password = getOrbcommPassword() ?? "";
  const orgKey = getOrbcommOrgKey() || getOrbcommAccountId() || "";
  const body: Record<string, string> = { userName, password };
  if (orgKey) body.orgKey = orgKey;
  const clientId = getOrbcommClientId();
  const clientSecret = getOrbcommClientSecret();
  if (clientId) body.clientId = clientId;
  if (clientSecret) body.clientSecret = clientSecret;
  return body;
}

export function extractOrbcommAccessToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  return (
    asString(nested.accessToken) ||
    asString(nested.access_token) ||
    asString(nested.token) ||
    asString(record.accessToken) ||
    asString(record.access_token) ||
    asString(record.token) ||
    asString(record.Token)
  );
}

export async function generateOrbcommAccessToken(): Promise<string> {
  const username = getOrbcommUsername();
  const password = getOrbcommPassword();
  if (!username || !password) throw new Error("ORBCOMM credentials are not set.");

  const url = new URL(ORBCOMM_GENERATE_TOKEN_PATH, getOrbcommApiBase());
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orbcommTokenBody()),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new OrbcommHttpError(response.status);
  const token = extractOrbcommAccessToken(await response.json());
  if (!token) throw new Error("ORBCOMM token response did not include an access token.");
  return token;
}

/** Live reefer / trailer snapshot. Empty array means use the CSV/JSON import. */
export async function fetchOrbcommAssetSnapshot(token: string): Promise<unknown> {
  for (const pathname of ORBCOMM_SNAPSHOT_PATHS) {
    try {
      const url = new URL(pathname, getOrbcommApiBase());
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Unknown partner paths are expected until ORBCOMM enables B2B snapshots.
    }
  }
  return [];
}

export function orbcommStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `ORBCOMM rejected the credentials (HTTP ${status}). Check ORBCOMM_USERNAME / ORBCOMM_PASSWORD and restart. Showing demo temps.`;
  }
  return `ORBCOMM request failed (HTTP ${status}). Showing demo temps.`;
}

export function publicOrbcommError(error: unknown): string {
  if (error instanceof OrbcommHttpError) return error.message;
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "ORBCOMM request timed out. Showing demo temps.";
  }
  return "ORBCOMM request failed. Showing demo temps.";
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
