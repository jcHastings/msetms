import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getQuickbooksClientId,
  getQuickbooksBillExpenseAccountId,
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
  markQboInvoice,
} from "../queries";
import { labelForPayCategory } from "../load-page-shared";
import { customerInvoiceBillableItems, resolveCustomerLumper } from "../pay-items";
import { isBillableStatus, isOwnerOperator, type LoadView } from "../types";

const MINOR_VERSION = "75";
const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const LINE_HAUL_ITEM_NAME = "Line Haul";
/** QuickBooks Invoice.DocNumber max length. Never truncate a load number to fit. */
export const QBO_DOC_NUMBER_MAX = 21;
/** MS Express is in Hastings, NE. Invoice and bill dates use the company's calendar day. */
const COMPANY_TIME_ZONE = "America/Chicago";
const SANDBOX_API_HOST = "https://sandbox-quickbooks.api.intuit.com";
const PRODUCTION_API_HOST = "https://quickbooks.api.intuit.com";

let lastDemoInvoiceStamp = 0;

function uniqueDemoInvoiceStamp(): number {
  const next = Math.max(Date.now(), lastDemoInvoiceStamp + 1);
  lastDemoInvoiceStamp = next;
  return next;
}

export type QboInvoiceLine = {
  /** TMS pay category used to look up Accounting > QuickBooks > Map Pay Items. Line Haul = flat_rate. */
  category: string;
  name: string;
  description: string;
  amount: number;
  /** Per-unit lines (e.g. 812 miles at $2.45) keep their quantity and rate. Flat lines are 1 x amount. */
  qty: number;
  unitPrice: number;
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
  intuitTid: string;
  constructor(status: number, context: string, intuitTid = "") {
    super(`${qboStatusMessage(status, context)}${intuitTid ? ` Intuit ref ${intuitTid}.` : ""}`);
    this.name = "QboHttpError";
    this.status = status;
    this.intuitTid = intuitTid;
  }
}

