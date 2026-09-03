import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getQuickbooksClientId,
  getQuickbooksClientSecret,
  getQuickbooksEnvironment,
  getQuickbooksRealmId,
  getQuickbooksRedirectUri,
  getQuickbooksRefreshToken,
  isQuickbooksOAuthReady,
} from "../env";
import { getDbPath } from "../db";
import {
  getCustomer,
  getLoad,
  markCustomerNeedsQbo,
  markCustomerQboMapped,
  markQboInvoice,
} from "../queries";
import { labelForPayCategory } from "../load-page-shared";
import { customerInvoicePayItems } from "../pay-items";
import { isBillableStatus, isOwnerOperator, type LoadView } from "../types";

const MINOR_VERSION = "75";
const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const LINE_HAUL_ITEM_NAME = "Line Haul";
const LUMPER_ITEM_NAME = "Lumper";

let lastDemoInvoiceStamp = 0;

function uniqueDemoInvoiceStamp(): number {
  const next = Math.max(Date.now(), lastDemoInvoiceStamp + 1);
  lastDemoInvoiceStamp = next;
  return next;
}

export type QboInvoiceLine = {
  name: string;
  description: string;
  amount: number;
};

export type QboInvoicePreview = {
  configured: boolean;
  mode: "demo" | "quickbooks";
  environment: "sandbox" | "production";
  customerName: string;
  customerNeedsQbo: boolean;
  loadNumber: string;
  lane: string;
  amount: number;
  lines: QboInvoiceLine[];
  txnDate: string;
  memo: string;
  ownerOperatorNote: string;
  alreadySent: boolean;
  existingInvoiceId: string;
  existingInvoiceNumber: string;
  existingSentAt: string;
  existingSource: string;
};

export type QboSendResult = {
  invoiceId: string;
  invoiceNumber: string;
  sentAt: string;
  source: "demo" | "quickbooks";
};

export type QboStatus = {
  configured: boolean;
  oauthReady: boolean;
  environment: "sandbox" | "production";
  mode: "demo" | "quickbooks";
  status: "Demo" | "Connected" | "API error" | "Needs connect";
  clientIdSet: boolean;
  clientSecretSet: boolean;
  redirectUri: string;
  refreshTokenSet: boolean;
  realmIdSet: boolean;
  companyName: string;
  fetchedAt: string;
  error?: string;
};

class QboHttpError extends Error {
  status: number;
  constructor(status: number, context: string) {
    super(qboStatusMessage(status, context));
    this.name = "QboHttpError";
    this.status = status;
  }
}

export function resetQuickbooksForTests(): void {
  cachedAccess = null;
}

export function hasQuickbooksSession(): boolean {
  return Boolean(
    getQuickbooksClientId() && getQuickbooksClientSecret() && resolveRefreshToken() && resolveRealmId(),
  );
}

export function previewQuickbooksInvoice(load: LoadView): QboInvoicePreview {
  const lines = buildInvoiceLines(load);
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const configured = hasQuickbooksSession();
  const customer = getCustomer(load.customer_id);
  return {
    configured,
    mode: configured ? "quickbooks" : "demo",
    environment: getQuickbooksEnvironment(),
    customerName: load.customer_name,
    customerNeedsQbo: customer?.qbo_status === "needs_qbo",
    loadNumber: load.load_number,
    lane: `${load.origin} → ${load.destination}`,
    amount,
    lines,
    txnDate: invoiceDate(load.delivery_end || load.delivery_start),
    memo: buildMemo(load),
    ownerOperatorNote:
      isOwnerOperator(load.driver_type)
        ? "Customer invoice only."
        : "",
    alreadySent: Boolean(load.qbo_invoice_id),
    existingInvoiceId: load.qbo_invoice_id,
    existingInvoiceNumber: load.qbo_invoice_number,
    existingSentAt: load.qbo_sent_at,
    existingSource: load.qbo_source,
  };
}

