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
  markCustomerQboMapped,
  markQboInvoice,
} from "../queries";
import { labelForPayCategory } from "../load-page-shared";
import {
  accountProblem,
  billAccountName,
  DEFAULT_LOAD_PAY_ACCOUNT,
  INVOICE_RULES,
  itemMissingMessage,
  MANAGEMENT_GROUP_CUSTOMER_ID,
  MANAGEMENT_GROUP_MESSAGE,
  MS_EXPRESS_CUSTOMER_ID,
  MS_EXPRESS_CUSTOMER_MESSAGE,
  NOT_BILLED_ON_INVOICE,
  notBilledMessage,
  type BillSplitLine,
  type ResolvedAccount,
} from "../qbo-production-map";
import { customerInvoiceBillableItems, resolveCustomerLumper } from "../pay-items";
import { isBillableStatus, isOwnerOperator, type LoadView } from "../types";

const MINOR_VERSION = "75";
const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const LINE_HAUL_ITEM_NAME = "Line Haul";
/** QuickBooks CustomerMemo limit. The load number is not a DocNumber, so the old 21-character refusal does not apply. */
export const QBO_CUSTOMER_MEMO_MAX = 1000;
/** Seven-digit invoice numbers in MS Express's existing sequence, from 1006000 upward. */
export const QBO_DOC_SEQUENCE_FLOOR = 1_006_000;
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

type CatalogItem = { id: string; name: string; incomeAccountId: string };

let accountsById: Map<string, ResolvedAccount> | null = null;
let accountsByName: Map<string, ResolvedAccount> | null = null;
let itemIdByName: Map<string, string> | null = null;

/** Drop cached account and item ids. The next send reads the company again. */
export function clearQboCatalogCache(): void {
  accountsById = null;
  accountsByName = null;
  itemIdByName = null;
}

export function resetQuickbooksForTests(): void {
  cachedAccess = null;
  clearQboCatalogCache();
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
  const payload = await buildBillPayload(bill, listQboVendorMaps());
  const created = await qboPost<{ Bill?: { Id?: string } }>("/bill", payload, "bill create");
  const id = created.Bill?.Id;
  if (!id) throw new Error("QuickBooks did not return a bill id.");
  markQboBill(bill.id, id);
  return { billId: id, source: "quickbooks" };
}

type BillForPayload = {
  id: number;
  vendor: string;
  memo: string;
  amount: number;
  load_id: number | null;
  created_at: string;
  lines_json?: string;
};

/**
 * Vendor: the Map Vendors row, else one exact DisplayName match (stored for next time). Never created.
 * A single-amount bill uses the vendor's expense account, else QBO_BILL_EXPENSE_ACCOUNT_ID, else
 * Owner Operators:Owner Operators COL. Split lines use the decision accounts and ignore those overrides.
 */
export async function buildBillPayload(
  bill: BillForPayload,
  vendorMaps: Array<{ payee: string; qbo_vendor_id: string; qbo_expense_account_id?: string }>,
): Promise<Record<string, unknown>> {
  const vendor = await resolveBillVendor(bill.vendor, vendorMaps);
  const splits = parseBillSplits(bill.lines_json);
  const loadNumber = bill.load_id ? getLoad(bill.load_id)?.load_number ?? "" : "";
  const memo = bill.memo.trim();
  const privateNote = [`MSETMS bill ${bill.id}`, loadNumber ? `Load ${loadNumber}` : "", memo]
    .filter(Boolean)
    .join(" · ");
  const lines = splits.length
    ? await splitBillLines(splits, bill.vendor, memo)
    : [await singleBillLine(bill, vendor.expenseId, memo)];
  return {
    VendorRef: { value: vendor.vendorId },
    TxnDate: invoiceDate(bill.created_at),
    PrivateNote: privateNote.slice(0, 4000),
    Line: lines,
  };
}

