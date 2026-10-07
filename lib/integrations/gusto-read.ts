/**
 * Pure Gusto read models. Shapes follow the documented JSON, not a private schema.
 * This module does not call the network and does not read tokens.
 */

export const GUSTO_READ_SCOPES = [
  "companies:read",
  "employees:read",
  "payrolls:read",
  "contractors:read",
  "pay_stubs:read",
] as const;

/** Paystub PDF is documented under Embedded and marked unavailable for App Integrations. */
export const GUSTO_PAYSTUB_PDF_REQUIRES_EMBEDDED = true;

export const OWNER_OPERATOR_PAY_NOTE = "Your pay is on the settlement statement.";

export type GustoEnvName = "demo" | "production";
export type GustoPersonKind = "employee" | "contractor";
export type GustoPaySource = "employee_payroll" | "contractor_payment";
export type GustoMatchSource = "email" | "name" | "manual";

export type GustoPerson = {
  uuid: string;
  kind: GustoPersonKind;
  email: string;
  name: string;
  matchNames: string[];
  active: boolean;
};

export type GustoPayDraft = {
  driverId: number;
  source: GustoPaySource;
  externalId: string;
  personUuid: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  checkDate: string;
  grossPay: string;
  netPay: string;
};

export type GustoMatchPlan = {
  driverId: number;
  gustoUuid: string;
  kind: GustoPersonKind;
  source: Exclude<GustoMatchSource, "manual">;
};

const READ_SCOPE = /^[a-z0-9_]+:read(?::phi)?$/;

export function gustoApiBase(env: GustoEnvName): string {
  return env === "production" ? "https://api.gusto.com" : "https://api.gusto-demo.com";
}

export function gustoAuthorizeUrl(input: {
  env: GustoEnvName;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    state: input.state,
    scope: GUSTO_READ_SCOPES.join(" "),
  });
  return `${gustoApiBase(input.env)}/oauth/authorize?${params.toString()}`;
}

export function authorizeUrlIsReadOnly(url: string): boolean {
  const parsed = new URL(url);
  const scope = parsed.searchParams.get("scope") ?? "";
  const parts = scope.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => READ_SCOPE.test(part)) && !url.includes("client_secret");
}

export function grantedScopeIsReadOnly(scope: string): boolean {
  const parts = scope.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((part) => READ_SCOPE.test(part));
}

export function normalizeMatchKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinName(parts: unknown[]): string {
  return parts.map((part) => text(part)).filter(Boolean).join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseGustoEmployees(payload: unknown): GustoPerson[] {
  return asArray(payload).flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const uuid = text(row.uuid);
    if (!uuid) return [];
    const first = text(row.preferred_first_name) || text(row.first_name);
    const legal = joinName([row.first_name, row.last_name]);
    const preferred = joinName([first, row.last_name]);
    const name = preferred || legal;
    return [
      {
        uuid,
        kind: "employee" as const,
        email: text(row.email) || text(row.work_email),
        name,
        matchNames: uniqueKeys([legal, preferred, name]),
        active: row.terminated !== true,
      },
    ];
  });
}

export function parseGustoContractors(payload: unknown): GustoPerson[] {
  return asArray(payload).flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const uuid = text(row.uuid);
    if (!uuid) return [];
    const person = joinName([row.first_name, row.last_name]);
    const business = text(row.business_name);
    const name = business || person;
    return [
      {
        uuid,
        kind: "contractor" as const,
        email: text(row.email),
        name,
        matchNames: uniqueKeys([name, business, person]),
        active: row.is_active !== false,
      },
    ];
  });
}

export function parseTokenCompanyUuid(payload: unknown): string {
  const row = asRecord(payload);
  const resource = asRecord(row?.resource);
  if (text(resource?.type) !== "Company") return "";
  return text(resource?.uuid);
}

export function parseCompanyName(payload: unknown): string {
  const row = asRecord(payload);
  return text(row?.name) || text(row?.trade_name) || text(row?.legal_name);
}

export function parsePayrollIds(payload: unknown): string[] {
  return asArray(payload).flatMap((item) => {
    const row = asRecord(item);
    if (!row || row.processed === false) return [];
    const id = text(row.payroll_uuid) || text(row.uuid);
    return id ? [id] : [];
  });
}

function money(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  return raw;
}

export function parseEmployeePayLines(
  payroll: unknown,
  employeeToDriver: Map<string, number>,
): GustoPayDraft[] {
  const row = asRecord(payroll);
  if (!row || row.processed === false) return [];
  const externalId = text(row.payroll_uuid) || text(row.uuid);
  if (!externalId) return [];
  const period = asRecord(row.pay_period);
  const start = text(period?.start_date);
  const end = text(period?.end_date);
  const checkDate = text(row.check_date);
  return asArray(row.employee_compensations).flatMap((item) => {
    const comp = asRecord(item);
    if (!comp || comp.excluded === true) return [];
    const personUuid = text(comp.employee_uuid);
    const driverId = employeeToDriver.get(personUuid);
    if (!driverId) return [];
    return [
      {
        driverId,
        source: "employee_payroll" as const,
        externalId,
        personUuid,
        payPeriodStart: start,
        payPeriodEnd: end,
        checkDate,
        grossPay: money(comp.gross_pay),
        netPay: money(comp.net_pay),
      },
    ];
  });
}