export function buildInvoiceLines(load: LoadView): QboInvoiceLine[] {
  const payItems = customerInvoicePayItems(load.id);
  const lane = `${load.origin} → ${load.destination}`;
  const qboLine = (item: { category: string; payee: string; notes: string; total: number | null }): QboInvoiceLine => ({
    name: labelForPayCategory(item.category),
    description: [load.load_number, item.payee, item.notes].filter(Boolean).join(" · "),
    amount: item.total ?? 0,
  });
  if (payItems.length) {
    const flats = payItems.filter((item) => item.category === "flat_rate");
    const extras = payItems.filter((item) => item.category !== "flat_rate" && item.category !== "lumper");
    const lines: QboInvoiceLine[] = [];
    if (flats.length) {
      lines.push(...flats.map(qboLine));
    } else {
      const rate = customerBilledRate(load);
      if (rate != null) {
        lines.push({ name: LINE_HAUL_ITEM_NAME, description: `${load.load_number} ${lane}`, amount: rate });
      }
    }
    lines.push(...extras.map(qboLine));
    return lines;
  }
  const rate = customerBilledRate(load);
  if (rate == null) return [];
  const lines: QboInvoiceLine[] = [
    { name: LINE_HAUL_ITEM_NAME, description: `${load.load_number} ${lane}`, amount: rate },
  ];
  if (load.lumper_actual != null && load.lumper_actual > 0) {
    lines.push({
      name: LUMPER_ITEM_NAME,
      description: `${load.load_number} lumper`,
      amount: load.lumper_actual,
    });
  }
  return lines;
}

export async function sendBillToQuickbooks(billId: number): Promise<{ billId: string; source: "demo" | "quickbooks" }> {
  const { getBill, markQboBill } = await import("../accounting");
  const { listQboVendorMaps } = await import("../accounting-desk");
  const bill = getBill(billId);
  if (!bill) throw new Error("Bill not found.");
  if (bill.qbo_bill_id) throw new Error("This bill was already sent to QuickBooks.");
  if (!hasQuickbooksSession()) {
    const demoId = `demo-bill-${bill.id}-${uniqueDemoInvoiceStamp()}`;
    markQboBill(bill.id, demoId);
    return { billId: demoId, source: "demo" };
  }
  const mapped = listQboVendorMaps().find((row) => row.payee === bill.vendor);
  const vendorId = mapped?.qbo_vendor_id || (await findOrCreateVendor(bill.vendor));
  const expenseId = await findExpenseAccountId();
  const created = await qboPost<{ Bill?: { Id?: string } }>(
    "/bill",
    {
      VendorRef: { value: vendorId },
      PrivateNote: (bill.memo || `Bill ${bill.id}`).slice(0, 4000),
      Line: [
        {
          Amount: bill.amount,
          DetailType: "AccountBasedExpenseLineDetail",
          Description: bill.memo || `Bill ${bill.id}`,
          AccountBasedExpenseLineDetail: { AccountRef: { value: expenseId } },
        },
      ],
    },
    "bill create",
  );
  const id = created.Bill?.Id;
  if (!id) throw new Error("QuickBooks did not return a bill id.");
  markQboBill(bill.id, id);
  return { billId: id, source: "quickbooks" };
}

async function findOrCreateVendor(name: string): Promise<string> {
  const displayName = name.trim().slice(0, 500);
  const found = await qboQuery<{ Vendor?: Array<{ Id?: string }> }>(
    `select * from Vendor where DisplayName = '${escapeQboString(displayName)}'`,
    "vendor query",
  );
  const existing = found.QueryResponse?.Vendor?.[0]?.Id;
  if (existing) return existing;
  const created = await qboPost<{ Vendor?: { Id?: string } }>(
    "/vendor",
    { DisplayName: displayName },
    "vendor create",
  );
  const id = created.Vendor?.Id;
  if (!id) throw new Error("QuickBooks did not return a vendor id.");
  return id;
}

async function findExpenseAccountId(): Promise<string> {
  const accounts = await qboQuery<{ Account?: Array<{ Id?: string }> }>(
    "select * from Account where AccountType = 'Expense' maxresults 1",
    "expense account query",
  );
  const id = accounts.QueryResponse?.Account?.[0]?.Id;
  if (!id) throw new Error("QuickBooks has no expense account for this bill.");
  return id;
}

export async function sendLoadToQuickbooks(
  loadId: number,
  options: { confirmResend?: boolean } = {},
): Promise<QboSendResult> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (!isBillableStatus(load.status)) {
    throw new Error("Mark the load Delivered before sending an invoice.");
  }
  if (load.qbo_invoice_id && !options.confirmResend) {
    throw new Error("This load was already sent to QuickBooks. Confirm to send again.");
  }
  const preview = previewQuickbooksInvoice(load);
  assertCustomerInvoiceReady(preview);
  const sentAt = new Date().toISOString();

  if (!hasQuickbooksSession()) {
    const result: QboSendResult = {
      invoiceId: `demo-${load.load_number}-${uniqueDemoInvoiceStamp()}`,
      invoiceNumber: load.load_number,
      sentAt,
      source: "demo",
    };
    markQboInvoice(loadId, result);
    return result;
  }

  const live = await createLiveInvoice(load, preview);
  const result: QboSendResult = {
    invoiceId: live.invoiceId,
    invoiceNumber: live.invoiceNumber || load.load_number,
    sentAt,
    source: "quickbooks",
  };
  markQboInvoice(loadId, result);
  return result;
}

