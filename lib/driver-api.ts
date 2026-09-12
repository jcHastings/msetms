import { createHash, randomBytes } from "node:crypto";
import { runWithAuditActor } from "./audit";
import { getDb } from "./db";
import {
  DriverOpsError,
  performDriverProgress,
  performDriverStopCheck,
  performDriverUpload,
  requireAssignedLoad,
} from "./driver-ops";
import { listAttachments } from "./files";
import { fromOfficeDateTime, isAppointmentSchedule, isFcfsSchedule } from "./format";
import { isCustomerRateDocument } from "./load-documents-shared";
import { publicLoginFailureDetail, recordLoginAttempt } from "./login-audit";
import { authenticateDriver, getDriver, isDriverLoginEligible, listDriversForLogin, listLoadsForDriver } from "./queries";
import { relayForDriver } from "./relay-store";
import { formatRelayLane } from "./relays";
import { ensureDefaultStops, type LoadStop } from "./stops";
import {
  ATTACHMENT_KINDS,
  DRIVER_PROGRESS,
  isClosedStatus,
  isDriverProgress,
  type Attachment,
  type AttachmentKind,
  type DriverProgress,
  type DriverWithTruck,
  type LoadView,
} from "./types";

export const DRIVER_API_BASE = "/api/driver/v1";
export const DRIVER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DRIVER_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const DRIVER_LOGIN_MAX_FAILURES = 5;
export const DRIVER_ROSTER_WINDOW_MS = 15 * 60 * 1000;
export const DRIVER_ROSTER_MAX_HITS = 60;
const IDEMPOTENCY_PENDING = 0;
const IDEMPOTENCY_WAIT_MS = 15;
const IDEMPOTENCY_WAIT_TRIES = 40;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const CLIENT_REQUEST_ID_MAX = 128;

export type DriverApiCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED";

export type DriverApiErrorBody = { ok: false; error: string; code?: DriverApiCode };

export type DriverApiDriver = {
  id: number;
  display_name: string;
  first_name: string;
  phone: string;
};

export type DriverApiRosterEntry = { id: number; display_name: string };

export type DriverApiScheduleType = "APPT" | "FCFS";

export type DriverApiNextActions = {
  allowed_progress: DriverProgress[];
  can_check_stops: boolean;
};

export type DriverApiRelayLeg = {
  pickup: string;
  delivery: string;
  lane: string;
};

export type DriverApiLoadSummary = {
  id: number;
  load_number: string;
  status: string;
  driver_progress: DriverProgress | "";
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  customer_name: string;
  commodity: string;
  weight: number | null;
  trailer_number: string;
  truck_unit: string | null;
  docs_requested: boolean;
  special_instructions: string;
  appointment_notes: string;
  public_notes: string;
  relay_leg: DriverApiRelayLeg | null;
  next_actions: DriverApiNextActions;
};

export type DriverApiStop = {
  id: number;
  kind: "pickup" | "delivery";
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  window_start: string;
  window_end: string;
  schedule_type: DriverApiScheduleType | "";
  confirmation: string;
  cargo: string;
  reference: string;
  instructions: string;
  notes: string;
  arrived_at: string;
  departed_at: string;
  delivered: number;
};

export const DRIVER_API_ATTACHMENT_KINDS = ATTACHMENT_KINDS.map((item) => item.value);

export type DriverApiAttachment = {
  id: number;
  kind: AttachmentKind;
  original_name: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
};

export type DriverApiLoadDetail = DriverApiLoadSummary & {
  stops: DriverApiStop[];
  attachments: DriverApiAttachment[];
};

export class DriverApiHttpError extends Error {
  readonly status: number;
  readonly code?: DriverApiCode;