/** Log a failed Intuit call with its intuit_tid for support. Never logs tokens, bodies, or keys. */
function qboFailure(response: Response, context: string): QboHttpError {
  const tid = response.headers.get("intuit_tid") ?? "";
  console.error(`[qbo] ${context} failed status=${response.status}${tid ? ` intuit_tid=${tid}` : ""}`);
  return new QboHttpError(response.status, context, tid);
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
    customerNeedsQbo: !String(customer?.qbo_customer_id ?? "").trim(),
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

/**
 * Same lines as the TMS invoice PDF: Flat Rate pay items (or the load rate as Line Haul), then customer extras.
 * Lumper is one amount, shared with the PDF. Fuel surcharge is only a manual pay line (its own item, never Line Haul).
 * A cancelled load can only bill its TONU lines.
 */
export function buildInvoiceLines(load: LoadView): QboInvoiceLine[] {
  const lumper = resolveCustomerLumper(load);
  if (!lumper.ok) throw new Error(lumper.message);
  const payItems = customerInvoiceBillableItems(load.id);
  const lane = `${load.origin} → ${load.destination}`;
  const qboLine = (item: {
    category: string;
    payee: string;
    notes: string;
    total: number | null;
    qty: number | null;
    rate: number | null;
  }): QboInvoiceLine => {
    const amount = roundMoney(item.total ?? 0);
    const qty = item.qty ?? 1;
    const perUnit =
      item.rate != null && qty > 0 && qty !== 1 && Math.abs(roundMoney(item.rate * qty) - amount) < 0.005;
    return {
      category: item.category,
      name: labelForPayCategory(item.category),
      description: [load.load_number, item.payee, item.notes].filter(Boolean).join(" · "),
      amount,
      qty: perUnit ? qty : 1,
      unitPrice: perUnit ? (item.rate as number) : amount,
    };
  };
  if (load.status === "cancelled") {
    return payItems.filter((item) => item.category === "tonu").map(qboLine);
  }
  const flats = payItems.filter((item) => item.category === "flat_rate");
  const extras = payItems.filter((item) => item.category !== "flat_rate");
  const lines: QboInvoiceLine[] = [];
  if (flats.length) {
    lines.push(...flats.map(qboLine));
  } else {
    const rate = customerBilledRate(load);
    if (rate != null) {
      lines.push({
        category: "flat_rate",
        name: LINE_HAUL_ITEM_NAME,
        description: `${load.load_number} ${lane}`,
        amount: rate,
        qty: 1,
        unitPrice: rate,
      });
    }
  }
  lines.push(...extras.map(qboLine));
  if (lumper.mode === "actual") {
    lines.push({
      category: "lumper",
      name: labelForPayCategory("lumper"),
      description: load.load_number,
      amount: lumper.amount,
      qty: 1,
      unitPrice: lumper.amount,
    });
  }
  return lines;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
  const payload = buildBillPayload(bill, listQboVendorMaps());
  const created = await qboPost<{ Bill?: { Id?: string } }>("/bill", payload, "bill create");
  const id = created.Bill?.Id;
  if (!id) throw new Error("QuickBooks did not return a bill id.");
  markQboBill(bill.id, id);
  return { billId: id, source: "quickbooks" };
}

/**
 * Vendor must be mapped. Expense account: the vendor's own account from Map Vendors (e.g. owner-operator
 * settlements vs fuel), else QBO_BILL_EXPENSE_ACCOUNT_ID. Never the first Expense account in the chart.
 */
export function buildBillPayload(
  bill: { id: number; vendor: string; memo: string; amount: number; load_id: number | null; created_at: string },
  vendorMaps: Array<{ payee: string; qbo_vendor_id: string; qbo_expense_account_id?: string }>,
): Record<string, unknown> {
  const mapped = vendorMaps.find((row) => row.payee === bill.vendor);
  const vendorId = mapped?.qbo_vendor_id?.trim() ?? "";
  if (!vendorId) {
    throw new Error(
      `Map this vendor first: ${bill.vendor.trim() || "this vendor"}. Accounting → QuickBooks → Map Vendors.`,
    );
  }
  const expenseId = mapped?.qbo_expense_account_id?.trim() || billExpenseAccountId();
  const loadNumber = bill.load_id ? getLoad(bill.load_id)?.load_number ?? "" : "";
  const memo = bill.memo.trim();
  const privateNote = [`MSETMS bill ${bill.id}`, loadNumber ? `Load ${loadNumber}` : "", memo]
    .filter(Boolean)
    .join(" · ");
  return {
    VendorRef: { value: vendorId },
    TxnDate: invoiceDate(bill.created_at),
    PrivateNote: privateNote.slice(0, 4000),
    Line: [
      {
        Amount: roundMoney(bill.amount),
        DetailType: "AccountBasedExpenseLineDetail",
        Description: (memo || `Bill ${bill.id}`).slice(0, 4000),
        AccountBasedExpenseLineDetail: { AccountRef: { value: expenseId } },
      },
    ],
  };
}

/** Never guess: the first Expense account in a chart of accounts is arbitrary (sandbox: "Accounting"). */
function billExpenseAccountId(): string {
  const id = getQuickbooksBillExpenseAccountId()?.trim();
  if (!id) {
    throw new Error("Set the QuickBooks expense account for bills (QBO_BILL_EXPENSE_ACCOUNT_ID) before sending bills.");
  }
  return id;
}

export async function sendLoadToQuickbooks(
  loadId: number,
  options: { confirmResend?: boolean } = {},
): Promise<QboSendResult> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const cancelled = load.status === "cancelled";
  if (!isBillableStatus(load.status) && !cancelled) {
    throw new Error("Mark the load Delivered before sending an invoice.");
  }
  if (load.qbo_invoice_id && !options.confirmResend) {
    throw new Error("This load was already sent to QuickBooks. Confirm to update that invoice.");
  }
  const preview = previewQuickbooksInvoice(load);
  if (cancelled && !preview.lines.length) {
    throw new Error(QBO_CANCELLED_MESSAGE);
  }
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

  const { getCompanySettings } = await import("../settings");
  const { invoiceIssuerProblems, invoiceIssuerWarning } = await import("../carrier-identity");
  const issuerWarning = invoiceIssuerWarning(invoiceIssuerProblems(getCompanySettings()));
  if (issuerWarning) {
    throw new Error(issuerWarning.replace("Invoices cannot be emailed", "Invoices cannot be sent to QuickBooks"));
  }
  const live = await createOrUpdateLiveInvoice(load, preview);
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

export const QBO_CANCELLED_MESSAGE =
  "This load is cancelled. Only a TONU can be invoiced: add a customer TONU pay item. If an invoice already went to QuickBooks, void it there.";

function assertCustomerInvoiceReady(preview: QboInvoicePreview): void {
  if (!preview.lines.length || preview.amount <= 0) {
    throw new Error(QBO_MISSING_RATE_MESSAGE);
  }
}

function customerBilledRate(load: LoadView): number | null {
  if (load.rate == null || Number.isNaN(load.rate) || load.rate <= 0) return null;
  return load.rate;
}

/** Calendar day for TxnDate. TMS times are local wall-clock ("2026-09-14T17:00:00"): keep that day, never shift through UTC. */
export function invoiceDate(value: string): string {
  const raw = String(value ?? "").trim();
  const wallClock = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/);
  if (wallClock) return wallClock[1];
  const date = new Date(raw);
  return companyDay(Number.isNaN(date.getTime()) ? new Date() : date);
}

function companyDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Customer-visible invoice message: load, lane, and the customer's own references only. No internal notes. */
function buildMemo(load: LoadView): string {
  const parts = [`Load ${load.load_number}`, `${load.origin} → ${load.destination}`];
  const customerRef = String(load.customer_reference ?? "").trim();
  if (customerRef) parts.push(`Customer ref: ${customerRef}`);
  if (load.reference_number) parts.push(`Ref: ${load.reference_number}`);
  if (load.po_number) parts.push(`PO: ${load.po_number}`);
  return parts.join("\n");
}

/** QuickBooks private note (office only). Still no dispatch notes, special instructions, or appointment text. */
function buildPrivateNote(load: LoadView): string {
  const parts = [`MSETMS load ${load.load_number}`, `TMS id ${load.id}`];
  if (load.reference_number) parts.push(`Ref: ${load.reference_number}`);
  if (isOwnerOperator(load.driver_type)) parts.push("Customer invoice only. Owner-operator pay is settled separately.");
  return parts.join(" · ");
}

type QboInvoiceRecord = { Id?: string; SyncToken?: string; DocNumber?: string; TotalAmt?: number; Balance?: number };

/** MS Express load number, unchanged. Refuses rather than cutting a number QuickBooks cannot store. */
export function quickbooksDocNumber(loadNumber: string): string {
  const doc = String(loadNumber ?? "").trim();
  if (!doc) throw new Error("This load has no MS Express load number, so nothing was sent.");
  if (doc.length > QBO_DOC_NUMBER_MAX) {
    throw new Error(
      `QuickBooks invoice numbers are limited to ${QBO_DOC_NUMBER_MAX} characters. MS Express load # ${doc} is ${doc.length} characters, so nothing was sent. It was not shortened.`,
    );
  }
  return doc;
}

/**
 * New load: create the invoice with DocNumber = the MS Express load number (never the customer ref, PO, or broker number).
 * Refuses if that number is longer than QuickBooks allows, instead of shortening it.
 * Already sent: update the same QuickBooks invoice in place (sparse update, lines replaced). Never a second invoice.
 * Every customer, term, and item is resolved before anything is written.
 */
async function createOrUpdateLiveInvoice(
  load: LoadView,
  preview: QboInvoicePreview,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const docNumber = quickbooksDocNumber(load.load_number);
  const customerId = await resolveQboCustomer(load);
  const salesTerm = await resolveSalesTermRef(load);
  const linePayload = [];
  for (const line of preview.lines) {
    const itemId = await resolveInvoiceItemId(line);
    linePayload.push({
      Amount: line.amount,
      DetailType: "SalesItemLineDetail",
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId, name: line.name },
        Qty: line.qty,
        UnitPrice: line.unitPrice,
      },
    });
  }
  const payload: Record<string, unknown> = {
    DocNumber: docNumber,
    TxnDate: preview.txnDate,
    CustomerRef: { value: customerId },
    PrivateNote: buildPrivateNote(load).slice(0, 4000),
    CustomerMemo: { value: preview.memo.slice(0, 1000) },
    Line: linePayload,
  };
  if (salesTerm) payload.SalesTermRef = salesTerm;

  const existingId = load.qbo_source === "quickbooks" ? load.qbo_invoice_id.trim() : "";
  if (existingId) {
    let current: QboInvoiceRecord | undefined;
    try {
      current = (await qboGet<{ Invoice?: QboInvoiceRecord }>(`/invoice/${encodeURIComponent(existingId)}`, "invoice read"))
        .Invoice;
    } catch (error) {
      throw new Error(
        `Could not read QuickBooks invoice ${existingId}, so nothing was sent. ${publicQboError(error)} If it was deleted in QuickBooks, ask an administrator to clear the link on this load.`,
      );
    }
    if (!current?.Id || current.SyncToken == null) {
      throw new Error(`QuickBooks invoice ${existingId} was not found, so nothing was sent.`);
    }
    if (typeof current.Balance === "number" && typeof current.TotalAmt === "number" && current.Balance < current.TotalAmt) {
      throw new Error(
        `QuickBooks invoice ${current.DocNumber || existingId} already has a payment applied, so nothing was sent. Adjust it in QuickBooks (credit memo) instead.`,
      );
    }
    const updated = await qboPost<{ Invoice?: QboInvoiceRecord }>(
      "/invoice",
      { ...payload, Id: current.Id, SyncToken: current.SyncToken, sparse: true },
      "invoice update",
    );
    return {
      invoiceId: updated.Invoice?.Id || current.Id,
      invoiceNumber: updated.Invoice?.DocNumber || docNumber,
    };
  }

  const clash = await qboQuery<{ Invoice?: QboInvoiceRecord[] }>(
    `select Id, DocNumber from Invoice where DocNumber = '${escapeQboString(docNumber)}'`,
    "invoice number check",
  );
  const clashId = clash.QueryResponse?.Invoice?.[0]?.Id;
  if (clashId) {
    throw new Error(
      `QuickBooks already has invoice #${docNumber} (id ${clashId}). Nothing was sent. Check it in QuickBooks before sending this load.`,
    );
  }
  const created = await qboPost<{ Invoice?: QboInvoiceRecord }>("/invoice", payload, "invoice create");
  const invoiceId = created.Invoice?.Id;
  if (!invoiceId) {
    throw new Error("QuickBooks did not return an invoice id.");
  }
  return {
    invoiceId,
    invoiceNumber: created.Invoice?.DocNumber || docNumber,
  };
}