export async function getQuickbooksStatus(): Promise<QboStatus> {
  const fetchedAt = new Date().toISOString();
  const environment = getQuickbooksEnvironment();
  const session = hasQuickbooksSession();
  const oauthReady = isQuickbooksOAuthReady();
  const base: QboStatus = {
    configured: session,
    oauthReady,
    environment,
    mode: session ? "quickbooks" : "demo",
    status: session ? "Connected" : oauthReady ? "Needs connect" : "Demo",
    clientIdSet: Boolean(getQuickbooksClientId()),
    clientSecretSet: Boolean(getQuickbooksClientSecret()),
    redirectUri: getQuickbooksRedirectUri(),
    refreshTokenSet: Boolean(resolveRefreshToken()),
    realmIdSet: Boolean(resolveRealmId()),
    companyName: "",
    fetchedAt,
  };
  if (!session) return base;

  try {
    const company = await qboGet<{ CompanyInfo?: { CompanyName?: string; LegalName?: string } }>(
      `/companyinfo/${resolveRealmId()}`,
      "company info",
    );
    const companyName = company.CompanyInfo?.CompanyName || company.CompanyInfo?.LegalName || "";
    return {
      ...base,
      mode: "quickbooks",
      status: "Connected",
      companyName,
    };
  } catch (error) {
    return {
      ...base,
      status: "API error",
      error: publicQboError(error),
    };
  }
}

export const QBO_MISSING_RATE_MESSAGE =
  "This load has no customer billed rate. Set a rate on Financials before sending to QuickBooks.";

function assertCustomerInvoiceReady(preview: QboInvoicePreview): void {
  if (!preview.lines.length || preview.amount <= 0) {
    throw new Error(QBO_MISSING_RATE_MESSAGE);
  }
}

function customerBilledRate(load: LoadView): number | null {
  if (load.rate == null || Number.isNaN(load.rate) || load.rate <= 0) return null;
  return load.rate;
}

function invoiceDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildMemo(load: LoadView): string {
  const parts = [`Load ${load.load_number}`, `${load.origin} → ${load.destination}`];
  if (load.reference_number) parts.push(`Ref: ${load.reference_number}`);
  if (load.po_number) parts.push(`PO: ${load.po_number}`);
  if (load.special_instructions) parts.push(load.special_instructions);
  if (load.appointment_notes) parts.push(`Appointment: ${load.appointment_notes}`);
  if (load.notes) parts.push(load.notes);
  if (isOwnerOperator(load.driver_type)) {
    parts.push("Customer invoice only.");
  }
  return parts.join("\n");
}

async function createLiveInvoice(
  load: LoadView,
  preview: QboInvoicePreview,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const customerId = await resolveQboCustomer(load);
  const docNumber = uniqueDocNumber(load);
  const linePayload = [];
  for (const line of preview.lines) {
    const itemId = await findOrCreateServiceItem(line.name);
    linePayload.push({
      Amount: line.amount,
      DetailType: "SalesItemLineDetail",
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId, name: line.name },
        Qty: 1,
        UnitPrice: line.amount,
      },
    });
  }
  const payload = {
    DocNumber: docNumber,
    TxnDate: preview.txnDate,
    CustomerRef: { value: customerId },
    PrivateNote: preview.memo.slice(0, 4000),
    CustomerMemo: { value: preview.memo.slice(0, 1000) },
    Line: linePayload,
  };
  const created = await qboPost<{ Invoice?: { Id?: string; DocNumber?: string } }>(
    "/invoice",
    payload,
    "invoice create",
  );
  const invoiceId = created.Invoice?.Id;
  if (!invoiceId) {
    throw new Error("QuickBooks did not return an invoice id.");
  }
  return {
    invoiceId,
    invoiceNumber: created.Invoice?.DocNumber || docNumber,
  };
}

function uniqueDocNumber(load: LoadView): string {
  if (!load.qbo_invoice_id) return load.load_number.slice(0, 21);
  const suffix = Date.now().toString().slice(-4);
  return `${load.load_number}-${suffix}`.slice(0, 21);
}

