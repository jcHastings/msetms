import { randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";
import {
  getGustoApiVersion,
  getGustoClientId,
  getGustoClientSecret,
  getGustoEnv,
  getGustoRedirectUri,
  isGustoOAuthReady,
} from "../env";
import { listDrivers } from "../queries";
import {
  GUSTO_PAYSTUB_PDF_REQUIRES_EMBEDDED,
  grantedScopeIsReadOnly,
  gustoApiBase,
  gustoAuthorizeUrl,
  isAllowedGustoReadPath,
  isGustoTokenUrl,
  parseCompanyName,
  parseContractorPayLines,
  parseEmployeePayLines,
  parseGustoContractors,
  parseGustoEmployees,
  parsePayrollIds,
  parseTokenCompanyUuid,
  planGustoMatches,
  type GustoPayDraft,
  type GustoPerson,
} from "./gusto-read";

export type GustoPublicStatus = {
  configured: boolean;
  env: "demo" | "production";
  connected: boolean;
  companyName: string;
  companyUuid: string;
  grantedScope: string;
  scopeReadOnly: boolean;
  paystubPdfRequiresEmbedded: true;
  connectedAt: string;
  lastSyncAt: string;
  lastSyncError: string;
  lastSyncSummary: string;
};

export type GustoPayLine = {
  id: number;
  driver_id: number;
  source: string;
  gusto_external_id: string;
  gusto_person_uuid: string;
  pay_period_start: string;
  pay_period_end: string;
  check_date: string;
  gross_pay: string;
  net_pay: string;
};

export type GustoLinkRow = {
  driver_id: number;
  gusto_uuid: string;
  kind: string;
  match_source: string;
  name: string;
  email: string;
};

type ConnectionRow = {
  company_uuid: string;
  company_name: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  granted_scope: string;
  connected_at: string;
  last_sync_at: string;
  last_sync_error: string;
  last_sync_summary: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

const FETCH_TIMEOUT_MS = 20_000;
let gustoFetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);
let refreshQueue: Promise<void> = Promise.resolve();

export function setGustoFetchForTests(impl: typeof fetch | null): void {
  gustoFetchImpl = impl ?? globalThis.fetch.bind(globalThis);
}

export function createGustoOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function gustoOAuthStatesMatch(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildGustoAuthorizeUrl(state: string): string {
  const clientId = getGustoClientId();
  if (!clientId) throw new Error("Gusto is not configured.");
  return gustoAuthorizeUrl({
    env: getGustoEnv(),
    clientId,
    redirectUri: getGustoRedirectUri(),
    state,
  });
}

export function getGustoPublicStatus(): GustoPublicStatus {
  const row = readConnection();
  const grantedScope = row?.granted_scope ?? "";
  return {
    configured: isGustoOAuthReady(),
    env: getGustoEnv(),
    connected: Boolean(row?.refresh_token),
    companyName: row?.company_name ?? "",
    companyUuid: row?.company_uuid ?? "",
    grantedScope,
    scopeReadOnly: grantedScopeIsReadOnly(grantedScope),
    paystubPdfRequiresEmbedded: GUSTO_PAYSTUB_PDF_REQUIRES_EMBEDDED,
    connectedAt: row?.connected_at ?? "",
    lastSyncAt: row?.last_sync_at ?? "",
    lastSyncError: row?.last_sync_error ?? "",
    lastSyncSummary: row?.last_sync_summary ?? "",
  };
}

export class GustoStateError extends Error {
  constructor(message = "Gusto sign-in state did not match. Start Connect again.") {
    super(message);
    this.name = "GustoStateError";
  }
}

export async function finishGustoOAuth(input: {
  expectedState: string | undefined;
  actualState: string | undefined;
  code: string;
}): Promise<void> {
  if (!gustoOAuthStatesMatch(input.expectedState, input.actualState)) {
    throw new GustoStateError();
  }
  if (!input.code.trim()) throw new Error("Gusto did not return an authorization code.");
  const tokens = await postToken({
    grant_type: "authorization_code",
    code: input.code.trim(),
    redirect_uri: getGustoRedirectUri(),
  });
  saveTokens(tokens, { companyUuid: "", companyName: "" });
  try {
    await refreshCompanyIdentity();
  } catch (error) {
    recordSyncError(safeMessage(error));
  }
}

export async function disconnectGusto(): Promise<void> {
  getDb().prepare("DELETE FROM gusto_connection WHERE id = 1").run();
}

export async function syncGusto(): Promise<{ lines: number; linked: number }> {
  const status = getGustoPublicStatus();
  if (!status.connected) throw new Error("Gusto is not connected.");
  const companyUuid = await ensureCompanyUuid();
  const notes: string[] = [];
  const employees = parseGustoEmployees(await gustoGetAll(`/v1/companies/${companyUuid}/employees`));
  const contractors = await loadContractors(companyUuid, notes);
  replacePeople([...employees, ...contractors.people]);
  const linked = applyAutoMatches();
  const employeeToDriver = linkMap("employee");
  const contractorToDriver = linkMap("contractor");
  const drafts: GustoPayDraft[] = [];
  const payrollIds = await listProcessedPayrollIds(companyUuid);
  for (const payrollId of payrollIds) {
    const payroll = await gustoGetJson(`/v1/companies/${companyUuid}/payrolls/${payrollId}`);
    drafts.push(...parseEmployeePayLines(payroll, employeeToDriver));
  }
  const payments = await loadContractorPayments(companyUuid, notes);
  if (payments) drafts.push(...parseContractorPayLines(payments, contractorToDriver));
  const written = upsertPayLines(drafts);
  const summary = [
    `${written} pay line${written === 1 ? "" : "s"}`,
    `${linked} new link${linked === 1 ? "" : "s"}`,
    ...notes,
  ].join(" · ");
  getDb()
    .prepare(
      `UPDATE gusto_connection
       SET last_sync_at = ?, last_sync_error = '', last_sync_summary = ?
       WHERE id = 1`,
    )
    .run(new Date().toISOString(), summary);
  return { lines: written, linked };
}

export function listGustoPeople(): GustoPerson[] {
  const rows = getDb()
    .prepare(
      `SELECT gusto_uuid, kind, email, name, match_names, active
       FROM gusto_people
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{
    gusto_uuid: string;
    kind: string;
    email: string;
    name: string;
    match_names: string;
    active: number;
  }>;
  return rows.map((row) => ({
    uuid: row.gusto_uuid,
    kind: row.kind === "contractor" ? "contractor" : "employee",
    email: row.email,
    name: row.name,
    matchNames: parseMatchNames(row.match_names),
    active: row.active !== 0,
  }));
}

export function listGustoLinks(): GustoLinkRow[] {
  return getDb()
    .prepare(
      `SELECT links.driver_id, links.gusto_uuid, links.kind, links.match_source,
              COALESCE(people.name, '') AS name, COALESCE(people.email, '') AS email
       FROM gusto_driver_links links
       LEFT JOIN gusto_people people ON people.gusto_uuid = links.gusto_uuid
       ORDER BY links.driver_id`,
    )
    .all() as GustoLinkRow[];
}

export function linkGustoDriver(input: {
  driverId: number;
  gustoUuid: string;
}): void {
  const person = getDb()
    .prepare("SELECT kind FROM gusto_people WHERE gusto_uuid = ?")
    .get(input.gustoUuid) as { kind: string } | undefined;
  if (!person) throw new Error("That Gusto person is not in the latest roster.");
  const driver = listDrivers().find((item) => item.id === input.driverId);
  if (!driver) throw new Error("Driver not found.");
  const expected = driver.driver_type === "owner_operator" ? "contractor" : "employee";
  if (person.kind !== expected) {
    throw new Error(
      expected === "contractor"
        ? "Owner-operators link to a Gusto contractor, not an employee."
        : "Company drivers link to a Gusto employee, not a contractor.",
    );
  }
  const now = new Date().toISOString();
  getDb()
    .prepare("DELETE FROM gusto_driver_links WHERE gusto_uuid = ? AND driver_id != ?")
    .run(input.gustoUuid, input.driverId);
  getDb()
    .prepare(
      `INSERT INTO gusto_driver_links (driver_id, gusto_uuid, kind, match_source, updated_at)
       VALUES (?, ?, ?, 'manual', ?)
       ON CONFLICT(driver_id) DO UPDATE SET
         gusto_uuid = excluded.gusto_uuid,
         kind = excluded.kind,
         match_source = 'manual',
         updated_at = excluded.updated_at`,
    )
    .run(input.driverId, input.gustoUuid, person.kind, now);
}

export function unlinkGustoDriver(driverId: number): void {
  getDb().prepare("DELETE FROM gusto_driver_links WHERE driver_id = ?").run(driverId);
}

export function listGustoPayLinesForDriver(driverId: number): GustoPayLine[] {
  const driver = listDrivers().find((item) => item.id === driverId);
  const source = driver?.driver_type === "owner_operator" ? "contractor_payment" : "employee_payroll";
  return getDb()
    .prepare(
      `SELECT id, driver_id, source, gusto_external_id, gusto_person_uuid,
              pay_period_start, pay_period_end, check_date, gross_pay, net_pay
       FROM gusto_pay_lines
       WHERE driver_id = ? AND source = ?
       ORDER BY check_date DESC, id DESC`,
    )
    .all(driverId, source) as GustoPayLine[];
}

export function getGustoPayLine(id: number): GustoPayLine | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, driver_id, source, gusto_external_id, gusto_person_uuid,
                pay_period_start, pay_period_end, check_date, gross_pay, net_pay
         FROM gusto_pay_lines WHERE id = ?`,
      )
      .get(id) as GustoPayLine | undefined) ?? null
  );
}

