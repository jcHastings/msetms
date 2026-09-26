import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import { getLocation, saveLocationSamsaraAddress } from "../queries";
import {
  addressIdFromBody,
  buildSamsaraAddressPayload,
  externalIdFromAddressBody,
  locationExternalId,
  samsaraAddressFailure,
  samsaraAddressLookupPath,
  samsaraAddressTransportFailure,
  type SamsaraAddressSyncResult,
  type SamsaraAddressWrite,
} from "../samsara-address-shared";

const SAMSARA_BASE = "https://api.samsara.com";
const FETCH_TIMEOUT_MS = 15_000;

type SamsaraHttpResult = {
  status: number;
  body: unknown;
  text: string;
};

function remember(locationId: number, addressId: string | null, error: string): void {
  saveLocationSamsaraAddress(locationId, { samsaraAddressId: addressId, error });
}

async function samsaraJson(
  method: "GET" | "POST" | "PATCH",
  pathname: string,
  body?: SamsaraAddressWrite,
): Promise<SamsaraHttpResult> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("Samsara is not connected.");
  const response = await fetch(`${SAMSARA_BASE}${pathname}`, {
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
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { status: response.status, body: parsed, text };
}

function finishWrite(
  locationId: number,
  result: SamsaraHttpResult,
  reused: boolean,
  fallbackId: string,
): SamsaraAddressSyncResult {
  if (result.status === 401 || result.status === 403) {
    const failure = samsaraAddressFailure("scopes_insufficient", result.status);
    remember(locationId, null, failure.message);
    return failure;
  }
  if (result.status < 200 || result.status >= 300) {
    const failure = samsaraAddressFailure("request_failed");
    remember(locationId, null, failure.message);
    return failure;
  }
  const addressId = addressIdFromBody(result.body) || fallbackId;
  if (!addressId) {
    const failure = samsaraAddressFailure("request_failed");
    remember(locationId, null, failure.message);
    return failure;
  }
  const externalId = externalIdFromAddressBody(result.body);
  if (externalId && externalId !== locationExternalId(locationId)) {
    const failure = samsaraAddressFailure("request_failed");
    remember(locationId, null, failure.message);
    return failure;
  }
  remember(locationId, addressId, "");
  return { ok: true, addressId, reused };
}

function externalIdAlreadyUsed(result: SamsaraHttpResult): boolean {
  if (result.status !== 400 && result.status !== 409) return false;
  return /external/i.test(result.text);
}

/**
 * Mirror one TMS location to a Samsara address.
 * Reuses `externalIds.msetms` = location id when Samsara already has it.
 * Soft-fails. Does not write coordinates onto the location.
 */
export async function syncLocationToSamsara(locationId: number): Promise<SamsaraAddressSyncResult> {
  try {
    await loadRuntimeEnv();
    const location = getLocation(locationId);
    if (!location) {
      return { ...samsaraAddressFailure("request_failed"), message: "Location not found." };
    }
    const payload = buildSamsaraAddressPayload(location);
    if (!payload.ok) {
      const failure = samsaraAddressFailure(payload.reason);
      remember(location.id, null, failure.message);
      return failure;
    }
    if (!isSamsaraTokenSet()) {
      const failure = samsaraAddressFailure("token_missing");
      remember(location.id, null, failure.message);
      return failure;
    }

    const lookupPath = samsaraAddressLookupPath(location.id);
    const existing = await samsaraJson("GET", lookupPath);
    if (existing.status === 401 || existing.status === 403) {
      const failure = samsaraAddressFailure("scopes_insufficient", existing.status);
      remember(location.id, null, failure.message);
      return failure;
    }
    if (existing.status === 200) {
      const foundId = addressIdFromBody(existing.body);
      const externalId = externalIdFromAddressBody(existing.body);
      if (!foundId || (externalId && externalId !== locationExternalId(location.id))) {
        const failure = samsaraAddressFailure("request_failed");
        remember(location.id, null, failure.message);
        return failure;
      }
      const patched = await samsaraJson("PATCH", `/addresses/${encodeURIComponent(foundId)}`, payload.body);
      return finishWrite(location.id, patched, true, foundId);
    }
    if (existing.status !== 404) {
      const failure = samsaraAddressFailure("request_failed");
      remember(location.id, null, failure.message);
      return failure;
    }

    const created = await samsaraJson("POST", "/addresses", payload.body);
    if (externalIdAlreadyUsed(created)) {
      const patched = await samsaraJson("PATCH", lookupPath, payload.body);
      const foundId = addressIdFromBody(patched.body);
      return finishWrite(location.id, patched, true, foundId);
    }
    return finishWrite(location.id, created, false, "");
  } catch (error) {
    const failure = samsaraAddressTransportFailure(error);
    if (getLocation(locationId)) remember(locationId, null, failure.message);
    return failure;
  }
}