  constructor(status: number, message: string, code?: DriverApiCode) {
    super(message);
    this.name = "DriverApiHttpError";
    this.status = status;
    this.code = code;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** ISO-8601 with timezone (Z or ±HH:MM). Empty stays empty. Naive values use office wall time. */
export function toDriverApiDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (HAS_TIMEZONE.test(raw)) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? "" : dated.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    try {
      return fromOfficeDateTime(`${raw}T00:00:00`);
    } catch {
      return "";
    }
  }
  const local = raw.includes("T") ? raw : raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(local)) {
    try {
      return fromOfficeDateTime(local.length === 16 ? `${local}:00` : local);
    } catch {
      // fall through
    }
  }
  const dated = new Date(raw);
  return Number.isNaN(dated.getTime()) ? "" : dated.toISOString();
}

export function isDriverApiUploadKind(value: string): value is AttachmentKind {
  return ATTACHMENT_KINDS.some((item) => item.value === value) && !isCustomerRateDocument({ kind: value });
}

function parseId(value: string | undefined): number {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (forwarded) return forwarded.slice(0, 80);
  return (request.headers.get("x-real-ip") ?? request.headers.get("cf-connecting-ip") ?? "").trim().slice(0, 80);
}

function requestUserAgent(request: Request): string {
  return (request.headers.get("user-agent") ?? "").trim().slice(0, 240);
}

function requestPath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

export function driverDisplayName(driver: { name: string }): string {
  return String(driver.name ?? "").trim();
}

export function driverFirstName(driver: { name: string }): string {
  return driverDisplayName(driver).split(/\s+/)[0] ?? "";
}

export function toDriverApiDriver(driver: DriverWithTruck): DriverApiDriver {
  return {
    id: driver.id,
    display_name: driverDisplayName(driver),
    first_name: driverFirstName(driver),
    phone: String(driver.cell_phone || driver.phone || "").trim(),
  };
}

export function mapScheduleType(value?: string | null): DriverApiScheduleType | "" {
  if (isAppointmentSchedule(value)) return "APPT";
  if (isFcfsSchedule(value)) return "FCFS";
  return "";
}

export function allowedDriverProgress(
  current: string | null | undefined,
  status: string,
): DriverProgress[] {
  if (isClosedStatus(status)) return [];
  const order = DRIVER_PROGRESS.map((item) => item.value);
  if (!current || !isDriverProgress(current)) return [order[0]];
  const index = order.indexOf(current);
  if (index < 0 || index >= order.length - 1) return [];
  return [order[index + 1]];
}

export function canCheckStops(status: string): boolean {
  return !isClosedStatus(status);
}

function toLoadSummary(load: LoadView, driverId: number): DriverApiLoadSummary {
  const relay = relayForDriver(load.id, driverId);
  return {
    id: load.id,
    load_number: load.load_number,
    status: load.status,
    driver_progress: isDriverProgress(load.driver_progress) ? load.driver_progress : "",
    origin: load.origin,
    destination: load.destination,
    pickup_start: toDriverApiDateTime(load.pickup_start),
    pickup_end: toDriverApiDateTime(load.pickup_end),
    delivery_start: toDriverApiDateTime(load.delivery_start),
    delivery_end: toDriverApiDateTime(load.delivery_end),
    customer_name: load.customer_name,
    commodity: load.commodity,
    weight: load.weight,
    trailer_number: load.trailer_number || load.trailer_unit || "",
    truck_unit: load.truck_unit,
    docs_requested: Boolean(load.docs_requested),
    special_instructions: load.special_instructions,
    appointment_notes: load.appointment_notes,
    public_notes: load.public_notes,
    relay_leg: relay
      ? { pickup: relay.pickup, delivery: relay.delivery, lane: formatRelayLane(relay.pickup, relay.delivery) }
      : null,
    next_actions: {
      allowed_progress: allowedDriverProgress(load.driver_progress, load.status),
      can_check_stops: canCheckStops(load.status),
    },
  };
}

function toStopDto(stop: LoadStop): DriverApiStop {
  return {
    id: stop.id,
    kind: stop.kind,
    name: stop.name,
    street: stop.street,
    city: stop.city,
    state: stop.state,
    zip: stop.zip,
    phone: stop.phone,
    window_start: toDriverApiDateTime(stop.window_start),
    window_end: toDriverApiDateTime(stop.window_end),
    schedule_type: mapScheduleType(stop.schedule_type),
    confirmation: stop.confirmation,
    cargo: stop.cargo,
    reference: stop.reference,
    instructions: stop.instructions,
    notes: stop.notes,
    arrived_at: toDriverApiDateTime(stop.arrived_at),
    departed_at: toDriverApiDateTime(stop.departed_at),
    delivered: stop.delivered,
  };
}