export function driverHasGustoLink(driverId: number): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM gusto_driver_links WHERE driver_id = ?")
    .get(driverId) as { ok: number } | undefined;
  return Boolean(row);
}

export async function fetchGustoPaystubPdf(input: {
  payrollId: string;
  employeeUuid: string;
}): Promise<Uint8Array> {
  const response = await gustoFetch(
    `/v1/payrolls/${encodeURIComponent(input.payrollId)}/employees/${encodeURIComponent(input.employeeUuid)}/pay_stub`,
    { accept: "application/pdf" },
  );
  if (!response.ok) {
    throw new Error(paystubError(response.status));
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("pdf") && !type.includes("octet-stream")) {
    throw new Error("Gusto did not return a paystub PDF.");
  }
  return new Uint8Array(await response.arrayBuffer());
}

function paystubError(status: number): string {
  if (status === 401 || status === 403 || status === 404) {
    return "Gusto did not return this paystub. Paystub PDFs require Gusto Embedded access.";
  }
  return `Gusto paystub request failed (${status}).`;
}

async function loadContractors(
  companyUuid: string,
  notes: string[],
): Promise<{ people: GustoPerson[] }> {
  try {
    return { people: parseGustoContractors(await gustoGetAll(`/v1/companies/${companyUuid}/contractors`)) };
  } catch (error) {
    notes.push(`Contractor roster skipped (${safeMessage(error)})`);
    return { people: [] };
  }
}

