import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";
import {
  getSamsaraApiToken,
  getSamsaraWebhookPublicUrl,
  getSamsaraWebhookSecret,
  loadRuntimeEnv,
} from "../env";
import { formatDateTime } from "../format";
import { getLoad, getTruck } from "../queries";
import { listStops, type LoadStop } from "../stops";
import { ACTIVE_LOAD_STATUSES } from "../types";

/**
 * Samsara Event Subscriptions into the Exception Inbox.
 * Tractor routes and GPS only. Trailer and reefer stay with Orbcomm.
 * Token scopes: Webhooks Read, Webhooks Write, Read Routes, Read Defects.
 * Arrival and departure fill a blank stop time. They do not start a second detention clock.
 */

export const SAMSARA_WEBHOOK_PATH = "/api/integrations/samsara/webhook";

export const SAMSARA_WEBHOOK_EVENT_TYPES = [
  "RouteStopArrival",
  "RouteStopDeparture",
  "RouteStopEtaUpdated",
  "GeofenceEntry",
  "GeofenceExit",
  "DvirSubmitted",
] as const;

export type SamsaraWebhookEventType = (typeof SAMSARA_WEBHOOK_EVENT_TYPES)[number];

/** Official Samsara token scopes for this feed. Routes and Defects are the existing ones. */
export const SAMSARA_WEBHOOK_SCOPES = [
  "Webhooks Read",
  "Webhooks Write",
  "Read Routes",
  "Read Defects",
] as const;

export const SAMSARA_WEBHOOK_SECRET_MISSING =
  "Webhook secret not set. Add SAMSARA_WEBHOOK_SECRET. Event ignored.";
export const SAMSARA_WEBHOOK_BAD_SIGNATURE = "Bad webhook signature. Event ignored.";
export const SAMSARA_WEBHOOK_UNMAPPED = "No load for this Samsara event.";
export const SAMSARA_WEBHOOK_TRAILER = "Trailer event ignored. Orbcomm covers the trailer.";
export const SAMSARA_WEBHOOK_SCOPES_MISSING =
  "Webhooks scope missing. Token needs Webhooks Read and Webhooks Write.";
export const SAMSARA_WEBHOOK_URL_MISSING =
  "Set SAMSARA_WEBHOOK_PUBLIC_URL to the https webhook address.";
export const SAMSARA_WEBHOOK_TOKEN_MISSING = "Samsara is not connected.";

const SAMSARA_BASE = "https://api.samsara.com";
const DEDUP_MS = 45 * 60 * 1000;
const MAX_BODY_CHARS = 500_000;

const EVENT_ALIASES: Record<string, SamsaraWebhookEventType> = {
  routestoparrival: "RouteStopArrival",
  routestopdeparture: "RouteStopDeparture",
  routestopetaupdated: "RouteStopEtaUpdated",
  geofenceentry: "GeofenceEntry",
  geofenceexit: "GeofenceExit",
  dvirsubmitted: "DvirSubmitted",
};

export type SamsaraWebhookIngestResult = {
  ok: true;
  accepted: boolean;
  reason: string;
  eventId: string;
  eventType: string;
  loadId: number | null;
  truckId: number | null;
  message: string;
};

export type SamsaraInboxFlag = {
  loadId: number;
  eventId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  detail: string;
};

export type SamsaraDvirFlag = {
  eventId: string;
  eventTime: string;
  title: string;
  detail: string;
  loadId: number | null;
  loadNumber: string;
  truckId: number | null;
  unitNumber: string;
};

export type SamsaraWebhookRegisterResult = {
  ok: boolean;
  reason: "created" | "already" | "token_missing" | "public_url_missing" | "scopes" | "samsara_down";
  message: string;
  webhookId: string;
  /** Present only on create. Put it in SAMSARA_WEBHOOK_SECRET. Never stored here. */
  secretKey: string;
};