function parseBillSplits(linesJson: string | undefined): BillSplitLine[] {
  const raw = String(linesJson ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as BillSplitLine[];
  return Array.isArray(parsed) ? parsed : [];
}

async function resolveBillVendor(
  vendorName: string,
  vendorMaps: Array<{ payee: string; qbo_vendor_id: string; qbo_expense_account_id?: string }>,
): Promise<{ vendorId: string; expenseId: string }> {
  const mapped = vendorMaps.find((row) => row.payee === vendorName);
  const mappedId = mapped?.qbo_vendor_id?.trim() ?? "";
  if (mappedId) {
    return { vendorId: mappedId, expenseId: mapped?.qbo_expense_account_id?.trim() ?? "" };
  }
  const name = vendorName.trim() || "this vendor";
  const found = await qboQuery<{ Vendor?: Array<{ Id?: string; DisplayName?: string }> }>(
    `select Id, DisplayName from Vendor where DisplayName = '${escapeQboString(vendorName.trim())}'`,
    "vendor query",
  );
  const rows = (found.QueryResponse?.Vendor ?? []).filter((row) => String(row.Id ?? "").trim());
  if (rows.length > 1) {
    throw new Error(`More than one QuickBooks vendor is named "${name}". Pick one in Map Vendors. Nothing was sent.`);
  }
  const id = String(rows[0]?.Id ?? "").trim();
  if (!id) {
    throw new Error(`Map this vendor first: ${name}. Accounting → QuickBooks → Map Vendors.`);
  }
  const { upsertQboVendorMap } = await import("../accounting-desk");
  upsertQboVendorMap(vendorName.trim(), id, String(rows[0]?.DisplayName ?? name));
  return { vendorId: id, expenseId: "" };
}

async function accountIdByName(name: string): Promise<string> {
  const account = await accountByName(name);
  if (!account) {
    throw new Error(`QuickBooks account "${name}" is not in this company. Nothing was sent.`);
  }
  return account.id;
}

async function singleBillLine(
  bill: BillForPayload,
  vendorExpenseId: string,
  memo: string,
): Promise<Record<string, unknown>> {
  const accountId = vendorExpenseId || getQuickbooksBillExpenseAccountId()?.trim() || (await accountIdByName(DEFAULT_LOAD_PAY_ACCOUNT));
  return {
    Amount: roundMoney(bill.amount),
    DetailType: "AccountBasedExpenseLineDetail",
    Description: (memo || `Bill ${bill.id}`).slice(0, 4000),
    AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
  };
}

async function splitBillLines(lines: BillSplitLine[], vendorName: string, memo: string): Promise<Record<string, unknown>[]> {
  const payload = [];
  for (const line of lines) {
    const accountName = billAccountName(line.kind, vendorName);
    payload.push({
      Amount: roundMoney(line.amount),
      DetailType: "AccountBasedExpenseLineDetail",
      Description: (line.description || memo || line.kind).slice(0, 4000),
      AccountBasedExpenseLineDetail: { AccountRef: { value: await accountIdByName(accountName) } },
    });
  }
  return payload;
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
      invoiceNumber: "",
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
    invoiceNumber: live.invoiceNumber,
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
    await warmQboCatalog();
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

/** Customer-visible invoice message: MS Express load #, customer ref, lane, and the customer's own references. No internal notes. */
function buildMemo(load: LoadView): string {
  const customerRef = String(load.customer_reference ?? "").trim();
  const head = customerRef
    ? `MS Express load ${load.load_number} · Customer ref ${customerRef}`
    : `MS Express load ${load.load_number}`;
  const parts = [head, `${load.origin} → ${load.destination}`];
  if (load.reference_number) parts.push(`Ref: ${load.reference_number}`);
  if (load.po_number) parts.push(`PO: ${load.po_number}`);
  return parts.join("\n").slice(0, QBO_CUSTOMER_MEMO_MAX);
}

/** QuickBooks private note (office only). Still no dispatch notes, special instructions, or appointment text. */
function buildPrivateNote(load: LoadView): string {
  const parts = [`MSETMS load ${load.load_number}`, `TMS id ${load.id}`];
  if (load.reference_number) parts.push(`Ref: ${load.reference_number}`);
  if (isOwnerOperator(load.driver_type)) parts.push("Customer invoice only. Owner-operator pay is settled separately.");
  return parts.join(" · ");
}

type QboInvoiceRecord = { Id?: string; SyncToken?: string; DocNumber?: string; TotalAmt?: number; Balance?: number };

const SEVEN_DIGIT_DOC = /^\d{7}$/;

/**
 * Next MS Express invoice number: max existing 7-digit DocNumber at or above 1006000, plus one.
 * Ignores load numbers (MSE-1055) and anything below the 1006 sequence. Never skips into that format.
 */
export function nextSequenceDocNumber(docNumbers: Iterable<string>): string {
  let max = 0;
  for (const raw of docNumbers) {
    const value = String(raw ?? "").trim();
    if (!SEVEN_DIGIT_DOC.test(value)) continue;
    const parsed = Number(value);
    if (parsed >= QBO_DOC_SEQUENCE_FLOOR && parsed > max) max = parsed;
  }
  if (!max) {
    throw new Error("No QuickBooks invoice number in the 1006 sequence was found, so nothing was sent.");
  }
  if (max >= 9_999_999) {
    throw new Error("QuickBooks invoice numbers in the 1006 sequence stop at 9999999. Nothing was sent.");
  }
  return String(max + 1);
}

/**
 * New invoice: local refusals, then customer, terms, and every item. DocNumber is chosen last.
 * Custom transaction numbers off: omit DocNumber and let QuickBooks assign it.
 * Custom transaction numbers on: TMS assigns the next 1006 number, re-checks it, and retries once.
 * Already sent: sparse-update that same invoice and keep its DocNumber. Never a second number.
 */
async function createOrUpdateLiveInvoice(
  load: LoadView,
  preview: QboInvoicePreview,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  refuseUnbilledLines(preview.lines);
  const customerId = await resolveQboCustomer(load);
  const salesTerm = await resolveSalesTermRef(load);
  const linePayload = await resolveInvoiceLines(preview.lines);
  const payload: Record<string, unknown> = {
    TxnDate: preview.txnDate,
    CustomerRef: { value: customerId },
    PrivateNote: buildPrivateNote(load).slice(0, 4000),
    CustomerMemo: { value: preview.memo.slice(0, QBO_CUSTOMER_MEMO_MAX) },
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
    const kept = String(current.DocNumber ?? "").trim();
    if (kept) payload.DocNumber = kept;
    const updated = await qboPost<{ Invoice?: QboInvoiceRecord }>(
      "/invoice",
      { ...payload, Id: current.Id, SyncToken: current.SyncToken, sparse: true },
      "invoice update",
    );
    return {
      invoiceId: updated.Invoice?.Id || current.Id,
      invoiceNumber: String(updated.Invoice?.DocNumber || kept).trim(),
    };
  }

  const docNumber = await assignCreateDocNumber();
  if (docNumber) payload.DocNumber = docNumber;
  const created = await qboPost<{ Invoice?: QboInvoiceRecord }>("/invoice", payload, "invoice create");
  const invoiceId = created.Invoice?.Id;
  if (!invoiceId) {
    throw new Error("QuickBooks did not return an invoice id.");
  }
  const invoiceNumber = String(created.Invoice?.DocNumber ?? "").trim();
  if (!invoiceNumber) {
    markQboInvoice(load.id, {
      invoiceId,
      invoiceNumber: "",
      source: "quickbooks",
      sentAt: new Date().toISOString(),
    });
    throw new Error(
      "QuickBooks created the invoice but did not assign an invoice number. The link was saved so a retry updates that invoice instead of creating another one.",
    );
  }
  return { invoiceId, invoiceNumber };
}

async function customTxnNumbersOn(): Promise<boolean> {
  const result = await qboQuery<{
    Preferences?:
      | { SalesFormsPrefs?: { CustomTxnNumbers?: boolean } }
      | Array<{ SalesFormsPrefs?: { CustomTxnNumbers?: boolean } }>;
  }>("select * from Preferences", "preferences");
  const prefs = result.QueryResponse?.Preferences;
  const row = Array.isArray(prefs) ? prefs[0] : prefs;
  return row?.SalesFormsPrefs?.CustomTxnNumbers === true;
}

async function listRecentDocNumbers(): Promise<string[]> {
  const result = await qboQuery<{ Invoice?: QboInvoiceRecord[] }>(
    "select Id, DocNumber from Invoice orderby MetaData.LastUpdatedTime desc maxresults 1000",
    "invoice numbers",
  );
  return (result.QueryResponse?.Invoice ?? []).map((row) => String(row.DocNumber ?? ""));
}

async function invoiceNumberTaken(docNumber: string): Promise<boolean> {
  const clash = await qboQuery<{ Invoice?: QboInvoiceRecord[] }>(
    `select Id, DocNumber from Invoice where DocNumber = '${escapeQboString(docNumber)}'`,
    "invoice number check",
  );
  return Boolean(clash.QueryResponse?.Invoice?.[0]?.Id);
}

/** Undefined: omit DocNumber. A string: the TMS-assigned 1006 number. */
async function assignCreateDocNumber(): Promise<string | undefined> {
  if (!(await customTxnNumbersOn())) return undefined;
  let candidate = nextSequenceDocNumber(await listRecentDocNumbers());
  if (await invoiceNumberTaken(candidate)) {
    candidate = nextSequenceDocNumber(await listRecentDocNumbers());
    if (await invoiceNumberTaken(candidate)) {
      throw new Error(`QuickBooks invoice #${candidate} is already used, so nothing was sent.`);
    }
  }
  return candidate;
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
  if (load.customer_id === MS_EXPRESS_CUSTOMER_ID) {
    throw new Error(MS_EXPRESS_CUSTOMER_MESSAGE);
  }
  const mapped = getCustomer(load.customer_id);
  const stored = mapped?.qbo_customer_id?.trim() ?? "";
  if (load.customer_id === MANAGEMENT_GROUP_CUSTOMER_ID) {
    if (stored) return stored;
    throw new Error(MANAGEMENT_GROUP_MESSAGE);
  }
  if (stored) return stored;
  const displayName = (mapped?.name || load.customer_name).trim() || "this customer";
  const found = await qboQuery<{ Customer?: Array<{ Id?: string; DisplayName?: string }> }>(
    `select Id, DisplayName from Customer where DisplayName = '${escapeQboString(displayName)}'`,
    "customer query",
  );
  const rows = (found.QueryResponse?.Customer ?? []).filter((row) => String(row.Id ?? "").trim());
  if (rows.length > 1) {
    throw new Error(
      `More than one QuickBooks customer is named "${displayName}". Pick one in Map Customers. Nothing was sent.`,
    );
  }
  const id = String(rows[0]?.Id ?? "").trim();
  if (!id) {
    if (load.customer_id) markCustomerNeedsQbo(load.customer_id);
    throw new Error(
      `Map this customer first: ${displayName}. Accounting → QuickBooks → Map Customers. Several TMS customers can share one QuickBooks customer.`,
    );
  }
  if (load.customer_id) markCustomerQboMapped(load.customer_id, id);
  return id;
}

function refuseUnbilledLines(lines: QboInvoiceLine[]): void {
  for (const line of lines) {
    const label = NOT_BILLED_ON_INVOICE[line.category];
    if (label) throw new Error(notBilledMessage(label));
  }
}

async function resolveInvoiceLines(lines: QboInvoiceLine[]): Promise<Array<Record<string, unknown>>> {
  const payload = [];
  for (const line of lines) {
    const item = await resolveInvoiceItem(line);
    payload.push({
      Amount: line.amount,
      DetailType: "SalesItemLineDetail",
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: item.id, name: item.name },
        Qty: line.qty,
        UnitPrice: line.unitPrice,
      },
    });
  }
  return payload;
}