function toAttachmentDto(file: Attachment): DriverApiAttachment {
  return {
    id: file.id,
    kind: file.kind,
    original_name: file.original_name,
    mime_type: file.mime_type,
    uploaded_by: file.uploaded_by,
    created_at: toDriverApiDateTime(file.created_at),
  };
}

function toLoadDetail(load: LoadView, driverId: number): DriverApiLoadDetail {
  const attachments = listAttachments(load.id)
    .filter((file) => !isCustomerRateDocument(file))
    .filter((file) => file.kind !== "rate_con" && file.kind !== "invoice")
    .map(toAttachmentDto);
  return {
    ...toLoadSummary(load, driverId),
    stops: ensureDefaultStops(load.id).map(toStopDto),
    attachments,
  };
}

export function driverApiError(status: number, error: string, code?: DriverApiCode): Response {
  const body: DriverApiErrorBody = { ok: false, error, code };
  return Response.json(body, { status });
}

function fromOpsError(error: unknown): Response {
  if (error instanceof DriverApiHttpError) {
    return driverApiError(error.status, error.message, error.code);
  }
  if (error instanceof DriverOpsError) {
    if (error.kind === "forbidden") return driverApiError(403, error.message, "FORBIDDEN");
    if (error.kind === "not_found") return driverApiError(404, error.message, "NOT_FOUND");
    return driverApiError(409, error.message, "CONFLICT");
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message === "Load not found." || message === "Stop is missing." || message === "Stop not found.") {
      return driverApiError(404, message, "NOT_FOUND");
    }
    if (message === "This load is not on your dispatch.") {
      return driverApiError(403, message, "FORBIDDEN");
    }
    if (message === "This load was cancelled." || message === "Check out of pickup first." || message === "Check in first.") {
      return driverApiError(409, message, "CONFLICT");
    }
    return driverApiError(409, message, "CONFLICT");
  }
  return driverApiError(409, "Something went wrong.", "CONFLICT");
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? "";
}

export function issueDriverApiToken(driverId: number): { token: string; expiresAt: string } {
  const token = `drv_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + DRIVER_TOKEN_TTL_MS).toISOString();
  const createdAt = nowIso();
  getDb().transaction(() => {
    getDb()
      .prepare(
        `UPDATE driver_api_tokens
         SET revoked_at = ?
         WHERE driver_id = ? AND revoked_at = ''`,
      )
      .run(createdAt, driverId);
    getDb()
      .prepare(
        `INSERT INTO driver_api_tokens (driver_id, token_hash, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, '', ?)`,
      )
      .run(driverId, sha256Hex(token), expiresAt, createdAt);
  })();
  return { token, expiresAt };
}

export function revokeDriverApiToken(token: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE driver_api_tokens
       SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at = ''`,
    )
    .run(nowIso(), sha256Hex(token));
  return result.changes > 0;
}