type StoredEvent = {
  eventId: string;
  eventType: string;
  eventTime: string;
  vehicleId: string;
  routeExternalId: string;
  loadId: number | null;
  truckId: number | null;
  stopId: number | null;
  outcome: string;
  inbox: boolean;
  severity: SamsaraInboxFlag["severity"] | "";
  title: string;
  detail: string;
};

export function canonicalSamsaraWebhookEventType(value: string): SamsaraWebhookEventType | null {
  return EVENT_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function samsaraWebhookSignature(secretB64: string, timestamp: string, rawBody: string): string {
  const key = Buffer.from(secretB64.trim(), "base64");
  const hex = createHmac("sha256", key).update(`v1:${timestamp}:${rawBody}`, "utf8").digest("hex");
  return `v1=${hex}`;
}

export function samsaraWebhookSignaturesMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided.trim());
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function listSamsaraInboxFlags(loadId?: number): SamsaraInboxFlag[] {
  const params: number[] = [];
  let where = "WHERE inbox = 1 AND load_id IS NOT NULL";
  if (loadId != null) {
    where += " AND load_id = ?";
    params.push(loadId);
  }
  const rows = getDb()
    .prepare(
      `SELECT load_id, event_id, severity, title, detail
       FROM samsara_webhook_events
       ${where}
       ORDER BY event_time DESC, id DESC`,
    )
    .all(...params) as Array<{
    load_id: number;
    event_id: string;
    severity: string;
    title: string;
    detail: string;
  }>;
  const out: SamsaraInboxFlag[] = [];
  for (const row of rows) {
    const severity = asSeverity(row.severity);
    if (!severity) continue;
    out.push({
      loadId: row.load_id,
      eventId: row.event_id,
      severity,
      title: row.title,
      detail: row.detail,
    });
  }
  return out;
}