/**
 * Pay item -> QBO Item: an office override id (still checked against the decided account), else the
 * production item name. The item is read again at send time. A stale id falls through to the name.
 * A missing name is not cached, so a bookkeeper fix is seen on the next send.
 */
async function resolveInvoiceItem(line: Pick<QboInvoiceLine, "category" | "name">): Promise<CatalogItem> {
  const rule = INVOICE_RULES[line.category];
  if (!rule) {
    throw new Error(
      `Map pay item "${line.name}" to a QuickBooks item in Accounting > QuickBooks > Map Pay Items, then send again.`,
    );
  }
  const { listQboItemMaps } = await import("../accounting-desk");
  const mappedId = listQboItemMaps().find((row) => row.category === line.category)?.qbo_item_id.trim() ?? "";
  let item = mappedId ? await readItemById(mappedId) : null;
  if (!item) item = await itemByExactName(rule.itemName);
  if (!item) throw new Error(itemMissingMessage(rule));
  const account = await accountById(item.incomeAccountId);
  const problem = accountProblem(rule, item.name || rule.itemName, account);
  if (problem) throw new Error(problem);
  return item;
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

type AccountQueryRow = {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  Classification?: string;
};

async function loadAccounts(): Promise<void> {
  const result = await qboQuery<{ Account?: AccountQueryRow[] }>("select * from Account maxresults 1000", "account list");
  accountsById = new Map();
  accountsByName = new Map();
  for (const row of result.QueryResponse?.Account ?? []) {
    const id = String(row.Id ?? "").trim();
    if (!id) continue;
    const account: ResolvedAccount = {
      id,
      fullyQualifiedName: String(row.FullyQualifiedName || row.Name || "").trim(),
      accountType: String(row.AccountType ?? ""),
      classification: String(row.Classification ?? ""),
    };
    accountsById.set(id, account);
    if (account.fullyQualifiedName) accountsByName.set(account.fullyQualifiedName, account);
  }
}

async function accountById(id: string): Promise<ResolvedAccount | undefined> {
  if (!id) return undefined;
  if (!accountsById) await loadAccounts();
  if (accountsById?.has(id)) return accountsById.get(id);
  await loadAccounts();
  return accountsById?.get(id);
}

async function accountByName(name: string): Promise<ResolvedAccount | undefined> {
  if (!accountsByName) await loadAccounts();
  if (accountsByName?.has(name)) return accountsByName.get(name);
  await loadAccounts();
  return accountsByName?.get(name);
}

function catalogItem(row: { Id?: string; Name?: string; IncomeAccountRef?: { value?: string } }): CatalogItem | null {
  const id = String(row.Id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row.Name ?? "").trim(),
    incomeAccountId: String(row.IncomeAccountRef?.value ?? "").trim(),
  };
}