/** Customer payment terms -> QuickBooks Term by exact name. Blank = the QuickBooks customer's default terms. */
async function resolveSalesTermRef(load: LoadView): Promise<{ value: string } | undefined> {
  const terms = String(getCustomer(load.customer_id)?.payment_terms ?? "").trim();
  if (!terms) return undefined;
  const found = await qboQuery<{ Term?: Array<{ Id?: string; Name?: string }> }>(
    `select * from Term where Name = '${escapeQboString(terms)}'`,
    "terms query",
  );
  const id = found.QueryResponse?.Term?.[0]?.Id;
  if (id) return { value: id };
  throw new Error(
    `Customer terms "${terms}" are not set up in QuickBooks. Add that term in QuickBooks or fix the customer's payment terms, then send again.`,
  );
}

async function resolveQboCustomer(load: LoadView): Promise<string> {
  const mapped = getCustomer(load.customer_id);
  const id = mapped?.qbo_customer_id?.trim() ?? "";
  if (id) return id;
  if (load.customer_id) markCustomerNeedsQbo(load.customer_id);
  const displayName = load.customer_name.trim() || "this customer";
  throw new Error(
    `Map this customer first: ${displayName}. Accounting → QuickBooks → Map Customers. Several TMS customers can share one QuickBooks customer.`,
  );
}

/**
 * Pay item -> QBO Item: 1) Accounting > QuickBooks > Map Pay Items (by TMS category; Line Haul uses flat_rate),
 * 2) a QBO Item with the exact same name. Never falls back to an arbitrary Service item and never creates items,
 * so revenue cannot land on the wrong income account.
 */
async function resolveInvoiceItemId(line: Pick<QboInvoiceLine, "category" | "name">): Promise<string> {
  const { listQboItemMaps } = await import("../accounting-desk");
  const mapped = listQboItemMaps().find((row) => row.category === line.category && row.qbo_item_id.trim());
  if (mapped) return mapped.qbo_item_id.trim();
  const named = await qboQuery<{ Item?: Array<{ Id?: string; Name?: string }> }>(
    `select * from Item where Name = '${escapeQboString(line.name)}'`,
    "item query",
  );
  const namedId = named.QueryResponse?.Item?.[0]?.Id;
  if (namedId) return namedId;
  throw new Error(
    `Map pay item "${line.name}" to a QuickBooks item in Accounting > QuickBooks > Map Pay Items, then send again.`,
  );
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
  return `${apiHost()}/v3/company/${realmId}`;
}

function apiHost(): string {
  return getQuickbooksEnvironment() === "production" ? PRODUCTION_API_HOST : SANDBOX_API_HOST;
}

/** Where API calls would go right now. Names only, no tokens. Used by the sandbox campaign guard. */
export function quickbooksApiTarget(): { host: string; realmId: string; environment: "sandbox" | "production" } {
  return { host: apiHost(), realmId: resolveRealmId() ?? "", environment: getQuickbooksEnvironment() };
}

const CAMPAIGN_READ_ENTITIES = ["invoice", "bill", "item", "account", "customer", "vendor", "term", "companyinfo"] as const;
export type QboCampaignEntity = (typeof CAMPAIGN_READ_ENTITIES)[number];

/** Read-only GET of one entity for read-back checks. */
export async function readQboEntity<T = Record<string, unknown>>(entity: QboCampaignEntity, id: string): Promise<T> {
  if (!CAMPAIGN_READ_ENTITIES.includes(entity)) throw new Error("Unsupported QuickBooks entity.");
  return qboGet<T>(`/${entity}/${encodeURIComponent(id)}`, `${entity} read`);
}

