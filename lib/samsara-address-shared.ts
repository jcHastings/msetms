import { SAMSARA_TOKEN_MISSING_MESSAGE } from "./fleet-import-shared";
import { formatLocationAddress } from "./locations";

/** External id key on a Samsara address. Value is the TMS location id. */
export const SAMSARA_ADDRESS_EXTERNAL_KEY = "msetms";

/** Token scopes for POST/PATCH/GET https://api.samsara.com/addresses. */
export const SAMSARA_ADDRESS_SCOPES = "Read Addresses + Write Addresses";

/**
 * Circle size sent with a pin the location already has.
 * Not a measured dock outline and not a coordinate.
 */
export const SAMSARA_ADDRESS_RADIUS_METERS = 250;

export const SAMSARA_ADDRESS_NAME_MAX = 255;
export const SAMSARA_ADDRESS_FORMATTED_MAX = 1024;
export const SAMSARA_ADDRESS_NOTES_MAX = 280;

export type SamsaraAddressFailureReason =
  | "token_missing"
  | "scopes_insufficient"
  | "incomplete_address"
  | "missing_coordinates"
  | "tag_scope"
  | "request_failed";

export type SamsaraAddressFailure = {
  ok: false;
  reason: SamsaraAddressFailureReason;
  message: string;
  setupBlocker: boolean;
};

export type SamsaraAddressSuccess = {
  ok: true;
  addressId: string;
  reused: boolean;
};

export type SamsaraAddressSyncResult = SamsaraAddressSuccess | SamsaraAddressFailure;

export type SamsaraAddressWrite = {
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  geofence: {
    circle: {
      latitude: number;
      longitude: number;
      radiusMeters: number;
    };
  };
  externalIds: Record<string, string>;
  /** Required for tag-scoped tokens. Untagged POST /addresses is HTTP 404 Not Found. */
  tagIds: string[];
  notes?: string;
};

export type SamsaraAddressSource = {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  scheduling_notes?: string | null;
};

export const SAMSARA_ADDRESS_MESSAGES: Record<SamsaraAddressFailureReason, string> = {
  token_missing: `${SAMSARA_TOKEN_MISSING_MESSAGE} Token needs ${SAMSARA_ADDRESS_SCOPES}.`,
  scopes_insufficient: `Samsara rejected the token. Add ${SAMSARA_ADDRESS_SCOPES}, then try again.`,
  incomplete_address:
    "This location needs a name, street, city, and state before it can go to Samsara. Nothing was sent.",
  missing_coordinates: "No pin on this location. Add coordinates before syncing. Nothing was sent.",
  tag_scope:
    "Samsara returned Not Found. Tag-scoped tokens need tagIds on the address. The location is still saved.",
  request_failed: "Samsara address sync failed. The location is still saved.",
};

const SETUP_REASONS = new Set<SamsaraAddressFailureReason>(["token_missing", "scopes_insufficient"]);

export function samsaraAddressFailure(
  reason: SamsaraAddressFailureReason,
  status?: number,
): SamsaraAddressFailure {
  const message =
    reason === "scopes_insufficient" && (status === 401 || status === 403)
      ? `Samsara rejected the token (HTTP ${status}). Add ${SAMSARA_ADDRESS_SCOPES}, then try again.`
      : SAMSARA_ADDRESS_MESSAGES[reason];
  return {
    ok: false,
    reason,
    message,
    setupBlocker: SETUP_REASONS.has(reason),
  };
}

export function samsaraAddressTransportFailure(error: unknown): SamsaraAddressFailure {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (/abort|timeout/i.test(`${name} ${message}`)) {
    return {
      ok: false,
      reason: "request_failed",
      message: "Samsara request timed out. The location is still saved.",
      setupBlocker: false,
    };
  }
  return samsaraAddressFailure("request_failed");
}

/**
 * MSE address-book tag. Not a secret.
 * Used when `SAMSARA_ADDRESS_TAG_IDS` is unset so office creates work without extra config.
 */
export const SAMSARA_ADDRESS_TAG_ID_DEFAULT = "4456991";

const SAMSARA_ADDRESS_TAG_IDS_ENV = "SAMSARA_ADDRESS_TAG_IDS";