async function resolveQboCustomer(load: LoadView): Promise<string> {
  const mapped = getCustomer(load.customer_id);
  if (mapped?.qbo_customer_id) return mapped.qbo_customer_id;
  const displayName = load.customer_name.trim().slice(0, 500);
  try {
    const found = await findQboCustomerId(displayName);
    if (found) {
      if (load.customer_id) markCustomerQboMapped(load.customer_id, found);
      return found;
    }
    const created = await qboPost<{ Customer?: { Id?: string } }>(
      "/customer",
      { DisplayName: displayName },
      "customer create",
    );
    const id = created.Customer?.Id;
    if (!id) throw new Error("QuickBooks did not return a customer id.");
    if (load.customer_id) markCustomerQboMapped(load.customer_id, id);
    return id;
  } catch (error) {
    if (error instanceof QboHttpError) throw error;
    if (load.customer_id) markCustomerNeedsQbo(load.customer_id);
    if (error instanceof Error && /Needs QBO customer/i.test(error.message)) throw error;
    throw new Error(`Needs QBO customer: ${displayName}. Create or match this customer in QuickBooks, then send again.`);
  }
}

async function findQboCustomerId(displayName: string): Promise<string | undefined> {
  const exact = await qboQuery<{ Customer?: Array<{ Id?: string; DisplayName?: string }> }>(
    `select * from Customer where DisplayName = '${escapeQboString(displayName)}'`,
    "customer query",
  );
  const exactHits = exact.QueryResponse?.Customer ?? [];
  if (exactHits.length === 1 && exactHits[0]?.Id) return exactHits[0].Id;
  if (exactHits.length > 1) return undefined;
  const company = await qboQuery<{ Customer?: Array<{ Id?: string }> }>(
    `select * from Customer where CompanyName = '${escapeQboString(displayName)}'`,
    "customer company query",
  );
  const companyHits = company.QueryResponse?.Customer ?? [];
  if (companyHits.length === 1 && companyHits[0]?.Id) return companyHits[0].Id;
  return undefined;
}

async function findOrCreateServiceItem(name: string): Promise<string> {
  const named = await qboQuery<{ Item?: Array<{ Id?: string; Name?: string }> }>(
    `select * from Item where Name = '${escapeQboString(name)}'`,
    "item query",
  );
  const namedId = named.QueryResponse?.Item?.[0]?.Id;
  if (namedId) return namedId;

  const services = await qboQuery<{ Item?: Array<{ Id?: string; Type?: string }> }>(
    "select * from Item where Type = 'Service' maxresults 1",
    "service item query",
  );
  const serviceId = services.QueryResponse?.Item?.[0]?.Id;
  if (serviceId) return serviceId;

  const accounts = await qboQuery<{ Account?: Array<{ Id?: string }> }>(
    "select * from Account where AccountType = 'Income' maxresults 1",
    "income account query",
  );
  const incomeId = accounts.QueryResponse?.Account?.[0]?.Id;
  if (!incomeId) {
    throw new Error("QuickBooks has no income account to create a Line Haul item.");
  }
  const created = await qboPost<{ Item?: { Id?: string } }>(
    "/item",
    {
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: incomeId },
    },
    "item create",
  );
  const id = created.Item?.Id;
  if (!id) throw new Error("QuickBooks did not return an item id.");
  return id;
}

