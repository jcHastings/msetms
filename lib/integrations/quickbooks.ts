import fs from "node:fs";
import path from "node:path";
import {
  getQuickbooksClientId,
  getQuickbooksClientSecret,
  getQuickbooksEnvironment,
  getQuickbooksRealmId,
  getQuickbooksRefreshToken,
  isQuickbooksConfigured,
} from "../env";
import { getDbPath } from "../db";
import { getLoad, markQboInvoice } from "../queries";
import type { LoadView } from "../types";

const MINOR_VERSION = "75";
const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const LINE_HAUL_ITEM_NAME = "Line Haul";

export type QboInvoicePreview = {
  configured: boolean;
  mode: "demo" | "quickbooks";
  environment: "sandbox" | "production";
  customerName: string;
  loadNumber: string;
  lane: string;
  amount: number;
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
  environment: "sandbox" | "production";
  mode: "demo" | "quickbooks";
  status: "Demo" | "Connected" | "API error";
  clientIdSet: boolean;
  clientSecretSet: boolean;
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

export function previewQuickbooksInvoice(load: LoadView): QboInvoicePreview {
  const amount = requireCustomerRate(load);
  const configured = isQuickbooksConfigured();
  return {
    configured,
    mode: configured ? "quickbooks" : "demo",
    environment: getQuickbooksEnvironment(),
    customerName: load.customer_name,
    loadNumber: load.load_number,
    lane: `${load.origin} → ${load.destination}`,
    amount,
    txnDate: invoiceDate(load.delivery_end || load.delivery_start),
    memo: buildMemo(load),
    ownerOperatorNote:
      load.driver_type === "owner_operator"
        ? "Owner-operator pay is settled outside QuickBooks. This invoice bills the customer rate only."
        : "",
    alreadySent: Boolean(load.qbo_invoice_id),
    existingInvoiceId: load.qbo_invoice_id,
    existingInvoiceNumber: load.qbo_invoice_number,
    existingSentAt: load.qbo_sent_at,
    existingSource: load.qbo_source,
  };
}

export async function sendLoadToQuickbooks(
  loadId: number,
  options: { confirmResend?: boolean } = {},
): Promise<QboSendResult> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.status !== "delivered") {
    throw new Error("Mark the load Delivered before sending an invoice.");
  }
  if (load.qbo_invoice_id && !options.confirmResend) {
    throw new Error("This load was already sent to QuickBooks. Confirm to send again.");
  }
  const preview = previewQuickbooksInvoice(load);
  const sentAt = new Date().toISOString();

  if (!isQuickbooksConfigured()) {
    const result: QboSendResult = {
      invoiceId: `demo-${load.load_number}-${Date.now()}`,
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
  const base: QboStatus = {
    configured: isQuickbooksConfigured(),
    environment,
    mode: "demo",
    status: "Demo",
    clientIdSet: Boolean(getQuickbooksClientId()),
    clientSecretSet: Boolean(getQuickbooksClientSecret()),
    refreshTokenSet: Boolean(getQuickbooksRefreshToken() || readStoredRefreshToken()),
    realmIdSet: Boolean(getQuickbooksRealmId()),
    companyName: "",
    fetchedAt,
  };
  if (!isQuickbooksConfigured()) return base;

  try {
    const company = await qboGet<{ CompanyInfo?: { CompanyName?: string; LegalName?: string } }>(
      `/companyinfo/${getQuickbooksRealmId()}`,
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

function requireCustomerRate(load: LoadView): number {
  if (load.rate == null || Number.isNaN(load.rate)) {
    throw new Error("Set a customer rate before invoicing.");
  }
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
  if (load.driver_type === "owner_operator") {
    parts.push(
      "Owner-operator pay is settled outside QuickBooks. This invoice bills the customer rate only.",
    );
  }
  return parts.join("\n");
}

async function createLiveInvoice(
  load: LoadView,
  preview: QboInvoicePreview,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const customerId = await findOrCreateCustomer(preview.customerName);
  const itemId = await findOrCreateLineHaulItem();
  const docNumber = uniqueDocNumber(load);
  const payload = {
    DocNumber: docNumber,
    TxnDate: preview.txnDate,
    CustomerRef: { value: customerId },
    PrivateNote: preview.memo.slice(0, 4000),
    CustomerMemo: { value: preview.memo.slice(0, 1000) },
    Line: [
      {
        Amount: preview.amount,
        DetailType: "SalesItemLineDetail",
        Description: `${preview.loadNumber} ${preview.lane}`,
        SalesItemLineDetail: {
          ItemRef: { value: itemId, name: LINE_HAUL_ITEM_NAME },
          Qty: 1,
          UnitPrice: preview.amount,
        },
      },
    ],
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

async function findOrCreateCustomer(name: string): Promise<string> {
  const displayName = name.trim().slice(0, 500);
  const existing = await qboQuery<{ Customer?: Array<{ Id?: string; DisplayName?: string }> }>(
    `select * from Customer where DisplayName = '${escapeQboString(displayName)}'`,
    "customer query",
  );
  const found = existing.QueryResponse?.Customer?.[0]?.Id;
  if (found) return found;

  const created = await qboPost<{ Customer?: { Id?: string } }>(
    "/customer",
    { DisplayName: displayName },
    "customer create",
  );
  const id = created.Customer?.Id;
  if (!id) throw new Error("QuickBooks did not return a customer id.");
  return id;
}

async function findOrCreateLineHaulItem(): Promise<string> {
  const named = await qboQuery<{ Item?: Array<{ Id?: string; Name?: string }> }>(
    `select * from Item where Name = '${escapeQboString(LINE_HAUL_ITEM_NAME)}'`,
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
      Name: LINE_HAUL_ITEM_NAME,
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

function apiBase(): string {
  const realmId = getQuickbooksRealmId();
  if (!realmId) throw new Error("QUICKBOOKS_REALM_ID is not set.");
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
  const refreshToken = readStoredRefreshToken() || getQuickbooksRefreshToken();
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
    writeStoredRefreshToken(payload.refresh_token);
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

function readStoredRefreshToken(): string | undefined {
  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ refreshTokenPath(), "utf8");
    const parsed = JSON.parse(raw) as { refresh_token?: string };
    const token = typeof parsed.refresh_token === "string" ? parsed.refresh_token.trim() : "";
    return token || undefined;
  } catch {
    return undefined;
  }
}

function writeStoredRefreshToken(token: string): void {
  const filePath = refreshTokenPath();
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(filePath), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ filePath, `${JSON.stringify({ refresh_token: token, updated_at: new Date().toISOString() })}\n`, {
    mode: 0o600,
  });
}

function qboStatusMessage(status: number, context: string): string {
  if (status === 401 || status === 403) {
    return `QuickBooks ${context} failed (${status}). Re-authorize in the Intuit OAuth 2.0 Playground and update QUICKBOOKS_REFRESH_TOKEN.`;
  }
  if (status === 429) return `QuickBooks rate-limited the ${context} request. Try again shortly.`;
  return `QuickBooks ${context} failed (${status}).`;
}

function publicQboError(error: unknown): string {
  if (error instanceof QboHttpError) return error.message;
  if (error instanceof Error) return error.message;
  return "QuickBooks request failed.";
}
