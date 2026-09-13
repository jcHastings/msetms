import { createHash, randomBytes } from "node:crypto";
import { runWithAuditActor } from "./audit";
import { getDb } from "./db";
import { driverAssignedTrailerLocation } from "./driver-trailer";
import {
  DriverOpsError,
  performDriverProgress,
  performDriverStopCheck,
  performDriverUpload,
  requireAssignedLoad,
} from "./driver-ops";
import { fileToBuffer, isPdfOrImage, listAttachments, saveOrphanFuelReceiptFile } from "./files";
import { autoMatchPendingFuelReceipts } from "./fuel-receipt-match";
import {
  addFuelReceipt,
  getFuelReceipt,
  linkFuelReceipt,
  listDriverFuelReceipts,
  receiptIdForTransaction,
  type FuelReceipt,
  type FuelReceiptStatus,
} from "./fuel-receipts";
import { getFuelTransaction, listFuelTransactions } from "./fuel-store";
import type { FuelTransactionView } from "./fuel";
import { fromOfficeDateTime, isAppointmentSchedule, isFcfsSchedule } from "./format";
import { isCustomerRateDocument } from "./load-documents-shared";
import { publicLoginFailureDetail, recordLoginAttempt } from "./login-audit";
import { DRIVER_PASSWORD_NOT_RECOGNIZED, findDriverIdByLoginEmail } from "./driver-password";
import { authenticateDriverByEmail, getDriver, isDriverLoginEligible, listLoadsForDriver } from "./queries";
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
/** Orphan pending claims (status=0) older than this are deleted so a retry can proceed. */
export const DRIVER_API_IDEMPOTENCY_PENDING_TTL_MS = 45_000;
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

/** Full TMS AttachmentKind values (response `kind`). Includes office-only kinds that never upload. */
export const DRIVER_API_ATTACHMENT_KINDS = ATTACHMENT_KINDS.map((item) => item.value);

/** Native API upload allowlist: full TMS minus customer rate_con / invoice. */
export const DRIVER_API_UPLOAD_KINDS = DRIVER_API_ATTACHMENT_KINDS.filter(
  (kind) => !isCustomerRateDocument({ kind }),
);

export type DriverApiFuelTransaction = {
  id: number;
  occurred_at: string;
  location: string;
  gallons: number | null;
  amount: number | null;
  card_last4: string;
  category: string;
  unit_number: string;
  receipt_id: number | null;
};

export type DriverApiFuelReceipt = {
  id: number;
  status: FuelReceiptStatus;
  occurred_at: string;
  gallons: number | null;
  amount: number | null;
  merchant: string;
  card_last4: string;
  original_name: string;
  fuel_transaction_id: number | null;
  created_at: string;
};

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
  return DRIVER_API_UPLOAD_KINDS.includes(value as AttachmentKind);
}