function escapeQboString(value: string): string {
  return value.replace(/'/g, "''");
}

export type QboNamedRef = { id: string; name: string };

export async function listQboCustomers(): Promise<QboNamedRef[]> {
  return listQboNamed("Customer", "DisplayName", "customer list");
}

export async function listQboItems(): Promise<QboNamedRef[]> {
  return listQboNamed("Item", "Name", "item list");
}

export async function listQboVendors(): Promise<QboNamedRef[]> {
  return listQboNamed("Vendor", "DisplayName", "vendor list");
}

async function listQboNamed(entity: "Customer" | "Item" | "Vendor", nameField: string, context: string): Promise<QboNamedRef[]> {
  if (!hasQuickbooksSession()) return [];
  try {
    const result = await qboQuery<Record<string, Array<{ Id?: string; DisplayName?: string; Name?: string }>>>(
      `select * from ${entity} maxresults 1000`,
      context,
    );
    const rows = result.QueryResponse?.[entity] ?? [];
    return rows
      .map((row) => ({
        id: String(row.Id ?? "").trim(),
        name: String(nameField === "Name" ? row.Name : row.DisplayName ?? "").trim(),
      }))
      .filter((row) => row.id);
  } catch {
    return [];
  }
}

function apiBase(): string {
  const realmId = resolveRealmId();
  if (!realmId) throw new Error("Connect QuickBooks in Settings to store the company (realm) id.");
  const host =
    getQuickbooksEnvironment() === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  return `${host}/v3/company/${realmId}`;
}

type QueryEnvelope<T> = { QueryResponse?: T };

async function qboQuery<T>(query: string, context: string): Promise<QueryEnvelope<T>> {
  const url = `${apiBase()}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`;
  return qboRequest<QueryEnvelope<T>>(url, { method: "GET" }, context);
}

async function qboGet<T>(pathname: string, context: string): Promise<T> {
  return qboRequest<T>(`${apiBase()}${pathname}?minorversion=${MINOR_VERSION}`, { method: "GET" }, context);
}

async function qboPost<T>(pathname: string, body: unknown, context: string): Promise<T> {
  return qboRequest<T>(
    `${apiBase()}${pathname}?minorversion=${MINOR_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    context,
  );
}

async function qboRequest<T>(url: string, init: RequestInit, context: string): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new QboHttpError(response.status, context);
  }
  return (await response.json()) as T;
}

type TokenCache = { accessToken: string; expiresAt: number };
let cachedAccess: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 5_000) {
    return cachedAccess.accessToken;
  }
  const clientId = getQuickbooksClientId();
  const clientSecret = getQuickbooksClientSecret();
  const refreshToken = resolveRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("QuickBooks credentials are incomplete.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new QboHttpError(response.status, "token refresh");
  }
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new Error("QuickBooks did not return an access token.");
  }
  if (payload.refresh_token) {
    writeStoredTokens({ refresh_token: payload.refresh_token, realm_id: resolveRealmId() });
  }
  cachedAccess = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(30, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

function refreshTokenPath(): string {
  if (process.env.TMS_QBO_REFRESH_PATH) return process.env.TMS_QBO_REFRESH_PATH;
  return path.join(path.dirname(getDbPath()), "qbo-refresh.json");
}

type StoredQboTokens = { refresh_token?: string; realm_id?: string };

function readStoredTokens(): StoredQboTokens {
  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ refreshTokenPath(), "utf8");
    const parsed = JSON.parse(raw) as StoredQboTokens;
    return {
      refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token.trim() : undefined,
      realm_id: typeof parsed.realm_id === "string" ? parsed.realm_id.trim() : undefined,
    };
  } catch {
    return {};
  }
}

function resolveRefreshToken(): string | undefined {
  return readStoredTokens().refresh_token || getQuickbooksRefreshToken();
}

function resolveRealmId(): string | undefined {
  return readStoredTokens().realm_id || getQuickbooksRealmId();
}

function writeStoredTokens(input: { refresh_token: string; realm_id?: string }): void {
  const filePath = refreshTokenPath();
  const current = readStoredTokens();
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    /*turbopackIgnore: true*/ filePath,
    `${JSON.stringify({
      refresh_token: input.refresh_token,
      realm_id: input.realm_id || current.realm_id || "",
      updated_at: new Date().toISOString(),
    })}\n`,
    { mode: 0o600 },
  );
}

export function clearStoredQuickbooksTokens(): void {
  cachedAccess = null;
  try {
    fs.rmSync(/*turbopackIgnore: true*/ refreshTokenPath(), { force: true });
  } catch {
    // File may not exist.
  }
}

export function createQuickbooksOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function oauthStatesMatch(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildQuickbooksAuthorizeUrl(state: string): string {
  const clientId = getQuickbooksClientId();
  if (!clientId) throw new Error("QuickBooks is not connected.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getQuickbooksRedirectUri(),
    response_type: "code",
    scope: QBO_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function completeQuickbooksOAuth(input: {
  code: string;
  realmId: string;
}): Promise<void> {
  const clientId = getQuickbooksClientId();
  const clientSecret = getQuickbooksClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks is not connected.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: getQuickbooksRedirectUri(),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new QboHttpError(response.status, "OAuth connect");
  }
  const payload = (await response.json()) as { refresh_token?: string; access_token?: string; expires_in?: number };
  if (!payload.refresh_token) {
    throw new Error("QuickBooks did not return a refresh token.");
  }
  writeStoredTokens({ refresh_token: payload.refresh_token, realm_id: input.realmId.trim() });
  cachedAccess = payload.access_token
    ? {
        accessToken: payload.access_token,
        expiresAt: Date.now() + Math.max(30, payload.expires_in ?? 3600) * 1000,
      }
    : null;
}

function qboStatusMessage(status: number, context: string): string {
  if (status === 401 || status === 403) {
    return `QuickBooks ${context} failed (${status}). Re-connect QuickBooks in Settings.`;
  }
  if (status === 429) return `QuickBooks rate-limited the ${context} request. Try again shortly.`;
  return `QuickBooks ${context} failed (${status}).`;
}

function publicQboError(error: unknown): string {
  if (error instanceof QboHttpError) return error.message;
  if (error instanceof Error) return error.message;
  return "QuickBooks request failed.";
}