export function listSamsaraDvirFlags(limit = 8): SamsaraDvirFlag[] {
  const rows = getDb()
    .prepare(
      `SELECT event_id, event_time, title, detail, load_id, truck_id
       FROM samsara_webhook_events
       WHERE event_type = 'DvirSubmitted' AND (inbox = 1 OR title = 'DVIR defects')
       ORDER BY event_time DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    event_id: string;
    event_time: string;
    title: string;
    detail: string;
    load_id: number | null;
    truck_id: number | null;
  }>;
  return rows.map((row) => {
    const truck = row.truck_id ? getTruck(row.truck_id) : null;
    const load = row.load_id ? getLoad(row.load_id) : null;
    return {
      eventId: row.event_id,
      eventTime: row.event_time,
      title: row.title,
      detail: row.detail,
      loadId: row.load_id,
      loadNumber: load?.load_number ?? "",
      truckId: row.truck_id,
      unitNumber: truck?.unit_number ?? "",
    };
  });
}

export async function ingestSamsaraWebhook(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
  eventTypeHeader?: string;
  secret?: string | null;
}): Promise<SamsaraWebhookIngestResult> {
  await loadRuntimeEnv();
  const secret = input.secret === undefined ? (getSamsaraWebhookSecret() ?? "") : (input.secret ?? "");
  if (!secret.trim()) return reject("secret_missing", SAMSARA_WEBHOOK_SECRET_MISSING);
  if (input.rawBody.length > MAX_BODY_CHARS) return reject("parse_error", "Webhook body is too large. Event ignored.");
  const expected = samsaraWebhookSignature(secret, input.timestamp.trim(), input.rawBody);
  if (!input.timestamp.trim() || !samsaraWebhookSignaturesMatch(expected, input.signature)) {
    return reject("bad_signature", SAMSARA_WEBHOOK_BAD_SIGNATURE);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.rawBody) as unknown;
    if (!isRecord(parsed)) return reject("parse_error", "Webhook body is not an event. Event ignored.");
    body = parsed;
  } catch {
    return reject("parse_error", "Webhook body is not JSON. Event ignored.");
  }

  const eventId = textOf(body.eventId);
  const rawType = textOf(body.eventType) || textOf(input.eventTypeHeader);
  if (rawType.toLowerCase() === "ping") {
    return {
      ok: true,
      accepted: true,
      reason: "ping",
      eventId,
      eventType: "Ping",
      loadId: null,
      truckId: null,
      message: "Ping received.",
    };
  }

  const eventType =
    canonicalSamsaraWebhookEventType(textOf(body.eventType)) ??
    canonicalSamsaraWebhookEventType(textOf(input.eventTypeHeader));
  if (!eventId) return reject("parse_error", "Webhook has no event id. Event ignored.");
  if (existingEvent(eventId)) {
    return {
      ok: true,
      accepted: false,
      reason: "duplicate",
      eventId,
      eventType: eventType ?? rawType,
      loadId: null,
      truckId: null,
      message: "Duplicate Samsara event. Already on file.",
    };
  }
  if (!eventType) {
    saveEvent({
      eventId,
      eventType: rawType || "unknown",
      eventTime: isoFromUnknown(body.eventTime) || isoFromUnknown(body.eventMs),
      vehicleId: "",
      routeExternalId: "",
      loadId: null,
      truckId: null,
      stopId: null,
      outcome: "ignored_type",
      inbox: false,
      severity: "",
      title: "",
      detail: "Event type is not on the tractor list.",
    });
    return {
      ok: true,
      accepted: false,
      reason: "ignored_type",
      eventId,
      eventType: rawType,
      loadId: null,
      truckId: null,
      message: "Event type is not on the tractor list.",
    };
  }

  const data = isRecord(body.data) ? body.data : isRecord(body.event) ? body.event : body;
  const stored = await applyTractorEvent(body, data, eventId, eventType);
  saveEvent(stored);
  return {
    ok: true,
    accepted: stored.outcome === "enriched" || stored.outcome === "flagged" || stored.outcome === "noted",
    reason: stored.outcome,
    eventId,
    eventType,
    loadId: stored.loadId,
    truckId: stored.truckId,
    message: stored.detail || stored.title || stored.outcome,
  };
}

export async function registerSamsaraEventSubscription(options?: {
  token?: string | null;
  publicUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<SamsaraWebhookRegisterResult> {
  await loadRuntimeEnv();
  const token = options?.token === undefined ? (getSamsaraApiToken() ?? "") : (options.token ?? "");
  const publicUrl = (options?.publicUrl === undefined ? (getSamsaraWebhookPublicUrl() ?? "") : (options.publicUrl ?? "")).trim();
  if (!token.trim()) {
    return {
      ok: false,
      reason: "token_missing",
      message: SAMSARA_WEBHOOK_TOKEN_MISSING,
      webhookId: "",
      secretKey: "",
    };
  }
  if (!publicUrl.startsWith("https://")) {
    return {
      ok: false,
      reason: "public_url_missing",
      message: SAMSARA_WEBHOOK_URL_MISSING,
      webhookId: "",
      secretKey: "",
    };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  let listed: Response;
  try {
    listed = await fetchImpl(new URL("/webhooks", SAMSARA_BASE), {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch {
    return down();
  }
  if (listed.status === 401 || listed.status === 403) return scopesMissing();
  if (!listed.ok) return down();

  let listedBody: unknown = null;
  try {
    listedBody = await listed.json();
  } catch {
    listedBody = null;
  }
  const existing = findWebhookByUrl(listedBody, publicUrl);
  if (existing) {
    return {
      ok: true,
      reason: "already",
      message: "Webhook already points at this URL.",
      webhookId: existing,
      secretKey: "",
    };
  }

  let created: Response;
  try {
    created = await fetchImpl(new URL("/webhooks", SAMSARA_BASE), {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        name: "msetms exception inbox",
        url: publicUrl,
        eventTypes: [...SAMSARA_WEBHOOK_EVENT_TYPES],
      }),
    });
  } catch {
    return down();
  }
  if (created.status === 401 || created.status === 403) return scopesMissing();
  if (!created.ok) return down();
  let createdBody: unknown = null;
  try {
    createdBody = await created.json();
  } catch {
    createdBody = null;
  }
  const record = unwrapData(createdBody);
  return {
    ok: true,
    reason: "created",
    message: "Webhook created. Copy the secret into SAMSARA_WEBHOOK_SECRET.",
    webhookId: textOf(record?.id),
    secretKey: textOf(record?.secretKey) || textOf(record?.secret),
  };
}

async function applyTractorEvent(
  body: Record<string, unknown>,
  data: Record<string, unknown>,
  eventId: string,
  eventType: SamsaraWebhookEventType,
): Promise<StoredEvent> {
  const vehicleId = vehicleIdOf(data);
  const truck = vehicleId ? findTruck(vehicleId) : null;
  const externalIds = collectExternalIds(data);
  const routeExternalId = externalIds[0] ?? textOf(child(data.route, "name"));
  const eventTime =
    eventInstant(body, data, eventType) || new Date().toISOString();
  const base: StoredEvent = {
    eventId,
    eventType,
    eventTime,
    vehicleId,
    routeExternalId,
    loadId: null,
    truckId: truck && truck.matched === "vehicle" ? truck.id : null,
    stopId: null,
    outcome: "unmapped",
    inbox: false,
    severity: "",
    title: "",
    detail: SAMSARA_WEBHOOK_UNMAPPED,
  };

  if (isTrailerOnly(data, truck)) {
    return { ...base, truckId: null, outcome: "ignored_trailer", detail: SAMSARA_WEBHOOK_TRAILER };
  }

  if (eventType === "DvirSubmitted") {
    return applyDvir(base, data, truck);
  }

  const loadId = resolveLoadId(externalIds, truck);
  if (!loadId) return base;
  const load = getLoad(loadId);
  if (!load) return base;
  const stops = listStops(loadId);
  const stop = pickStop(stops, data);
  const unit = truck?.unitNumber || (load.truck_id ? getTruck(load.truck_id)?.unit_number : "") || "";
  const when = clockLabel(eventTime);
  const linked = `Event ${eventId}. ${when}.${unit ? ` Truck ${unit}.` : ""}`;

  if (eventType === "RouteStopEtaUpdated") {
    const eta = etaInstant(data) || eventTime;
    const endRaw = stop?.window_end || (stop?.kind === "pickup" ? load.pickup_end : load.delivery_end);
    const end = new Date(endRaw);
    const etaDate = new Date(eta);
    const past = !Number.isNaN(end.getTime()) && !Number.isNaN(etaDate.getTime()) && etaDate.getTime() > end.getTime();
    if (!past) {
      return {
        ...base,
        loadId,
        stopId: stop?.id ?? null,
        outcome: "noted",
        detail: `ETA still inside the window. ${linked}`,
      };
    }
    return {
      ...base,
      loadId,
      stopId: stop?.id ?? null,
      outcome: "flagged",
      inbox: true,
      severity: "HIGH",
      title: "Samsara ETA past window",
      detail: `ETA ${clockLabel(eta)}. Window ended ${clockLabel(endRaw)}. Detention clock unchanged. ${linked}`,
    };
  }

  const field = eventType === "RouteStopDeparture" || eventType === "GeofenceExit" ? "departed_at" : "arrived_at";
  const title =
    eventType === "RouteStopArrival"
      ? "Samsara stop arrival"
      : eventType === "RouteStopDeparture"
        ? "Samsara stop departure"
        : eventType === "GeofenceEntry"
          ? "Samsara geofence entry"
          : "Samsara geofence exit";

  if (stop && String(stop[field] ?? "").trim()) {
    return {
      ...base,
      loadId,
      stopId: stop.id,
      outcome: "enriched",
      detail: `Stop already has a ${field === "arrived_at" ? "arrival" : "departure"}. No second clock. ${linked}`,
    };
  }
  if (!stop && hasRecentStamp(loadId, eventTime, field)) {
    return {
      ...base,
      loadId,
      outcome: "enriched",
      detail: `Tractor GPS already has this ${field === "arrived_at" ? "arrival" : "departure"}. No second clock. ${linked}`,
    };
  }

  let stamped = false;
  if (stop) {
    stamped = stampIfEmpty(stop.id, field, eventTime);
    if (stamped) {
      const { applyWorkflowAfterGeofence } = await import("../workflow");
      applyWorkflowAfterGeofence(loadId);
    }
  }
  if (stamped) {
    return {
      ...base,
      loadId,
      stopId: stop?.id ?? null,
      outcome: "enriched",
      inbox: true,
      severity: "LOW",
      title,
      detail: `Stamped on the stop. Detention uses that time. ${linked}`,
    };
  }
  return {
    ...base,
    loadId,
    stopId: stop?.id ?? null,
    outcome: "flagged",
    inbox: true,
    severity: "LOW",
    title,
    detail: `No stop match. Detention clock unchanged. ${linked}`,
  };
}

function applyDvir(
  base: StoredEvent,
  data: Record<string, unknown>,
  truck: TruckHit | null,
): StoredEvent {
  const dvir = dvirView(data);
  if (dvir.trailerOnly) {
    return { ...base, outcome: "ignored_trailer", detail: SAMSARA_WEBHOOK_TRAILER };
  }
  const loadId = truck && truck.matched === "vehicle" ? activeLoadIdForTruck(truck.id) : null;
  const when = clockLabel(base.eventTime);
  const unit = truck?.unitNumber ? ` Truck ${truck.unitNumber}.` : "";
  const linked = `Event ${base.eventId}. ${when}.${unit}`;
  if (!dvir.unsafe) {
    return {
      ...base,
      loadId,
      outcome: "noted",
      detail: `DVIR clean.${unit} ${linked}`.trim(),
    };
  }
  const defect = dvir.text || "Unsafe DVIR. No defect lines in the payload.";
  if (!loadId) {
    return {
      ...base,
      outcome: "unmapped",
      inbox: false,
      severity: "HIGH",
      title: "DVIR defects",
      detail: `${defect} ${SAMSARA_WEBHOOK_UNMAPPED} ${linked}`,
    };
  }
  return {
    ...base,
    loadId,
    outcome: "flagged",
    inbox: true,
    severity: "HIGH",
    title: "DVIR defects",
    detail: `${defect} ${linked}`,
  };
}

function reject(reason: string, message: string): SamsaraWebhookIngestResult {
  return {
    ok: true,
    accepted: false,
    reason,
    eventId: "",
    eventType: "",
    loadId: null,
    truckId: null,
    message,
  };
}

function scopesMissing(): SamsaraWebhookRegisterResult {
  return {
    ok: false,
    reason: "scopes",
    message: SAMSARA_WEBHOOK_SCOPES_MISSING,
    webhookId: "",
    secretKey: "",
  };
}

function down(): SamsaraWebhookRegisterResult {
  return {
    ok: false,
    reason: "samsara_down",
    message: "Samsara webhooks did not answer. Try again.",
    webhookId: "",
    secretKey: "",
  };
}

function saveEvent(row: StoredEvent): void {
  getDb()
    .prepare(
      `INSERT INTO samsara_webhook_events (
        event_id, event_type, event_time, vehicle_id, route_external_id,
        load_id, truck_id, stop_id, outcome, inbox, severity, title, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.eventId,
      row.eventType,
      row.eventTime,
      row.vehicleId,
      row.routeExternalId,
      row.loadId,
      row.truckId,
      row.stopId,
      row.outcome,
      row.inbox ? 1 : 0,
      row.severity,
      row.title,
      row.detail,
      new Date().toISOString(),
    );
}

function existingEvent(eventId: string): boolean {
  const row = getDb().prepare("SELECT 1 AS ok FROM samsara_webhook_events WHERE event_id = ?").get(eventId) as
    | { ok: number }
    | undefined;
  return Boolean(row);
}

type TruckHit = {
  id: number;
  unitNumber: string;
  matched: "vehicle" | "trailer";
};

function findTruck(vehicleId: string): TruckHit | null {
  const key = vehicleId.trim().toLowerCase();
  if (!key) return null;
  const rows = getDb()
    .prepare(
      `SELECT id, unit_number, samsara_vehicle_id, samsara_trailer_id
       FROM trucks
       WHERE lower(samsara_vehicle_id) = ? OR lower(samsara_trailer_id) = ?`,
    )
    .all(key, key) as Array<{
    id: number;
    unit_number: string;
    samsara_vehicle_id: string;
    samsara_trailer_id: string;
  }>;
  const vehicle = rows.find((row) => row.samsara_vehicle_id.trim().toLowerCase() === key);
  if (vehicle) return { id: vehicle.id, unitNumber: vehicle.unit_number, matched: "vehicle" };
  const trailer = rows.find((row) => row.samsara_trailer_id.trim().toLowerCase() === key);
  if (trailer) return { id: trailer.id, unitNumber: trailer.unit_number, matched: "trailer" };
  return null;
}

function resolveLoadId(externalIds: string[], truck: TruckHit | null): number | null {
  for (const raw of externalIds) {
    const id = raw.trim();
    if (id.length < 3 || id.length > 64) continue;
    const row = getDb()
      .prepare(
        `SELECT id, status FROM loads
         WHERE load_number = ? OR reference_number = ? OR customer_reference = ? OR po_number = ?
         ORDER BY CASE WHEN load_number = ? THEN 0 ELSE 1 END, id DESC
         LIMIT 1`,
      )
      .get(id, id, id, id, id) as { id: number; status: string } | undefined;
    if (row && row.status !== "cancelled") return row.id;
  }
  if (truck && truck.matched === "vehicle") return activeLoadIdForTruck(truck.id);
  return null;
}

function activeLoadIdForTruck(truckId: number): number | null {
  const placeholders = ACTIVE_LOAD_STATUSES.map(() => "?").join(", ");
  const row = getDb()
    .prepare(
      `SELECT id FROM loads
       WHERE truck_id = ? AND status IN (${placeholders})
       ORDER BY CASE status
         WHEN 'in_transit' THEN 0
         WHEN 'dispatched' THEN 1
         WHEN 'at_pickup' THEN 2
         WHEN 'assigned' THEN 3
         ELSE 4
       END, updated_at DESC
       LIMIT 1`,
    )
    .get(truckId, ...ACTIVE_LOAD_STATUSES) as { id: number } | undefined;
  return row?.id ?? null;
}

function pickStop(stops: LoadStop[], data: Record<string, unknown>): LoadStop | null {
  if (stops.length === 0) return null;
  const refs = new Set(collectExternalIds(data).map((item) => item.trim().toLowerCase()));
  const byRef = stops.filter((stop) => stop.reference.trim() && refs.has(stop.reference.trim().toLowerCase()));
  if (byRef.length === 1) return byRef[0];
  const sequence = stopSequence(data);
  if (sequence != null) {
    const bySeq = stops.find((stop) => stop.sequence === sequence);
    if (bySeq) return bySeq;
  }
  const address = addressName(data);
  const byAddress = matchByAddress(stops, address);
  if (byAddress) return byAddress;
  if (stops.length === 1) return stops[0];
  return null;
}

function matchByAddress(stops: LoadStop[], address: string): LoadStop | null {
  const needle = address.trim().toLowerCase();
  if (needle.length < 4) return null;
  const hits = stops.filter((stop) => {
    const name = stop.name.trim().toLowerCase();
    const city = stop.city.trim().toLowerCase();
    const state = stop.state.trim().toLowerCase();
    if (name.length >= 4 && (needle.includes(name) || name.includes(needle))) return true;
    if (city.length >= 4 && state && needle.includes(city) && needle.includes(state)) return true;
    return false;
  });
  return hits.length === 1 ? hits[0] : null;
}

function hasRecentStamp(loadId: number, iso: string, field: "arrived_at" | "departed_at"): boolean {
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return false;
  return listStops(loadId).some((stop) => {
    const raw = String(stop[field] ?? "").trim();
    const at = new Date(raw).getTime();
    if (!raw || Number.isNaN(at)) return false;
    return Math.abs(at - when) <= DEDUP_MS;
  });
}

function stampIfEmpty(stopId: number, field: "arrived_at" | "departed_at", iso: string): boolean {
  if (!iso) return false;
  const result = getDb()
    .prepare(`UPDATE load_stops SET ${field} = ? WHERE id = ? AND ${field} = ''`)
    .run(iso, stopId);
  return result.changes > 0;
}

function isTrailerOnly(data: Record<string, unknown>, truck: TruckHit | null): boolean {
  if (truck?.matched === "vehicle") return false;
  if (truck?.matched === "trailer") return true;
  const blobs = [data, data.vehicle, data.device, data.asset].filter(isRecord);
  for (const blob of blobs) {
    const kind = textOf(blob.assetType, blob.vehicleType, blob.type).toLowerCase();
    if (kind === "trailer" || kind === "unpowered" || kind === "unpoweredasset" || kind === "reefer") return true;
  }
  const dvir = isRecord(data.dvir) ? data.dvir : null;
  if (dvir) {
    const vehicle = idOf(dvir.vehicle);
    const trailer = idOf(dvir.trailer);
    if (trailer && !vehicle && !idOf(data.vehicle)) return true;
  }
  if (!idOf(data.vehicle) && !idOf(data.device) && (data.trailer || data.trailerId)) return true;
  return false;
}

function dvirView(data: Record<string, unknown>): { trailerOnly: boolean; unsafe: boolean; text: string } {
  const dvir = isRecord(data.dvir) ? data.dvir : data;
  const vehicleLines = defectLines(dvir.vehicleDefects ?? child(dvir.vehicle, "defects"));
  const trailerLines = defectLines(dvir.trailerDefects ?? child(dvir.trailer, "defects"));
  const genericLines = defectLines(dvir.defects);
  const vehicleId = idOf(dvir.vehicle) || idOf(data.vehicle);
  const trailerId = idOf(dvir.trailer) || textOf(data.trailerId);
  const status = textOf(dvir.safetyStatus, dvir.safety_status).toLowerCase();
  if (!vehicleId && trailerId && vehicleLines.length === 0) {
    return { trailerOnly: true, unsafe: false, text: "" };
  }
  if (!vehicleId && trailerLines.length > 0 && vehicleLines.length === 0 && genericLines.length === 0) {
    return { trailerOnly: true, unsafe: false, text: "" };
  }
  const tractorLines = vehicleLines.length ? vehicleLines : genericLines;
  const unsafe = status === "unsafe" || status === "unsatisfactory" || tractorLines.length > 0;
  return { trailerOnly: false, unsafe, text: tractorLines.join(". ") };
}

function defectLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      lines.push(item.trim());
      continue;
    }
    if (!isRecord(item)) continue;
    const label = textOf(item.defectType, item.type, item.name, item.comment);
    const comment = textOf(item.comment);
    if (!label) continue;
    lines.push(comment && comment !== label ? `${label}: ${comment}` : label);
  }
  return lines;
}