async function queryItems(query: string): Promise<CatalogItem[]> {
  const result = await qboQuery<{ Item?: Array<{ Id?: string; Name?: string; IncomeAccountRef?: { value?: string } }> }>(
    query,
    "item query",
  );
  return (result.QueryResponse?.Item ?? []).map(catalogItem).filter((row): row is CatalogItem => Boolean(row));
}

async function readItemById(id: string): Promise<CatalogItem | null> {
  const rows = await queryItems(`select * from Item where Id = '${escapeQboString(id)}'`);
  return rows.find((row) => row.id === id) ?? null;
}

async function itemByExactName(name: string): Promise<CatalogItem | null> {
  const cachedId = itemIdByName?.get(name);
  if (cachedId) {
    const fresh = await readItemById(cachedId);
    if (fresh) return fresh;
    itemIdByName?.delete(name);
  }
  const rows = await queryItems(`select * from Item where Name = '${escapeQboString(name)}'`);
  if (rows.length > 1) {
    throw new Error(`More than one QuickBooks item is named "${name}". Pick one in Map Pay Items. Nothing was sent.`);
  }
  const item = rows[0] ?? null;
  if (!item) return null;
  if (!itemIdByName) itemIdByName = new Map();
  itemIdByName.set(name, item.id);
  return item;
}