/** Comma-separated tag ids. Blank, `undefined`, and `null` fall back to the MSE tag. */
export function samsaraAddressTagIds(raw?: string | null): string[] {
  const text = String(raw ?? "").trim();
  const lowered = text.toLowerCase();
  const source = !text || lowered === "undefined" || lowered === "null" ? SAMSARA_ADDRESS_TAG_ID_DEFAULT : text;
  const ids: string[] = [];
  for (const part of source.split(",")) {
    const id = part.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.length ? ids : [SAMSARA_ADDRESS_TAG_ID_DEFAULT];
}

function addressTagEnvValue(): string | undefined {
  const env = process.env;
  const raw = env[SAMSARA_ADDRESS_TAG_IDS_ENV];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * HTTP 404 whose body is only "Not Found".
 * Tag-scoped tokens return this for an untagged address create. Write Addresses can still be on.
 */
export function isGenericAddressNotFound(status: number, body: unknown, text: string): boolean {
  if (status !== 404) return false;
  const fromBody = readErrorMessage(body);
  const candidate = (fromBody || text).trim().replace(/\s+/g, " ");
  return /^(?:404 )?not found\.?$/i.test(candidate);
}

function readErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** TMS location id is the external id. Repeats (same DC name, another dock) stay separate rows. */
export function locationExternalId(locationId: number): string {
  return String(locationId);
}

export function samsaraAddressLookupPath(locationId: number): string {
  return `/addresses/${SAMSARA_ADDRESS_EXTERNAL_KEY}:${locationExternalId(locationId)}`;
}

/** Routing can prefer this over a one-off stop when the location has been mirrored. */
export function samsaraAddressIdForRouting(
  location: { samsara_address_id?: string | null } | null | undefined,
): string | null {
  const id = String(location?.samsara_address_id ?? "").trim();
  return id || null;
}

export function storedPin(latitude: number | null, longitude: number | null): { latitude: number; longitude: number } | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function buildSamsaraAddressPayload(
  location: SamsaraAddressSource,
  tagIds?: readonly string[] | null,
): { ok: true; body: SamsaraAddressWrite } | { ok: false; reason: "incomplete_address" | "missing_coordinates" } {
  const name = location.name.trim();
  const street = location.street.trim();
  const city = location.city.trim();
  const state = location.state.trim();
  if (!name || !street || !city || !state) {
    return { ok: false, reason: "incomplete_address" };
  }
  const pin = storedPin(location.latitude, location.longitude);
  if (!pin) return { ok: false, reason: "missing_coordinates" };
  const formattedAddress = formatLocationAddress({
    street,
    city,
    state,
    zip: location.zip ?? "",
  }).trim();
  if (!formattedAddress || !formattedAddress.includes(street)) {
    return { ok: false, reason: "incomplete_address" };
  }
  const notes = String(location.scheduling_notes ?? "").trim().slice(0, SAMSARA_ADDRESS_NOTES_MAX);
  const resolvedTags = samsaraAddressTagIds(
    tagIds && tagIds.length ? tagIds.join(",") : addressTagEnvValue(),
  );
  const body: SamsaraAddressWrite = {
    name: name.slice(0, SAMSARA_ADDRESS_NAME_MAX),
    formattedAddress: formattedAddress.slice(0, SAMSARA_ADDRESS_FORMATTED_MAX),
    latitude: pin.latitude,
    longitude: pin.longitude,
    geofence: {
      circle: {
        latitude: pin.latitude,
        longitude: pin.longitude,
        radiusMeters: SAMSARA_ADDRESS_RADIUS_METERS,
      },
    },
    externalIds: {
      [SAMSARA_ADDRESS_EXTERNAL_KEY]: locationExternalId(location.id),
    },
    tagIds: resolvedTags,
  };
  if (notes) body.notes = notes;
  return { ok: true, body };
}

function addressRow(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  const row = data && typeof data === "object" ? data : body;
  return row as Record<string, unknown>;
}

export function addressIdFromBody(body: unknown): string {
  const row = addressRow(body);
  const id = row?.id;
  if (typeof id === "string" || typeof id === "number") return String(id).trim();
  return "";
}

export function externalIdFromAddressBody(body: unknown, key = SAMSARA_ADDRESS_EXTERNAL_KEY): string {
  const row = addressRow(body);
  const ids = row?.externalIds;
  if (!ids || typeof ids !== "object") return "";
  const value = (ids as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}