async function loadContractorPayments(companyUuid: string, notes: string[]): Promise<unknown | null> {
  const start = monthsAgo(18);
  const end = new Date().toISOString().slice(0, 10);
  try {
    return await gustoGetJson(
      `/v1/companies/${companyUuid}/contractor_payments?start_date=${start}&end_date=${end}`,
    );
  } catch (error) {
    notes.push(`Contractor payments skipped (${safeMessage(error)})`);
    return null;
  }
}

async function listProcessedPayrollIds(companyUuid: string): Promise<string[]> {
  const start = monthsAgo(18);
  const path =
    `/v1/companies/${companyUuid}/payrolls?processing_statuses=processed&payroll_types=regular,off_cycle&start_date=${start}`;
  const pages = await gustoGetAll(path);
  return [...new Set(parsePayrollIds(pages))];
}

function monthsAgo(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function applyAutoMatches(): number {
  const drivers = listDrivers().map((driver) => ({
    id: driver.id,
    name: driver.name,
    email: driver.email ?? "",
    companyName: driver.company_name ?? "",
    driverType: driver.driver_type,
  }));
  const links = listGustoLinks();
  const plans = planGustoMatches({
    drivers,
    people: listGustoPeople(),
    linkedDriverIds: links.map((link) => link.driver_id),
    linkedGustoUuids: links.map((link) => link.gusto_uuid),
  });
  const now = new Date().toISOString();
  const insert = getDb().prepare(
    `INSERT INTO gusto_driver_links (driver_id, gusto_uuid, kind, match_source, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = getDb().transaction(() => {
    for (const plan of plans) {
      insert.run(plan.driverId, plan.gustoUuid, plan.kind, plan.source, now);
    }
  });
  tx();
  return plans.length;
}

function linkMap(kind: "employee" | "contractor"): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT driver_id, gusto_uuid FROM gusto_driver_links WHERE kind = ?")
    .all(kind) as Array<{ driver_id: number; gusto_uuid: string }>;
  return new Map(rows.map((row) => [row.gusto_uuid, row.driver_id]));
}

function replacePeople(people: GustoPerson[]): void {
  const now = new Date().toISOString();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM gusto_people").run();
    const insert = db.prepare(
      `INSERT INTO gusto_people (gusto_uuid, kind, email, name, match_names, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const person of people) {
      insert.run(
        person.uuid,
        person.kind,
        person.email,
        person.name,
        JSON.stringify(person.matchNames),
        person.active ? 1 : 0,
        now,
      );
    }
  });
  tx();
}