function trustForwardedClientIp(): boolean {
  const raw = String(process.env.TRUSTED_PROXY ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "cloudflare";
}

/**
 * Client IP for roster/login rate limits.
 * Always uses CF-Connecting-IP (Cloudflare Tunnel staging).
 * X-Forwarded-For / X-Real-IP only when TRUSTED_PROXY is set — spoofable otherwise.
 * Empty IP skips the limit (direct Node / no edge).
 */
export function driverApiRequestIp(request: Request): string {
  const cf = (request.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf.slice(0, 80);
  if (trustForwardedClientIp()) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (forwarded) return forwarded.slice(0, 80);
    const real = (request.headers.get("x-real-ip") ?? "").trim();
    if (real) return real.slice(0, 80);
  }
  return "";
}

function parseId(value: string | undefined): number {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function requestIp(request: Request): string {
  return driverApiRequestIp(request);
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
    throw new DriverApiHttpError(401, "Sign in with your email and password.", "UNAUTHORIZED");
  }
  const driver = driverFromApiToken(token);
  if (!driver) {
    throw new DriverApiHttpError(401, "Sign in with your email and password.", "UNAUTHORIZED");
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

type StoredIdempotency = { status: number; body: string; created_at: string };

function isStalePending(row: StoredIdempotency): boolean {
  if (row.status !== IDEMPOTENCY_PENDING) return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && Date.now() - created >= DRIVER_API_IDEMPOTENCY_PENDING_TTL_MS;
}

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
        `SELECT status, body, created_at FROM driver_api_idempotency
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
    if (row && row.status >= 100) {
      db.exec("COMMIT");
      return { kind: "stored", stored: row };
    }
    if (row && isStalePending(row)) {
      db.prepare(
        `DELETE FROM driver_api_idempotency
         WHERE driver_id = ? AND method = ? AND path = ? AND client_request_id = ? AND status = ?`,
      ).run(key.driverId, key.method, key.path, key.clientRequestId, IDEMPOTENCY_PENDING);
      db.prepare(
        `INSERT INTO driver_api_idempotency
          (driver_id, method, path, client_request_id, status, body, created_at)
         VALUES (?, ?, ?, ?, ?, '', ?)`,
      ).run(key.driverId, key.method, key.path, key.clientRequestId, IDEMPOTENCY_PENDING, nowIso());
      db.exec("COMMIT");
      return { kind: "claimed" };
    }
    db.exec("COMMIT");
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

export async function handleDriverRoster(): Promise<Response> {
  return driverApiError(404, "Not found.", "NOT_FOUND");
}

export async function handleDriverLogin(request: Request): Promise<Response> {
  const ip = requestIp(request);
  const userAgent = requestUserAgent(request);
  let driverId = 0;
  try {
    const body = await readJsonBody(request);
    if (body.driver_id != null || body.pin != null || body.name_or_email != null || body.name != null) {
      throw new DriverApiHttpError(409, "Use email and password.", "CONFLICT");
    }
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    driverId = findDriverIdByLoginEmail(email) ?? 0;
    assertLoginNotRateLimited(driverId || null, ip);
    if (!email || !password) {
      throw new DriverApiHttpError(401, DRIVER_PASSWORD_NOT_RECOGNIZED, "UNAUTHORIZED");
    }
    const driver = authenticateDriverByEmail(email, password);
    recordLoginAttempt({
      kind: "driver",
      outcome: "success",
      step: "password",
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
    if (error instanceof DriverApiHttpError && error.status === 409) {
      return fromOpsError(error);
    }
    const detail = publicLoginFailureDetail(error);
    recordLoginAttempt({
      kind: "driver",
      outcome: "failure",
      step: "password",
      userId: driverId || null,
      ipAddress: ip,
      userAgent,
      detail,
    });
    if (error instanceof DriverApiHttpError && error.status === 401) {
      return fromOpsError(error);
    }
    return driverApiError(401, DRIVER_PASSWORD_NOT_RECOGNIZED, "UNAUTHORIZED");
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
  const normalized = scope === "delivered" ? "recent" : scope;
  if (normalized === "recent") {
    return loads.filter((load) => load.status === "delivered" || load.status === "completed");
  }
  if (normalized === "active" || !normalized) {
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

export type DriverApiTrailerLocation = {
  trailer_id: number;
  unit_number: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  recorded_at: string;
  source: "orbcomm" | "stored" | null;
  heading_deg: number | null;
  speed_mph: number | null;
  point: { lat: number; lng: number } | null;
};

export async function handleDriverLoadTrailer(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const loadId = parseId((await params).id);
    if (!loadId) return driverApiError(404, "Load not found.", "NOT_FOUND");
    const load = requireAssignedLoad(loadId, driver.id, { allowCancelled: true });
    const location = await driverAssignedTrailerLocation(load);
    if (!location) return driverApiError(404, "Trailer not found.", "NOT_FOUND");
    const body: DriverApiTrailerLocation = {
      trailer_id: location.trailerId,
      unit_number: location.unitNumber,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      recorded_at: toDriverApiDateTime(location.recordedAt),
      source: location.source,
      heading_deg: location.headingDeg,
      speed_mph: location.speedMph,
      point: location.point,
    };
    return Response.json(body);
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

function toFuelTransactionDto(row: FuelTransactionView): DriverApiFuelTransaction {
  return {
    id: row.id,
    occurred_at: toDriverApiDateTime(row.occurred_at),
    location: row.location,
    gallons: row.gallons,
    amount: row.amount,
    card_last4: row.card_last4,
    category: row.category,
    unit_number: row.unit_number,
    receipt_id: receiptIdForTransaction(row.id),
  };
}

function toFuelReceiptDto(row: FuelReceipt): DriverApiFuelReceipt {
  return {
    id: row.id,
    status: row.status,
    occurred_at: toDriverApiDateTime(row.occurred_at),
    gallons: row.gallons,
    amount: row.amount,
    merchant: row.merchant || row.station,
    card_last4: row.card_last4,
    original_name: row.original_name,
    fuel_transaction_id: row.fuel_transaction_id,
    created_at: toDriverApiDateTime(row.created_at),
  };
}

function requireOwnFuelTransaction(driverId: number, id: number): FuelTransactionView {
  if (!id) throw new DriverApiHttpError(404, "Fuel transaction not found.", "NOT_FOUND");
  const row = getFuelTransaction(id);
  if (!row) throw new DriverApiHttpError(404, "Fuel transaction not found.", "NOT_FOUND");
  if (row.driver_id !== driverId) {
    throw new DriverApiHttpError(403, "This fuel row is not on your card.", "FORBIDDEN");
  }
  return row;
}

function requireOwnFuelReceipt(driverId: number, id: number): FuelReceipt {
  if (!id) throw new DriverApiHttpError(404, "Fuel receipt not found.", "NOT_FOUND");
  const row = getFuelReceipt(id);
  if (!row) throw new DriverApiHttpError(404, "Fuel receipt not found.", "NOT_FOUND");
  if (row.driver_id !== driverId) {
    throw new DriverApiHttpError(403, "This receipt is not yours.", "FORBIDDEN");
  }
  return row;
}

function requireUploadFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File) || file.size === 0) {
    throw new DriverApiHttpError(409, "Choose a photo or PDF.", "CONFLICT");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new DriverApiHttpError(409, "File is too large.", "CONFLICT");
  }
  if (!isPdfOrImage(file)) {
    throw new DriverApiHttpError(409, "Choose a photo or PDF.", "CONFLICT");
  }
  return file;
}

function optionalFormNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalFormText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function storeFuelReceiptUpload(file: File) {
  const saved = saveOrphanFuelReceiptFile({
    originalName: file.name,
    buffer: await fileToBuffer(file),
    mimeType: file.type,
  });
  return saved;
}

export async function handleDriverFuelTransactions(request: Request): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    return Response.json(listFuelTransactions({ driverId: driver.id }).map(toFuelTransactionDto));
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverFuelTransactionDetail(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const row = requireOwnFuelTransaction(driver.id, parseId((await params).id));
    return Response.json(toFuelTransactionDto(row));
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverFuelTransactionReceipt(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const transaction = requireOwnFuelTransaction(driver.id, parseId((await params).id));
    const form = await request.formData();
    const clientRequestId = readClientRequestId(form.get("client_request_id"));
    const file = requireUploadFile(form.get("file"));
    return await withIdempotency(request, driver, clientRequestId, async () => {
      const existing = receiptIdForTransaction(transaction.id);
      if (existing) {
        const receipt = getFuelReceipt(existing);
        if (receipt) return { status: 200, body: { receipt: toFuelReceiptDto(receipt) } };
      }
      const saved = await storeFuelReceiptUpload(file);
      const receiptId = addFuelReceipt({
        loadId: transaction.load_id,
        driverId: driver.id,
        attachmentId: null,
        fuelTransactionId: transaction.id,
        occurredAt: optionalFormText(form.get("occurred_at")) || transaction.occurred_at,
        gallons: optionalFormNumber(form.get("gallons")) ?? transaction.gallons,
        amount: optionalFormNumber(form.get("amount")) ?? transaction.amount,
        station: optionalFormText(form.get("merchant")) || optionalFormText(form.get("station")) || transaction.location,
        merchant: optionalFormText(form.get("merchant")) || transaction.location,
        cardLast4: optionalFormText(form.get("card_last4")) || transaction.card_last4,
        status: "matched",
        storedName: saved.storedName,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
      });
      return { status: 200, body: { receipt: toFuelReceiptDto(getFuelReceipt(receiptId)!) } };
    });
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverFuelReceipts(request: Request): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    if (request.method === "GET") {
      const status = new URL(request.url).searchParams.get("status")?.trim() ?? "";
      if (status && status !== "pending_match" && status !== "matched") {
        throw new DriverApiHttpError(409, "status must be pending_match or matched.", "CONFLICT");
      }
      const rows = listDriverFuelReceipts(driver.id, status ? (status as FuelReceiptStatus) : undefined);
      return Response.json(rows.map(toFuelReceiptDto));
    }

    const form = await request.formData();
    const clientRequestId = readClientRequestId(form.get("client_request_id"));
    const file = requireUploadFile(form.get("file"));
    return await withIdempotency(request, driver, clientRequestId, async () => {
      const saved = await storeFuelReceiptUpload(file);
      const receiptId = addFuelReceipt({
        loadId: null,
        driverId: driver.id,
        attachmentId: null,
        occurredAt: optionalFormText(form.get("occurred_at")) || nowIso(),
        gallons: optionalFormNumber(form.get("gallons")),
        amount: optionalFormNumber(form.get("amount")),
        station: optionalFormText(form.get("station")) || optionalFormText(form.get("merchant")),
        merchant: optionalFormText(form.get("merchant")) || optionalFormText(form.get("station")),
        cardLast4: optionalFormText(form.get("card_last4")),
        status: "pending_match",
        storedName: saved.storedName,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
      });
      autoMatchPendingFuelReceipts();
      return { status: 200, body: { receipt: toFuelReceiptDto(getFuelReceipt(receiptId)!) } };
    });
  } catch (error) {
    return fromOpsError(error);
  }
}

export async function handleDriverFuelReceiptMatch(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<Response> {
  try {
    const driver = requireDriverApiAuth(request);
    const receipt = requireOwnFuelReceipt(driver.id, parseId((await params).id));
    const body = await readJsonBody(request);
    const clientRequestId = readClientRequestId(body.client_request_id);
    return await withIdempotency(request, driver, clientRequestId, async () => {
      const transactionId = Number.parseInt(String(body.fuel_transaction_id ?? ""), 10);
      const transaction = requireOwnFuelTransaction(driver.id, transactionId);
      linkFuelReceipt(receipt.id, transaction.id);
      const next = getFuelReceipt(receipt.id);
      return { status: 200, body: { receipt: toFuelReceiptDto(next!) } };
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