/** Best-effort account read at connect. A failure leaves the cache empty for the next send. */
export async function warmQboCatalog(): Promise<void> {
  if (!hasQuickbooksSession()) return;
  try {
    await loadAccounts();
  } catch {
    clearQboCatalogCache();
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

function isQboNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "status" in error && (error as { status: number }).status === 404);
}

/** Connected company id. Empty when QuickBooks is not connected. */
export function connectedQuickbooksRealmId(): string {
  return resolveRealmId() ?? "";
}

/**
 * Read one Payment. GET only. A missing payment is `{ deleted: true }` (void/delete reopen).
 * Never creates or updates a QuickBooks entity.
 */
export async function readQboPayment(
  id: string,
): Promise<{ deleted: true } | { deleted: false; payment: Record<string, unknown> }> {
  const clean = id.trim();
  if (!/^[A-Za-z0-9-]+$/.test(clean)) throw new Error("Invalid QuickBooks payment id.");
  try {
    const body = await qboGet<{ Payment?: Record<string, unknown> }>(
      `/payment/${encodeURIComponent(clean)}`,
      "payment read",
    );
    if (!body.Payment) return { deleted: true };
    return { deleted: false, payment: body.Payment };
  } catch (error) {
    if (isQboNotFound(error)) return { deleted: true };
    throw error;
  }
}

/**
 * Change-data capture for Payment only. GET only.
 * `changedSince` is the previous CDC `time` or an ISO timestamp within 30 days.
 */
export async function readQboPaymentCdc(changedSince: string): Promise<unknown> {
  const since = changedSince.trim();
  if (!since || since.length > 40 || /[^0-9A-Za-z:+.\-Z]/.test(since)) {
    throw new Error("Invalid QuickBooks change cursor.");
  }
  const url = `${apiBase()}/cdc?entities=Payment&changedSince=${encodeURIComponent(since)}&minorversion=${MINOR_VERSION}`;
  return qboRequest<unknown>(url, { method: "GET" }, "payment cdc");
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
  clearQboCatalogCache();
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
  await warmQboCatalog();
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