export function driverFromApiToken(token: string): DriverWithTruck | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT driver_id, expires_at, revoked_at
       FROM driver_api_tokens
       WHERE token_hash = ?`,
    )
    .get(sha256Hex(token)) as { driver_id: number; expires_at: string; revoked_at: string } | undefined;
  if (!row || row.revoked_at.trim()) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  const driver = getDriver(row.driver_id);
  if (!driver || !isDriverLoginEligible(driver)) return null;
  return driver;
}

export function requireDriverApiAuth(request: Request): DriverWithTruck {
  const token = bearerToken(request);
  if (!token) {
    throw new DriverApiHttpError(401, "Sign in with your PIN.", "UNAUTHORIZED");
  }
  const driver = driverFromApiToken(token);
  if (!driver) {
    throw new DriverApiHttpError(401, "Sign in with your PIN.", "UNAUTHORIZED");
  }
  return driver;
}

function readClientRequestId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!id || id.length > CLIENT_REQUEST_ID_MAX) {
    throw new DriverApiHttpError(409, "client_request_id is required.", "CONFLICT");
  }
  return id;
}

type StoredIdempotency = { status: number; body: string };

type IdempotencyKey = {
  driverId: number;
  method: string;
  path: string;
  clientRequestId: string;
};

function idempotencyKey(driverId: number, request: Request, clientRequestId: string): IdempotencyKey {
  return {
    driverId,
    method: request.method.toUpperCase(),
    path: requestPath(request),
    clientRequestId,
  };
}

function readIdempotency(key: IdempotencyKey): StoredIdempotency | null {
  return (
    (getDb()
      .prepare(
        `SELECT status, body FROM driver_api_idempotency
         WHERE driver_id = ? AND method = ? AND path = ? AND client_request_id = ?`,
      )
      .get(key.driverId, key.method, key.path, key.clientRequestId) as StoredIdempotency | undefined) ?? null
  );
}

type IdempotencyClaim = { kind: "claimed" } | { kind: "stored"; stored: StoredIdempotency } | { kind: "pending" };

function claimIdempotency(key: IdempotencyKey): IdempotencyClaim {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO driver_api_idempotency
          (driver_id, method, path, client_request_id, status, body, created_at)
         VALUES (?, ?, ?, ?, ?, '', ?)`,
      )
      .run(key.driverId, key.method, key.path, key.clientRequestId, IDEMPOTENCY_PENDING, nowIso());
    if (inserted.changes === 1) {
      db.exec("COMMIT");
      return { kind: "claimed" };
    }
    const row = readIdempotency(key);
    db.exec("COMMIT");
    if (row && row.status >= 100) return { kind: "stored", stored: row };
    return { kind: "pending" };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // connection already aborted
    }
    throw error;
  }
}

function completeIdempotency(key: IdempotencyKey, status: number, body: unknown): void {
  getDb()
    .prepare(
      `UPDATE driver_api_idempotency
       SET status = ?, body = ?
       WHERE driver_id = ? AND method = ? AND path = ? AND client_request_id = ?`,
    )
    .run(status, JSON.stringify(body), key.driverId, key.method, key.path, key.clientRequestId);
}

function releaseIdempotency(key: IdempotencyKey): void {
  getDb()
    .prepare(
      `DELETE FROM driver_api_idempotency
       WHERE driver_id = ? AND method = ? AND path = ? AND client_request_id = ? AND status = ?`,
    )
    .run(key.driverId, key.method, key.path, key.clientRequestId, IDEMPOTENCY_PENDING);
}

function replayResponse(stored: StoredIdempotency): Response {
  return new Response(stored.body, {
    status: stored.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withIdempotency(
  request: Request,
  driver: DriverWithTruck,
  clientRequestId: string,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const key = idempotencyKey(driver.id, request, clientRequestId);
  for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_TRIES; attempt += 1) {
    const claim = claimIdempotency(key);
    if (claim.kind === "stored") return replayResponse(claim.stored);
    if (claim.kind === "pending") {
      await sleep(IDEMPOTENCY_WAIT_MS);
      continue;
    }
    try {
      const result = await run();
      completeIdempotency(key, result.status, result.body);
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      releaseIdempotency(key);
      throw error;
    }
  }
  throw new DriverApiHttpError(409, "That request is still in progress.", "CONFLICT");
}

function loginFailureCount(driverId: number | null, ip: string): number {
  const since = new Date(Date.now() - DRIVER_LOGIN_WINDOW_MS).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM login_audit
       WHERE kind = 'driver'
         AND outcome = 'failure'
         AND created_at >= ?
         AND (
           (? IS NOT NULL AND user_id = ?)
           OR (? != '' AND ip_address = ?)
         )`,
    )
    .get(since, driverId, driverId, ip, ip) as { count: number };
  return row.count;
}

function assertLoginNotRateLimited(driverId: number | null, ip: string): void {
  if (loginFailureCount(driverId, ip) >= DRIVER_LOGIN_MAX_FAILURES) {
    throw new DriverApiHttpError(429, "Too many sign-in attempts. Try again later.", "RATE_LIMITED");
  }
}

function rosterHitCount(ip: string): number {
  const since = new Date(Date.now() - DRIVER_ROSTER_WINDOW_MS).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM driver_api_rate_hits
       WHERE kind = 'roster' AND ip_address = ? AND created_at >= ?`,
    )
    .get(ip, since) as { count: number };
  return row.count;
}

function assertRosterNotRateLimited(ip: string): void {
  if (!ip) return;
  getDb()
    .prepare("DELETE FROM driver_api_rate_hits WHERE kind = 'roster' AND created_at < ?")
    .run(new Date(Date.now() - DRIVER_ROSTER_WINDOW_MS).toISOString());
  if (rosterHitCount(ip) >= DRIVER_ROSTER_MAX_HITS) {
    throw new DriverApiHttpError(429, "Too many roster requests. Try again later.", "RATE_LIMITED");
  }
  getDb()
    .prepare("INSERT INTO driver_api_rate_hits (kind, ip_address, created_at) VALUES ('roster', ?, ?)")
    .run(ip, nowIso());
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new DriverApiHttpError(409, "Request body is missing.", "CONFLICT");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DriverApiHttpError) throw error;
    throw new DriverApiHttpError(409, "Request body is missing.", "CONFLICT");
  }
}