function vehicleIdOf(data: Record<string, unknown>): string {
  return (
    idOf(data.vehicle) ||
    idOf(data.device) ||
    idOf(child(data.route, "vehicle")) ||
    idOf(child(data.dvir, "vehicle")) ||
    textOf(data.vehicleId)
  );
}

function eventInstant(
  body: Record<string, unknown>,
  data: Record<string, unknown>,
  eventType: SamsaraWebhookEventType,
): string {
  const details = isRecord(data.routeStopDetails) ? data.routeStopDetails : isRecord(data.routeStop) ? data.routeStop : null;
  const preferred: unknown[] = [];
  if (eventType === "RouteStopArrival" || eventType === "GeofenceEntry") {
    preferred.push(details?.actualArrivalTime, data.actualArrivalTime, data.entryTime, data.time);
  } else if (eventType === "RouteStopDeparture" || eventType === "GeofenceExit") {
    preferred.push(details?.actualDepartureTime, data.actualDepartureTime, data.exitTime, data.time);
  } else if (eventType === "DvirSubmitted") {
    preferred.push(child(data.dvir, "endTime"), child(data.dvir, "startTime"), data.time);
  }
  for (const item of preferred) {
    const iso = isoFromUnknown(item);
    if (iso) return iso;
  }
  return isoFromUnknown(body.eventTime) || isoFromUnknown(body.eventMs);
}