export function parseContractorPayLines(
  payload: unknown,
  contractorToDriver: Map<string, number>,
): GustoPayDraft[] {
  const row = asRecord(payload);
  const groups = asArray(row?.contractor_payments ?? payload);
  const drafts: GustoPayDraft[] = [];
  for (const group of groups) {
    const record = asRecord(group);
    if (!record) continue;
    const nested = asArray(record.payments);
    const payments = nested.length > 0 ? nested : [record];
    for (const payment of payments) {
      const item = asRecord(payment);
      if (!item) continue;
      if (text(item.status) === "Unfunded") continue;
      const externalId = text(item.uuid);
      const personUuid = text(item.contractor_uuid) || text(record.contractor_uuid);
      const driverId = contractorToDriver.get(personUuid);
      if (!externalId || !driverId) continue;
      const wage = money(item.wage_total);
      drafts.push({
        driverId,
        source: "contractor_payment",
        externalId,
        personUuid,
        payPeriodStart: "",
        payPeriodEnd: "",
        checkDate: text(item.date),
        grossPay: wage,
        netPay: wage,
      });
    }
  }
  return drafts;
}

function uniqueKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeMatchKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function driverMatchKind(driverType: string): GustoPersonKind {
  return driverType === "owner_operator" ? "contractor" : "employee";
}

export function planGustoMatches(input: {
  drivers: Array<{
    id: number;
    name: string;
    email: string;
    companyName: string;
    driverType: string;
  }>;
  people: GustoPerson[];
  linkedDriverIds: number[];
  linkedGustoUuids: string[];
}): GustoMatchPlan[] {
  const takenDrivers = new Set(input.linkedDriverIds);
  const takenPeople = new Set(input.linkedGustoUuids);
  const openDrivers = input.drivers.filter((driver) => !takenDrivers.has(driver.id));
  const openPeople = input.people.filter((person) => !takenPeople.has(person.uuid));
  const plans: GustoMatchPlan[] = [];

  const emailBuckets = new Map<string, GustoPerson[]>();
  for (const person of openPeople) {
    const email = normalizeMatchKey(person.email);
    if (!email) continue;
    const key = `${person.kind}:${email}`;
    emailBuckets.set(key, [...(emailBuckets.get(key) ?? []), person]);
  }

  const claimed = new Set<string>();
  for (const driver of openDrivers) {
    const email = normalizeMatchKey(driver.email);
    if (!email) continue;
    const kind = driverMatchKind(driver.driverType);
    const hits = (emailBuckets.get(`${kind}:${email}`) ?? []).filter((person) => !claimed.has(person.uuid));
    if (hits.length !== 1) continue;
    claimed.add(hits[0].uuid);
    takenDrivers.add(driver.id);
    plans.push({ driverId: driver.id, gustoUuid: hits[0].uuid, kind, source: "email" });
  }

  for (const driver of openDrivers) {
    if (takenDrivers.has(driver.id)) continue;
    const kind = driverMatchKind(driver.driverType);
    const wanted = uniqueKeys(
      kind === "contractor" ? [driver.name, driver.companyName] : [driver.name],
    );
    if (wanted.length === 0) continue;
    const hits = openPeople.filter((person) => {
      if (person.kind !== kind || claimed.has(person.uuid)) return false;
      return person.matchNames.some((name) => wanted.includes(name));
    });
    if (hits.length !== 1) continue;
    claimed.add(hits[0].uuid);
    plans.push({ driverId: driver.id, gustoUuid: hits[0].uuid, kind, source: "name" });
  }

  return plans;
}

export function formatPayMoney(value: string): string {
  if (!value) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatGustoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value || "—";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatPayPeriod(start: string, end: string): string {
  if (start && end) return `${formatGustoDate(start)} – ${formatGustoDate(end)}`;
  if (start || end) return formatGustoDate(start || end);
  return "—";
}

/** Paths the client is allowed to GET. Anything else is refused before fetch. */
export function isAllowedGustoReadPath(pathname: string): boolean {
  return (
    /^\/v1\/token_info$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+\/employees$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+\/contractors$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+\/payrolls$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+\/payrolls\/[^/]+$/.test(pathname) ||
    /^\/v1\/companies\/[^/]+\/contractor_payments$/.test(pathname) ||
    /^\/v1\/payrolls\/[^/]+\/employees\/[^/]+\/pay_stub$/.test(pathname)
  );
}

export function isGustoTokenUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/oauth/token";
  } catch {
    return false;
  }
}