export async function handleDriverRoster(request: Request): Promise<Response> {
  try {
    assertRosterNotRateLimited(requestIp(request));
    const roster: DriverApiRosterEntry[] = listDriversForLogin().map((driver) => ({
      id: driver.id,
      display_name: driverDisplayName(driver),
    }));
    return Response.json(roster);
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverLogin(request: Request): Promise<Response> {
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);
  let driverId = 0;
  try {
    const body = await readJsonBody(request);
    driverId = Number(body.driver_id);
    if (!Number.isFinite(driverId) || driverId <= 0) {
      driverId = 0;
    }
    assertLoginNotRateLimited(driverId || null, ip);
    const pin = String(body.pin ?? "").trim();
    if (!driverId || !pin) {
      throw new DriverApiHttpError(401, "Driver or PIN is not recognized.", "UNAUTHORIZED");
    }
    const driver = authenticateDriver(driverId, pin);
    recordLoginAttempt({
      kind: "driver",
      outcome: "success",
      step: "pin",
      userId: driver.id,
      ipAddress: ip,
      userAgent,
    });
    const issued = issueDriverApiToken(driver.id);
    return Response.json({
      token: issued.token,
      expires_at: toDriverApiDateTime(issued.expiresAt),
      driver: toDriverApiDriver(driver),
    });
  } catch (error) {
    if (error instanceof DriverApiHttpError && error.status === 429) {
      return fromOpsError(error);
    }
    const detail = publicLoginFailureDetail(error);
    recordLoginAttempt({
      kind: "driver",
      outcome: "failure",
      step: "pin",
      userId: driverId || null,
      ipAddress: ip,
      userAgent,
      detail,
    });
    if (error instanceof DriverApiHttpError && error.status === 401) {
      return fromOpsError(error);
    }
    return driverApiError(401, "Driver or PIN is not recognized.", "UNAUTHORIZED");
  }
}

export async function handleDriverLogout(request: Request): Promise<Response> {
  try {
    requireDriverApiAuth(request);
    const token = bearerToken(request);
    revokeDriverApiToken(token);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverMe(request: Request): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    return Response.json(toDriverApiDriver(driver));
  } catch (error) {
    return fromOpsError(error);
  }
}

function scopedLoads(driverId: number, scope: string): LoadView[] {
  const loads = listLoadsForDriver(driverId);
  if (scope === "recent") {
    return loads.filter((load) => load.status === "delivered" || load.status === "completed");
  }
  if (scope === "active" || !scope) {
    return loads.filter((load) => !isClosedStatus(load.status));
  }
  throw new DriverApiHttpError(409, "scope must be active or recent.", "CONFLICT");
}

export async function handleDriverLoads(request: Request): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const scope = new URL(request.url).searchParams.get("scope")?.trim() || "active";
    return Response.json(scopedLoads(driver.id, scope).map((load) => toLoadSummary(load, driver.id)));
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverLoadDetail(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const loadId = parseId((await params).id);
    if (!loadId) return driverApiError(404, "Load not found.", "NOT_FOUND");
    const load = requireAssignedLoad(loadId, driver.id, { allowCancelled: true });
    return Response.json(toLoadDetail(load, driver.id));
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverProgress(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const loadId = parseId((await params).id);
    if (!loadId) return driverApiError(404, "Load not found.", "NOT_FOUND");
    const body = await readJsonBody(request);
    const clientRequestId = readClientRequestId(body.client_request_id);
    return await withIdempotency(request, driver, clientRequestId, async () => {
      return runWithAuditActor({ name: driver.name, kind: "driver" }, async () => {
        const load = requireAssignedLoad(loadId, driver.id);
        const progress = String(body.progress ?? "").trim();
        if (!isDriverProgress(progress)) {
          throw new DriverApiHttpError(409, "Pick a status.", "CONFLICT");
        }
        const current = isDriverProgress(load.driver_progress) ? load.driver_progress : "";
        if (progress !== current) {
          const allowed = allowedDriverProgress(current, load.status);
          if (!allowed.includes(progress)) {
            throw new DriverApiHttpError(409, "That status is not the next step.", "CONFLICT");
          }
          await performDriverProgress({ driver, loadId, progress });
        }
        const next = requireAssignedLoad(loadId, driver.id, { allowCancelled: true });
        return { status: 200, body: { load: toLoadSummary(next, driver.id) } };
      });
    });
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverStopCheck(
  request: Request,
  params: Promise<{ id: string; stopId: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const resolved = await params;
    const loadId = parseId(resolved.id);
    const stopId = parseId(resolved.stopId);
    if (!loadId) return driverApiError(404, "Load not found.", "NOT_FOUND");
    if (!stopId) return driverApiError(404, "Stop is missing.", "NOT_FOUND");
    const body = await readJsonBody(request);
    const clientRequestId = readClientRequestId(body.client_request_id);
    return await withIdempotency(request, driver, clientRequestId, async () => {
      return runWithAuditActor({ name: driver.name, kind: "driver" }, async () => {
        performDriverStopCheck({
          driver,
          loadId,
          stopId,
          kind: String(body.kind ?? "").trim(),
        });
        const next = requireAssignedLoad(loadId, driver.id, { allowCancelled: true });
        return { status: 200, body: { load: toLoadSummary(next, driver.id) } };
      });
    });
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverAttachment(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const loadId = parseId((await params).id);
    if (!loadId) return driverApiError(404, "Load not found.", "NOT_FOUND");
    const form = await request.formData();
    const clientRequestId = readClientRequestId(form.get("client_request_id"));
    const kind = String(form.get("kind") ?? "").trim();
    const file = form.get("file");
    if (!isDriverApiUploadKind(kind)) {
      throw new DriverApiHttpError(409, "Pick a document type.", "CONFLICT");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new DriverApiHttpError(409, "Choose a photo or PDF.", "CONFLICT");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new DriverApiHttpError(409, "File is too large.", "CONFLICT");
    }
    return await withIdempotency(request, driver, clientRequestId, async () => {
      return runWithAuditActor({ name: driver.name, kind: "driver" }, async () => {
        const uploaded = await performDriverUpload({ driver, loadId, kind, file, allowKinds: "api" });
        const next = requireAssignedLoad(loadId, driver.id, { allowCancelled: true });
        return {
          status: 200,
          body: {
            attachment: toAttachmentDto(uploaded.attachment),
            load: toLoadSummary(next, driver.id),
          },
        };
      });
    });
  } catch (error) {
    return fromOpsError(error);
  }
}

export const FORBIDDEN_DRIVER_API_FIELDS = [
  "rate",
  "oo_pay",
  "oo_percent",
  "qbo_invoice_id",
  "qbo_invoice_number",
  "tms_invoice_number",
  "customer_reference",
  "reference_number",
  "pin",
] as const;