/**
 * Sandbox-only cleanup for the mapping campaign: voids a test invoice or deletes a test bill, and only when the
 * document carries the campaign label. Refuses in production.
 */
export async function cleanupQboCampaignDoc(entity: "invoice" | "bill", id: string, label: string): Promise<void> {
  assertSandboxCampaign();
  if (!label.trim()) throw new Error("Campaign label is required.");
  const key = entity === "invoice" ? "Invoice" : "Bill";
  const doc = (await readQboEntity<Record<string, Record<string, unknown>>>(entity, id))[key] ?? {};
  const text = `${String(doc.DocNumber ?? "")} ${String(doc.PrivateNote ?? "")}`;
  if (!text.includes(label)) throw new Error(`${key} ${id} is not a campaign document. Left as is.`);
  const operation = entity === "invoice" ? "void" : "delete";
  await qboRequest(
    `${apiBase()}/${entity}?operation=${operation}&minorversion=${MINOR_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Id: id, SyncToken: String(doc.SyncToken ?? "0") }),
    },
    `${entity} ${operation}`,
  );
}

function assertSandboxCampaign(): void {
  if (getQuickbooksEnvironment() !== "sandbox" || apiHost() !== SANDBOX_API_HOST) {
    throw new Error("The mapping campaign only runs against the QuickBooks sandbox.");
  }
}

/** Read-only QuickBooks query for campaign read-back. Only SELECT statements. */
export async function queryQboReadOnly<T = Record<string, unknown>>(query: string): Promise<QueryEnvelope<T>> {
  if (!/^\s*select\s/i.test(query)) throw new Error("Only read-only select queries are allowed.");
  return qboQuery<T>(query, "campaign query");
}

export const QBO_CAMPAIGN_FIXTURE_PREFIX = "MSETMS Test";

/**
 * Sandbox-only fixture create for the mapping campaign (test income/expense accounts, items, customer, vendors).
 * The name must start with "MSETMS Test" so nothing real is ever touched. Refuses in production.
 */
export async function createQboCampaignFixture(
  entity: "account" | "item" | "customer" | "vendor",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertSandboxCampaign();
  const name = String(body.Name ?? body.DisplayName ?? "");
  if (!name.startsWith(QBO_CAMPAIGN_FIXTURE_PREFIX)) {
    throw new Error(`Campaign fixtures must be named "${QBO_CAMPAIGN_FIXTURE_PREFIX} …".`);
  }
  const key = entity.charAt(0).toUpperCase() + entity.slice(1);
  const created = await qboPost<Record<string, Record<string, unknown>>>(`/${entity}`, body, `${entity} fixture`);
  return created[key] ?? {};
}

/** Expense-classified accounts (incl. cost of goods sold) for Map Vendors. Read-only. */
export async function listQboExpenseAccounts(): Promise<QboNamedRef[]> {
  if (!hasQuickbooksSession()) return [];
  try {
    const result = await qboQuery<{
      Account?: Array<{ Id?: string; Name?: string; FullyQualifiedName?: string; Classification?: string; Active?: boolean }>;
    }>("select * from Account maxresults 1000", "account list");
    return (result.QueryResponse?.Account ?? [])
      .filter((row) => row.Classification === "Expense" && row.Active !== false)
      .map((row) => ({ id: String(row.Id ?? "").trim(), name: String(row.FullyQualifiedName || row.Name || "").trim() }))
      .filter((row) => row.id);
  } catch {
    return [];
  }
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
    throw qboFailure(response, context);
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
    // 400 invalid_grant = refresh token expired or revoked: the office must reconnect.
    throw qboFailure(response, "token refresh");
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

/**
 * Disconnect: revoke the refresh token at Intuit (best effort), then delete the stored token file.
 * The local file is removed even when Intuit cannot be reached.
 */
export async function disconnectQuickbooks(): Promise<{ revoked: boolean }> {
  const refreshToken = resolveRefreshToken();
  const clientId = getQuickbooksClientId();
  const clientSecret = getQuickbooksClientSecret();
  let revoked = false;
  if (refreshToken && clientId && clientSecret) {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: refreshToken }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      revoked = response.ok;
      if (!response.ok) qboFailure(response, "token revoke");
    } catch {
      revoked = false;
    }
  }
  clearStoredQuickbooksTokens();
  return { revoked };
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
    throw qboFailure(response, "OAuth connect");
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
  if (status === 401 || status === 403 || (status === 400 && context === "token refresh")) {
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