function upsertPayLines(drafts: GustoPayDraft[]): number {
  const now = new Date().toISOString();
  const statement = getDb().prepare(
    `INSERT INTO gusto_pay_lines (
       driver_id, source, gusto_external_id, gusto_person_uuid,
       pay_period_start, pay_period_end, check_date, gross_pay, net_pay, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(driver_id, source, gusto_external_id) DO UPDATE SET
       gusto_person_uuid = excluded.gusto_person_uuid,
       pay_period_start = excluded.pay_period_start,
       pay_period_end = excluded.pay_period_end,
       check_date = excluded.check_date,
       gross_pay = excluded.gross_pay,
       net_pay = excluded.net_pay,
       synced_at = excluded.synced_at`,
  );
  const tx = getDb().transaction(() => {
    for (const row of drafts) {
      statement.run(
        row.driverId,
        row.source,
        row.externalId,
        row.personUuid,
        row.payPeriodStart,
        row.payPeriodEnd,
        row.checkDate,
        row.grossPay,
        row.netPay,
        now,
      );
    }
  });
  tx();
  return drafts.length;
}

function parseMatchNames(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function ensureCompanyUuid(): Promise<string> {
  const current = readConnection();
  if (current?.company_uuid) return current.company_uuid;
  return refreshCompanyIdentity();
}

async function refreshCompanyIdentity(): Promise<string> {
  const info = await gustoGetJson("/v1/token_info");
  const companyUuid = parseTokenCompanyUuid(info);
  if (!companyUuid) throw new Error("Gusto did not identify a company on this token.");
  let companyName = "";
  try {
    companyName = parseCompanyName(await gustoGetJson(`/v1/companies/${companyUuid}`));
  } catch (error) {
    recordSyncError(safeMessage(error));
  }
  const scope = typeof (info as { scope?: unknown }).scope === "string" ? (info as { scope: string }).scope : "";
  getDb()
    .prepare(
      `UPDATE gusto_connection
       SET company_uuid = ?, company_name = CASE WHEN ? != '' THEN ? ELSE company_name END,
           granted_scope = CASE WHEN ? != '' THEN ? ELSE granted_scope END
       WHERE id = 1`,
    )
    .run(companyUuid, companyName, companyName, scope, scope);
  return companyUuid;
}

async function gustoGetAll(pathname: string): Promise<unknown[]> {
  const collected: unknown[] = [];
  let previousFirst = "";
  for (let page = 1; page <= 20; page += 1) {
    const joiner = pathname.includes("?") ? "&" : "?";
    const response = await gustoFetch(`${pathname}${joiner}page=${page}&per=100`, { accept: "application/json" });
    if (page > 1 && (response.status === 404 || response.status === 400)) break;
    if (!response.ok) throw new Error(await safeStatus(response));
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [payload];
    if (payload.length === 0) break;
    const first = JSON.stringify(payload[0]);
    if (first && first === previousFirst) break;
    previousFirst = first;
    collected.push(...payload);
    if (payload.length < 100) break;
  }
  return collected;
}

async function gustoGetJson(pathname: string): Promise<unknown> {
  const response = await gustoFetch(pathname, { accept: "application/json" });
  if (!response.ok) throw new Error(await safeStatus(response));
  return response.json() as Promise<unknown>;
}

async function gustoFetch(pathname: string, input: { accept: string }): Promise<Response> {
  const pathOnly = pathname.split("?")[0] ?? pathname;
  if (!isAllowedGustoReadPath(pathOnly)) {
    throw new Error("That Gusto request is not a read this integration makes.");
  }
  const token = await accessToken();
  const url = `${gustoApiBase(getGustoEnv())}${pathname}`;
  const response = await gustoFetchImpl(url, {
    method: "GET",
    headers: {
      Accept: input.accept,
      Authorization: `Bearer ${token}`,
      "X-Gusto-API-Version": getGustoApiVersion(),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 401) return response;
  await forceRefresh();
  const retried = await accessToken();
  return gustoFetchImpl(url, {
    method: "GET",
    headers: {
      Accept: input.accept,
      Authorization: `Bearer ${retried}`,
      "X-Gusto-API-Version": getGustoApiVersion(),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function accessToken(): Promise<string> {
  const row = readConnection();
  if (!row?.refresh_token) throw new Error("Gusto is not connected.");
  if (row.access_token && !tokenExpired(row.access_token_expires_at)) return row.access_token;
  await forceRefresh();
  const next = readConnection();
  if (!next?.access_token) throw new Error("Gusto did not return an access token.");
  return next.access_token;
}

async function forceRefresh(): Promise<void> {
  const run = refreshQueue.then(() => refreshOnce());
  refreshQueue = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}

async function refreshOnce(): Promise<void> {
  const row = readConnection();
  if (!row?.refresh_token) throw new Error("Gusto is not connected.");
  if (row.access_token && !tokenExpired(row.access_token_expires_at)) return;
  const tokens = await postToken({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    redirect_uri: getGustoRedirectUri(),
  });
  saveTokens(tokens, { companyUuid: row.company_uuid, companyName: row.company_name });
}

function tokenExpired(expiresAt: string): boolean {
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return true;
  return time <= Date.now();
}

async function postToken(fields: Record<string, string>): Promise<TokenResponse> {
  const clientId = getGustoClientId();
  const clientSecret = getGustoClientSecret();
  if (!clientId || !clientSecret) throw new Error("Gusto is not configured.");
  const url = `${gustoApiBase(getGustoEnv())}/oauth/token`;
  if (!isGustoTokenUrl(url)) throw new Error("Gusto token URL was not recognized.");
  const response = await gustoFetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...fields,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await safeStatus(response));
  const payload = (await response.json()) as TokenResponse;
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Gusto did not return a token pair.");
  }
  return payload;
}

function saveTokens(
  tokens: TokenResponse,
  identity: { companyUuid: string; companyName: string },
): void {
  const expiresIn = Math.max(60, Number(tokens.expires_in ?? 7200) - 60);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO gusto_connection (
         id, company_uuid, company_name, access_token, refresh_token, access_token_expires_at,
         granted_scope, connected_at, last_sync_at, last_sync_error, last_sync_summary
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, '', '', '')
       ON CONFLICT(id) DO UPDATE SET
         company_uuid = CASE WHEN excluded.company_uuid != '' THEN excluded.company_uuid ELSE gusto_connection.company_uuid END,
         company_name = CASE WHEN excluded.company_name != '' THEN excluded.company_name ELSE gusto_connection.company_name END,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         access_token_expires_at = excluded.access_token_expires_at,
         granted_scope = CASE WHEN excluded.granted_scope != '' THEN excluded.granted_scope ELSE gusto_connection.granted_scope END,
         connected_at = CASE WHEN gusto_connection.connected_at != '' THEN gusto_connection.connected_at ELSE excluded.connected_at END`,
    )
    .run(
      identity.companyUuid,
      identity.companyName,
      tokens.access_token ?? "",
      tokens.refresh_token ?? "",
      expiresAt,
      tokens.scope ?? "",
      now,
    );
}

function readConnection(): ConnectionRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT company_uuid, company_name, access_token, refresh_token, access_token_expires_at,
                granted_scope, connected_at, last_sync_at, last_sync_error, last_sync_summary
         FROM gusto_connection WHERE id = 1`,
      )
      .get() as ConnectionRow | undefined) ?? null
  );
}

function recordSyncError(message: string): void {
  const clean = message.replace(/access_token|refresh_token|client_secret/gi, "[redacted]");
  const existing = readConnection();
  if (!existing) return;
  const combined = existing.last_sync_error ? `${existing.last_sync_error} ${clean}` : clean;
  getDb().prepare("UPDATE gusto_connection SET last_sync_error = ? WHERE id = 1").run(combined.slice(0, 500));
}

async function safeStatus(response: Response): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  if (/access_token|refresh_token|client_secret/i.test(body)) {
    return `Gusto request failed (${response.status}).`;
  }
  return `Gusto request failed (${response.status}).`;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Gusto request failed.";
  return message.replace(/access_token|refresh_token|client_secret/gi, "[redacted]");
}