function etaInstant(data: Record<string, unknown>): string {
  const details = isRecord(data.routeStopDetails) ? data.routeStopDetails : null;
  return (
    isoFromUnknown(data.eta) ||
    isoFromUnknown(data.estimatedArrivalTime) ||
    isoFromUnknown(details?.eta) ||
    isoFromUnknown(details?.estimatedArrivalTime) ||
    ""
  );
}

function stopSequence(data: Record<string, unknown>): number | null {
  const details = isRecord(data.routeStopDetails) ? data.routeStopDetails : null;
  const stop = isRecord(data.routeStop) ? data.routeStop : isRecord(data.stop) ? data.stop : null;
  for (const value of [details?.sequence, stop?.sequence, data.stopSequence, data.sequence, data.stopIndex]) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0 && number < 40) return number;
  }
  return null;
}

function addressName(data: Record<string, unknown>): string {
  const address = isRecord(data.address) ? data.address : isRecord(data.geofence) ? data.geofence : null;
  return textOf(address?.name, address?.formattedAddress, data.addressName);
}

function collectExternalIds(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || !isRecord(value) && !Array.isArray(value)) return out;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) collectExternalIds(item, depth + 1, out);
    return out;
  }
  for (const [key, childValue] of Object.entries(value)) {
    if (key === "externalIds" || key === "externalId" || key === "external_ids") {
      if (typeof childValue === "string" || typeof childValue === "number") out.push(String(childValue));
      else if (isRecord(childValue)) {
        for (const item of Object.values(childValue)) {
          if (typeof item === "string" || typeof item === "number") out.push(String(item));
        }
      }
    } else if (isRecord(childValue) || Array.isArray(childValue)) {
      collectExternalIds(childValue, depth + 1, out);
    }
  }
  return out;
}

function clockLabel(iso: string): string {
  const raw = iso.trim();
  if (!raw) return "time missing";
  const label = formatDateTime(raw);
  if (!label || label === "—" || label === "-") return raw;
  return label;
}

function asSeverity(value: string): SamsaraInboxFlag["severity"] | null {
  if (value === "CRITICAL" || value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return null;
}

function findWebhookByUrl(body: unknown, publicUrl: string): string {
  const data = unwrapData(body);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((body as { data?: unknown } | null)?.data)
      ? ((body as { data: unknown[] }).data)
      : [];
  const want = publicUrl.replace(/\/$/, "");
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const url = textOf(row.url).replace(/\/$/, "");
    if (url && url === want) return textOf(row.id);
  }
  return "";
}

function unwrapData(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.data) && !Array.isArray(body.data)) return body.data;
  return body;
}

function idOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!isRecord(value)) return "";
  return textOf(value.id, value.vehicleId);
}

function isoFromUnknown(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (isRecord(value)) {
    for (const key of ["time", "dateTime", "date", "ms", "eventTime", "estimatedArrivalTime"]) {
      const found = isoFromUnknown(value[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function child(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function textOf(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
