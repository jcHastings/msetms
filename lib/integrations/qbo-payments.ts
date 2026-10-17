import { createHmac, timingSafeEqual } from "node:crypto";
import { loadInvoiceTotal } from "../accounting-aging";
import { getDb } from "../db";
import { getQuickbooksWebhookVerifier, qboPaymentArEmailEnabled } from "../env";
import { formatMdYFull, formatMoney } from "../format";
import { integrationErrorCode } from "../integration-log";
import { invoiceFromAddress, type OutgoingMail } from "../mail-shared";
import { getLoad } from "../queries";
import { listDispatcherUsers } from "../settings";
import { canAccessAccounting } from "../settings-shared";
import {
  connectedQuickbooksRealmId,
  hasQuickbooksSession,
  qboPaymentBasisTotal,
  readQboInvoiceDocNumber,
  readQboPayment,
  readQboPaymentCdc,
} from "./quickbooks";

/**
 * QuickBooks Payment → TMS load. Read-only toward QuickBooks: the webhook and the
 * feed-refresh CDC poll only GET a Payment, an Invoice DocNumber, or the Payment change feed.
 * One payment can cover several invoices. Each linked invoice is applied on its own.
 * A QuickBooks invoice id stored on exactly one load is applied and can mark that load paid.
 * An invoice the TMS created that does not match one load stays a Requires-attention card.
 * An invoice id no load has is an outside invoice: recorded quietly, no attention card.
 * Its DocNumber links a load only when exactly one load number matches, and only as a suggestion.
 * That suggestion never marks the load paid.
 */

export const QBO_PAYMENT_WEBHOOK_PATH = "/api/integrations/quickbooks/webhook";

const MAX_BODY_CHARS = 500_000;
const CDC_ENTITY = "Payment";
const CDC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CDC_MAX_MS = 29 * 24 * 60 * 60 * 1000;

export type QboPaymentLine = { invoiceId: string; amount: number };

export type QboPaymentSnapshot = {
  id: string;
  txnDate: string;
  totalAmt: number;
  unappliedAmt: number;
  status: "applied" | "voided" | "deleted";
  lines: QboPaymentLine[];
  /** Line amount that linked to more than one invoice. Not applied. */
  ambiguousAmt: number;
  lastUpdated: string;
};

export type QboWebhookChange = {
  realmId: string;
  id: string;
  operation: string;
};

export type QboPaymentApplyResult = {
  paymentId: string;
  status: QboPaymentSnapshot["status"];
  loadIds: number[];
  unmatchedInvoiceIds: string[];
  /** Invoice ids no TMS load has. Quiet records, not attention cards. */
  outsideInvoiceIds: string[];
  /** Loads linked by an exact DocNumber match. Display only; not marked paid. */
  suggestedLoadIds: number[];
  unappliedAmt: number;
  notified: boolean;
  emails: OutgoingMail[];
};

type OutsideDraft = {
  invoiceId: string;
  amount: number;
  docNumber: string;
  suggestedLoadId: number | null;
};

export type OutsideQboPayment = {
  qboPaymentId: string;
  qboInvoiceId: string;
  docNumber: string;
  amount: number;
  txnDate: string;
  suggestedLoadId: number | null;
  suggestedLoadNumber: string;
};

export type QboWebhookIngestResult = {
  ok: true;
  accepted: boolean;
  reason: string;
  applied: number;
  httpStatus: number;
};

type PlannedApplication = {
  invoiceId: string;
  loadId: number;
  lineAmount: number;
  applied: number;
  unapplied: number;
};

type PaymentRow = {
  qbo_payment_id: string;
  status: string;
  notified_key: string;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function intuitTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "-00:00");
}

export function intuitWebhookSignature(verifier: string, rawBody: string): string {
  return createHmac("sha256", verifier).update(rawBody, "utf8").digest("base64");
}

/** Constant-time compare of the Intuit base64 HMAC. Empty values never match. */
export function intuitSignaturesMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided.trim());
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    if (left.length > 0) timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function metaUpdated(row: Record<string, unknown>): string {
  const meta = asRecord(row.MetaData);
  return String(meta?.LastUpdatedTime ?? "").trim();
}

function parseInvoiceLines(lineField: unknown): { lines: QboPaymentLine[]; ambiguousAmt: number } {
  const rows = Array.isArray(lineField) ? lineField : [];
  const byInvoice = new Map<string, number>();
  let ambiguousAmt = 0;
  for (const row of rows) {
    const line = asRecord(row);
    if (!line) continue;
    const amount = roundMoney(Number(line.Amount) || 0);
    if (amount <= 0) continue;
    const linked = Array.isArray(line.LinkedTxn) ? line.LinkedTxn : [];
    const invoiceIds: string[] = [];
    for (const item of linked) {
      const txn = asRecord(item);
      if (!txn) continue;
      if (String(txn.TxnType ?? "").toLowerCase() !== "invoice") continue;
      const id = String(txn.TxnId ?? "").trim();
      if (id) invoiceIds.push(id);
    }
    if (invoiceIds.length > 1) {
      ambiguousAmt = roundMoney(ambiguousAmt + amount);
      continue;
    }
    if (invoiceIds.length === 1) {
      const id = invoiceIds[0];
      byInvoice.set(id, roundMoney((byInvoice.get(id) ?? 0) + amount));
    }
  }
  return {
    lines: [...byInvoice.entries()].map(([invoiceId, amount]) => ({ invoiceId, amount })),
    ambiguousAmt: roundMoney(ambiguousAmt),
  };
}

export function parseQboPaymentEntity(raw: unknown): QboPaymentSnapshot | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = String(row.Id ?? "").trim();
  if (!id) return null;
  if (String(row.status ?? "").toLowerCase() === "deleted") {
    return {
      id,
      txnDate: "",
      totalAmt: 0,
      unappliedAmt: 0,
      status: "deleted",
      lines: [],
      ambiguousAmt: 0,
      lastUpdated: metaUpdated(row),
    };
  }
  const parsedLines = parseInvoiceLines(row.Line);
  const totalAmt = roundMoney(Number(row.TotalAmt) || 0);
  const unappliedAmt = roundMoney(Number(row.UnappliedAmt) || 0);
  const voided = parsedLines.lines.length === 0 && parsedLines.ambiguousAmt === 0 && totalAmt === 0;
  return {
    id,
    txnDate: String(row.TxnDate ?? "").trim(),
    totalAmt,
    unappliedAmt,
    status: voided ? "voided" : "applied",
    lines: parsedLines.lines,
    ambiguousAmt: parsedLines.ambiguousAmt,
    lastUpdated: metaUpdated(row),
  };
}

export function parseQboWebhook(rawBody: string): QboWebhookChange[] {
  const root = asRecord(JSON.parse(rawBody));
  const notes = Array.isArray(root?.eventNotifications) ? root.eventNotifications : [];
  const out: QboWebhookChange[] = [];
  for (const note of notes) {
    const event = asRecord(note);
    if (!event) continue;
    const realmId = String(event.realmId ?? "").trim();
    const change = asRecord(event.dataChangeEvent);
    const entities = Array.isArray(change?.entities) ? change.entities : [];
    for (const entity of entities) {
      const row = asRecord(entity);
      if (!row) continue;
      if (String(row.name ?? "").toLowerCase() !== "payment") continue;
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      out.push({ realmId, id, operation: String(row.operation ?? "").trim() });
    }
  }
  return out;
}

export function parseQboCdcPayload(payload: unknown): {
  payments: QboPaymentSnapshot[];
  deletedIds: string[];
  time: string;
} {
  const root = asRecord(payload) ?? {};
  const time = String(root.time ?? "").trim();
  const payments: QboPaymentSnapshot[] = [];
  const deletedIds: string[] = [];
  const blocks = Array.isArray(root.CDCResponse) ? root.CDCResponse : [];
  for (const block of blocks) {
    const query = asRecord(block)?.QueryResponse;
    const buckets = Array.isArray(query) ? query : query ? [query] : [];
    for (const bucket of buckets) {
      const row = asRecord(bucket);
      const list = Array.isArray(row?.Payment) ? row.Payment : [];
      for (const item of list) {
        const parsed = parseQboPaymentEntity(item);
        if (!parsed) continue;
        if (parsed.status === "deleted") deletedIds.push(parsed.id);
        else payments.push(parsed);
      }
    }
  }
  return { payments, deletedIds, time };
}

function paymentFingerprint(input: {
  status: string;
  txnDate: string;
  unapplied: number;
  applications: Array<{ loadId: number; applied: number }>;
  unmatched: string[];
  outside?: OutsideDraft[];
}): string {
  const apps = input.applications
    .map((row) => `${row.loadId}:${row.applied.toFixed(2)}`)
    .sort()
    .join(",");
  const unmatched = [...input.unmatched].sort().join(",");
  const base = [input.status, input.txnDate, input.unapplied.toFixed(2), apps, unmatched].join("|");
  const outside = input.outside ?? [];
  if (outside.length === 0) return base;
  const extra = outside
    .map((row) => `${row.invoiceId}:${row.suggestedLoadId ?? ""}:${row.docNumber}`)
    .sort()
    .join(",");
  return `${base}|out:${extra}`;
}

function readPaymentRow(id: string): PaymentRow | null {
  return (
    (getDb().prepare("SELECT qbo_payment_id, status, notified_key FROM qbo_payments WHERE qbo_payment_id = ?").get(id) as
      | PaymentRow
      | undefined) ?? null
  );
}

function previousLoadIds(paymentId: string): number[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT load_id FROM qbo_payment_applications WHERE qbo_payment_id = ?")
    .all(paymentId) as Array<{ load_id: number }>;
  return rows.map((row) => row.load_id);
}

function quickbooksLoadsForInvoice(invoiceId: string): number[] {
  const rows = getDb()
    .prepare(
      `SELECT id FROM loads
       WHERE qbo_invoice_id = ? AND qbo_source = 'quickbooks'
       ORDER BY id`,
    )
    .all(invoiceId) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

/** True when any load stores this QuickBooks invoice id, whatever the source. */
function tmsCreatedInvoice(invoiceId: string): boolean {
  const id = invoiceId.trim();
  if (!id) return false;
  const row = getDb()
    .prepare("SELECT id FROM loads WHERE qbo_invoice_id = ? LIMIT 1")
    .get(id) as { id: number } | undefined;
  return Boolean(row);
}

/** Exact trimmed load number. Blank numbers never match. */
function loadsForExactLoadNumber(loadNumber: string): number[] {
  const key = loadNumber.trim();
  if (!key) return [];
  const rows = getDb()
    .prepare(
      `SELECT id FROM loads
       WHERE TRIM(load_number) = ?
       ORDER BY id`,
    )
    .all(key) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

function docNumberFor(
  docNumbers: Map<string, string> | Record<string, string> | undefined,
  invoiceId: string,
): string {
  if (!docNumbers) return "";
  const raw = docNumbers instanceof Map ? docNumbers.get(invoiceId) : docNumbers[invoiceId];
  return String(raw ?? "").trim();
}

function outsideSuggestion(docNumber: string): number | null {
  const matches = loadsForExactLoadNumber(docNumber);
  return matches.length === 1 ? matches[0] : null;
}

function appliedByOthers(loadId: number, paymentId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(applied_amount), 0) AS amount
       FROM qbo_payment_applications
       WHERE load_id = ? AND qbo_payment_id != ?`,
    )
    .get(loadId, paymentId) as { amount: number } | undefined;
  return roundMoney(Number(row?.amount) || 0);
}

function openExceptionCount(paymentId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM qbo_payment_exceptions
       WHERE qbo_payment_id = ? AND status = 'open'`,
    )
    .get(paymentId) as { n: number } | undefined;
  return Number(row?.n) || 0;
}

type LoadPaidState = {
  loadId: number;
  loadNumber: string;
  amount: number;
  paidAt: string;
  paymentId: string;
  fullyPaid: boolean;
  total: number;
};

/**
 * Cap and paid check use the QuickBooks invoice total: TotalAmt stored at send,
 * otherwise every charge line from the invoice builder (rate plus accessorials).
 * Rate + tax alone is not the invoice.
 */
function paymentCapTotal(load: NonNullable<ReturnType<typeof getLoad>>): number {
  try {
    return qboPaymentBasisTotal(load);
  } catch {
    return loadInvoiceTotal(load);
  }
}

function recomputeLoad(loadId: number): LoadPaidState | null {
  const load = getLoad(loadId);
  if (!load) return null;
  const total = paymentCapTotal(load);
  const sumRow = getDb()
    .prepare(
      `SELECT COALESCE(SUM(a.applied_amount), 0) AS amount
       FROM qbo_payment_applications a
       JOIN qbo_payments p ON p.qbo_payment_id = a.qbo_payment_id
       WHERE a.load_id = ? AND p.status = 'applied'`,
    )
    .get(loadId) as { amount: number } | undefined;
  const amount = roundMoney(Math.min(total, Number(sumRow?.amount) || 0));
  const latest = getDb()
    .prepare(
      `SELECT a.qbo_payment_id, p.txn_date
       FROM qbo_payment_applications a
       JOIN qbo_payments p ON p.qbo_payment_id = a.qbo_payment_id
       WHERE a.load_id = ? AND p.status = 'applied' AND a.applied_amount > 0
       ORDER BY p.txn_date DESC, a.id DESC
       LIMIT 1`,
    )
    .get(loadId) as { qbo_payment_id: string; txn_date: string } | undefined;
  const fullyPaid = total > 0 && amount + 0.009 >= total;
  const paidAt = amount > 0 ? String(latest?.txn_date ?? "") : "";
  const paymentId = amount > 0 ? String(latest?.qbo_payment_id ?? "") : "";
  const paidFlag = fullyPaid ? 1 : 0;
  if (
    roundMoney(Number(load.invoice_paid_amount) || 0) !== amount ||
    (load.invoice_paid_at || "") !== paidAt ||
    (load.qbo_payment_id || "") !== paymentId ||
    Number(load.invoice_paid) !== paidFlag
  ) {
    getDb()
      .prepare(
        `UPDATE loads
         SET invoice_paid = ?, invoice_paid_amount = ?, invoice_paid_at = ?, qbo_payment_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(paidFlag, amount, paidAt, paymentId, nowIso(), loadId);
  }
  return {
    loadId,
    loadNumber: load.load_number,
    amount,
    paidAt,
    paymentId,
    fullyPaid,
    total,
  };
}

function upsertException(paymentId: string, invoiceId: string, detail: string, at: string): void {
  getDb()
    .prepare(
      `INSERT INTO qbo_payment_exceptions (qbo_payment_id, qbo_invoice_id, detail, status, updated_at)
       VALUES (?, ?, ?, 'open', ?)
       ON CONFLICT(qbo_payment_id, qbo_invoice_id) DO UPDATE SET
         detail = excluded.detail,
         status = 'open',
         updated_at = excluded.updated_at`,
    )
    .run(paymentId, invoiceId, detail, at);
}

function resolveExceptions(paymentId: string, keep: string[], at: string): void {
  const db = getDb();
  if (keep.length === 0) {
    db.prepare(
      `UPDATE qbo_payment_exceptions SET status = 'resolved', updated_at = ?
       WHERE qbo_payment_id = ? AND status = 'open'`,
    ).run(at, paymentId);
    return;
  }
  const marks = keep.map(() => "?").join(", ");
  db.prepare(
    `UPDATE qbo_payment_exceptions SET status = 'resolved', updated_at = ?
     WHERE qbo_payment_id = ? AND status = 'open' AND qbo_invoice_id NOT IN (${marks})`,
  ).run(at, paymentId, ...keep);
}

function accountingRecipientIds(): number[] {
  return listDispatcherUsers(false)
    .filter((user) => user.active && canAccessAccounting(user.role))
    .map((user) => user.id);
}

function insertNotification(dispatcherId: number, title: string, body: string, href: string, at: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_notifications (dispatcher_id, rule_id, title, body, href, read_at, created_at)
       VALUES (?, NULL, ?, ?, ?, '', ?)`,
    )
    .run(dispatcherId, title, body, href, at);
}

function money(value: number): string {
  return formatMoney(value);
}

function dateLabel(txnDate: string): string {
  if (!txnDate) return "";
  const label = formatMdYFull(txnDate);
  return label === "—" ? txnDate : label;
}

export function applyQboPayment(
  snapshot: QboPaymentSnapshot,
  docNumbers?: Map<string, string> | Record<string, string>,
): QboPaymentApplyResult {
  const db = getDb();
  const at = nowIso();
  const existing = readPaymentRow(snapshot.id);
  const priorLoads = previousLoadIds(snapshot.id);
  const hadUnmatched = openExceptionCount(snapshot.id) > 0;
  const planned: PlannedApplication[] = [];
  const unmatched: string[] = [];
  const outside: OutsideDraft[] = [];
  let unapplied = snapshot.status === "applied" ? snapshot.unappliedAmt : 0;

  if (snapshot.status === "applied") {
    if (snapshot.ambiguousAmt > 0) {
      unapplied = roundMoney(unapplied + snapshot.ambiguousAmt);
      unmatched.push("*");
    }
    for (const line of snapshot.lines) {
      const loads = quickbooksLoadsForInvoice(line.invoiceId);
      if (loads.length === 1) {
        const load = getLoad(loads[0]);
        const total = load ? paymentCapTotal(load) : 0;
        const room = roundMoney(Math.max(0, total - appliedByOthers(loads[0], snapshot.id)));
        const applied = roundMoney(Math.min(line.amount, room));
        const excess = roundMoney(line.amount - applied);
        unapplied = roundMoney(unapplied + excess);
        if (applied > 0) {
          planned.push({
            invoiceId: line.invoiceId,
            loadId: loads[0],
            lineAmount: line.amount,
            applied,
            unapplied: excess,
          });
        }
        continue;
      }
      if (loads.length > 1 || tmsCreatedInvoice(line.invoiceId)) {
        unmatched.push(line.invoiceId);
        unapplied = roundMoney(unapplied + line.amount);
        continue;
      }
      const docNumber = docNumberFor(docNumbers, line.invoiceId);
      outside.push({
        invoiceId: line.invoiceId,
        amount: line.amount,
        docNumber,
        suggestedLoadId: outsideSuggestion(docNumber),
      });
    }
  }

  const fingerprint = paymentFingerprint({
    status: snapshot.status,
    txnDate: snapshot.txnDate,
    unapplied,
    applications: planned.map((row) => ({ loadId: row.loadId, applied: row.applied })),
    unmatched,
    outside,
  });

  const base: QboPaymentApplyResult = {
    paymentId: snapshot.id,
    status: snapshot.status,
    loadIds: planned.map((row) => row.loadId),
    unmatchedInvoiceIds: unmatched.filter((id) => id !== "*"),
    outsideInvoiceIds: outside.map((row) => row.invoiceId),
    suggestedLoadIds: outside.flatMap((row) => (row.suggestedLoadId == null ? [] : [row.suggestedLoadId])),
    unappliedAmt: unapplied,
    notified: false,
    emails: [],
  };

  if (existing && existing.notified_key === fingerprint) return base;

  const meaningful =
    priorLoads.length > 0 ||
    planned.length > 0 ||
    unmatched.length > 0 ||
    unapplied > 0.009 ||
    hadUnmatched ||
    (existing?.status === "applied" && snapshot.status !== "applied");

  const affected = [...new Set([...priorLoads, ...planned.map((row) => row.loadId)])];
  const states: LoadPaidState[] = [];
  const notices: Array<{ body: string; href: string }> = [];

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO qbo_payments (
         qbo_payment_id, txn_date, total_amt, unapplied_amt, status, last_updated, notified_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(qbo_payment_id) DO UPDATE SET
         txn_date = excluded.txn_date,
         total_amt = excluded.total_amt,
         unapplied_amt = excluded.unapplied_amt,
         status = excluded.status,
         last_updated = excluded.last_updated,
         notified_key = excluded.notified_key,
         updated_at = excluded.updated_at`,
    ).run(
      snapshot.id,
      snapshot.txnDate,
      snapshot.totalAmt,
      unapplied,
      snapshot.status,
      snapshot.lastUpdated,
      fingerprint,
      at,
      at,
    );
    db.prepare("DELETE FROM qbo_payment_applications WHERE qbo_payment_id = ?").run(snapshot.id);
    const insertLine = db.prepare(
      `INSERT INTO qbo_payment_applications (
         qbo_payment_id, qbo_invoice_id, load_id, line_amount, applied_amount, unapplied_amount
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const line of planned) {
      insertLine.run(snapshot.id, line.invoiceId, line.loadId, line.lineAmount, line.applied, line.unapplied);
    }
    db.prepare("DELETE FROM qbo_payment_outside WHERE qbo_payment_id = ?").run(snapshot.id);
    if (snapshot.status === "applied") {
      const insertOutside = db.prepare(
        `INSERT INTO qbo_payment_outside (
           qbo_payment_id, qbo_invoice_id, doc_number, amount, suggested_load_id, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const row of outside) {
        insertOutside.run(snapshot.id, row.invoiceId, row.docNumber, row.amount, row.suggestedLoadId, at);
      }
      for (const invoiceId of unmatched) {
        const detail =
          invoiceId === "*"
            ? `Payment ${snapshot.id} has a line linked to more than one invoice. That amount was not applied.`
            : quickbooksLoadsForInvoice(invoiceId).length > 1
              ? `Payment ${snapshot.id} links invoice ${invoiceId}, and more than one load has that QuickBooks invoice. Nothing was applied.`
              : `Payment ${snapshot.id} links invoice ${invoiceId}. The TMS created that invoice, but it does not match one QuickBooks load. Nothing was applied.`;
        upsertException(snapshot.id, invoiceId, detail, at);
      }
      resolveExceptions(snapshot.id, unmatched, at);
    } else {
      resolveExceptions(snapshot.id, [], at);
    }
    for (const loadId of affected) {
      const state = recomputeLoad(loadId);
      if (state) states.push(state);
    }

    if (!meaningful) return;
    const when = dateLabel(snapshot.txnDate);
    if (snapshot.status === "applied") {
      for (const state of states) {
        const paidOn = dateLabel(state.paidAt);
        const dated = paidOn ? ` on ${paidOn}` : "";
        const remaining = roundMoney(Math.max(0, state.total - state.amount));
        const body = state.fullyPaid
          ? `Load ${state.loadNumber} paid ${money(state.amount)}${dated}.`
          : `Load ${state.loadNumber} paid ${money(state.amount)}${dated}. Remaining ${money(remaining)}.`;
        notices.push({ body, href: `/loads/${state.loadId}` });
      }
      if (unmatched.length > 0) {
        const ids = unmatched.filter((id) => id !== "*");
        const body = ids.length
          ? `QuickBooks payment ${snapshot.id} did not match invoice ${ids.join(", ")}. Nothing was guessed.`
          : `QuickBooks payment ${snapshot.id} had a line linked to more than one invoice. Nothing was applied.`;
        notices.push({ body, href: "/desk?kind=qbo_payment" });
      } else if (unapplied > 0.009 && states.length === 0) {
        notices.push({
          body: `QuickBooks payment ${snapshot.id}${when ? ` on ${when}` : ""} has ${money(unapplied)} not applied to an invoice.`,
          href: "/accounting",
        });
      }
    } else {
      const verb = snapshot.status === "deleted" ? "deleted" : "voided";
      if (states.length === 0) {
        notices.push({
          body: `QuickBooks payment ${snapshot.id} was ${verb}.`,
          href: "/desk?kind=qbo_payment",
        });
      }
      for (const state of states) {
        const remaining = roundMoney(Math.max(0, state.total - state.amount));
        const body = state.fullyPaid
          ? `QuickBooks payment ${snapshot.id} was ${verb}. Load ${state.loadNumber} is still paid.`
          : `QuickBooks payment ${snapshot.id} was ${verb}. Load ${state.loadNumber} is open again. Remaining ${money(remaining)}.`;
        notices.push({ body, href: `/loads/${state.loadId}` });
      }
    }
    const recipients = accountingRecipientIds();
    for (const notice of notices) {
      for (const dispatcherId of recipients) {
        insertNotification(dispatcherId, "QuickBooks payment", notice.body, notice.href, at);
      }
    }
  });
  write();

  if (notices.length === 0) return base;
  const emails: OutgoingMail[] = [];
  if (qboPaymentArEmailEnabled()) {
    const to = invoiceFromAddress();
    if (to) {
      emails.push({
        to,
        subject: `QuickBooks payment ${snapshot.id}`,
        text: notices.map((notice) => notice.body).join("\n"),
      });
    }
  }
  return { ...base, notified: true, emails };
}

/**
 * Apply a payment from the webhook or the change feed.
 * DocNumber is read only for invoices no TMS load has. A failed read stays an outside invoice.
 */
export async function applyQboPaymentFromFeed(
  snapshot: QboPaymentSnapshot,
  readDocNumber: (invoiceId: string) => Promise<string | null> = readQboInvoiceDocNumber,
): Promise<QboPaymentApplyResult> {
  const docNumbers = new Map<string, string>();
  if (snapshot.status === "applied") {
    for (const line of snapshot.lines) {
      if (quickbooksLoadsForInvoice(line.invoiceId).length > 0) continue;
      if (tmsCreatedInvoice(line.invoiceId)) continue;
      let doc = "";
      try {
        doc = String((await readDocNumber(line.invoiceId)) ?? "").trim();
      } catch {
        doc = "";
      }
      if (doc) docNumbers.set(line.invoiceId, doc);
    }
  }
  return applyQboPayment(snapshot, docNumbers);
}

export function applyDeletedPayment(id: string): QboPaymentApplyResult {
  return applyQboPayment({
    id,
    txnDate: "",
    totalAmt: 0,
    unappliedAmt: 0,
    status: "deleted",
    lines: [],
    ambiguousAmt: 0,
    lastUpdated: "",
  });
}

async function defaultReadPayment(
  id: string,
): Promise<QboPaymentSnapshot | { deleted: true }> {
  const read = await readQboPayment(id);
  if (read.deleted) return { deleted: true };
  return parseQboPaymentEntity(read.payment) ?? { deleted: true };
}

export async function ingestQboWebhook(input: {
  rawBody: string;
  signature: string;
  realmId?: string;
  verifier?: string;
  readPayment?: (id: string) => Promise<QboPaymentSnapshot | { deleted: true }>;
  sendMail?: (email: OutgoingMail) => Promise<void>;
}): Promise<QboWebhookIngestResult> {
  if (input.rawBody.length > MAX_BODY_CHARS) {
    return { ok: true, accepted: false, reason: "too_large", applied: 0, httpStatus: 413 };
  }
  const verifier = (input.verifier ?? getQuickbooksWebhookVerifier() ?? "").trim();
  if (!verifier) {
    return { ok: true, accepted: false, reason: "verifier_missing", applied: 0, httpStatus: 401 };
  }
  const expected = intuitWebhookSignature(verifier, input.rawBody);
  if (!intuitSignaturesMatch(expected, input.signature)) {
    return { ok: true, accepted: false, reason: "bad_signature", applied: 0, httpStatus: 401 };
  }

  let changes: QboWebhookChange[] = [];
  try {
    changes = parseQboWebhook(input.rawBody);
  } catch {
    return { ok: true, accepted: false, reason: "bad_payload", applied: 0, httpStatus: 200 };
  }

  const expectedRealm = (input.realmId !== undefined ? input.realmId : connectedQuickbooksRealmId()).trim();
  if (!expectedRealm) {
    return { ok: true, accepted: false, reason: "not_connected", applied: 0, httpStatus: 200 };
  }

  const byId = new Map<string, QboWebhookChange>();
  for (const change of changes) {
    if (change.realmId !== expectedRealm) continue;
    byId.set(change.id, change);
  }
  if (byId.size === 0) {
    return { ok: true, accepted: true, reason: changes.length ? "realm" : "ignored", applied: 0, httpStatus: 200 };
  }

  const readPayment = input.readPayment ?? defaultReadPayment;
  const emails: OutgoingMail[] = [];
  let applied = 0;
  for (const change of byId.values()) {
    const operation = change.operation.toLowerCase();
    if (operation === "delete") {
      emails.push(...applyDeletedPayment(change.id).emails);
      applied += 1;
      continue;
    }
    const read = await readPayment(change.id);
    if ("deleted" in read && read.deleted) {
      emails.push(...applyDeletedPayment(change.id).emails);
      applied += 1;
      continue;
    }
    const snapshot = read as QboPaymentSnapshot;
    if (operation === "void") {
      emails.push(
        ...(
          await applyQboPaymentFromFeed({
            ...snapshot,
            status: "voided",
            lines: [],
            ambiguousAmt: 0,
            totalAmt: 0,
            unappliedAmt: 0,
          })
        ).emails,
      );
    } else {
      emails.push(...(await applyQboPaymentFromFeed(snapshot)).emails);
    }
    applied += 1;
  }

  if (emails.length > 0) {
    const send = input.sendMail ?? (await import("./mail")).sendMail;
    for (const email of emails) {
      try {
        await send(email);
      } catch {
        // The in-app notice is already stored.
      }
    }
  }

  return { ok: true, accepted: true, reason: "ok", applied, httpStatus: 200 };
}

function readCdcCursor(now = Date.now()): string {
  const row = getDb()
    .prepare("SELECT changed_since FROM qbo_sync_cursors WHERE entity = ?")
    .get(CDC_ENTITY) as { changed_since: string } | undefined;
  const stored = row?.changed_since?.trim() ?? "";
  const parsed = Date.parse(stored);
  const oldest = now - CDC_MAX_MS;
  if (!stored || !Number.isFinite(parsed) || parsed < oldest) {
    const start = Math.max(oldest, now - CDC_LOOKBACK_MS);
    return intuitTimestamp(new Date(start));
  }
  return stored;
}

function writeCdcCursor(changedSince: string): void {
  const at = nowIso();
  getDb()
    .prepare(
      `INSERT INTO qbo_sync_cursors (entity, changed_since, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(entity) DO UPDATE SET changed_since = excluded.changed_since, updated_at = excluded.updated_at`,
    )
    .run(CDC_ENTITY, changedSince, at);
}

/** Payment CDC backstop. No-ops when QuickBooks is not connected. GET only. */
export async function syncQboPaymentsFromCdc(): Promise<{ saved: number; error?: string }> {
  if (!hasQuickbooksSession()) return { saved: 0 };
  try {
    const since = readCdcCursor();
    const payload = await readQboPaymentCdc(since);
    const parsed = parseQboCdcPayload(payload);
    let saved = 0;
    for (const id of parsed.deletedIds) {
      applyDeletedPayment(id);
      saved += 1;
    }
    for (const payment of parsed.payments) {
      await applyQboPaymentFromFeed(payment);
      saved += 1;
    }
    if (parsed.time) writeCdcCursor(parsed.time);
    return { saved };
  } catch (error) {
    return { saved: 0, error: integrationErrorCode(error) };
  }
}

export type QboPaymentExceptionRow = {
  qbo_payment_id: string;
  qbo_invoice_id: string;
  detail: string;
};

export function listOpenQboPaymentExceptions(): QboPaymentExceptionRow[] {
  return getDb()
    .prepare(
      `SELECT qbo_payment_id, qbo_invoice_id, detail
       FROM qbo_payment_exceptions
       WHERE status = 'open'
       ORDER BY id`,
    )
    .all() as QboPaymentExceptionRow[];
}

export function listOutsideQboPayments(): OutsideQboPayment[] {
  const rows = getDb()
    .prepare(
      `SELECT o.qbo_payment_id, o.qbo_invoice_id, o.doc_number, o.amount,
              o.suggested_load_id, p.txn_date, IFNULL(l.load_number, '') AS load_number
       FROM qbo_payment_outside o
       JOIN qbo_payments p ON p.qbo_payment_id = o.qbo_payment_id
       LEFT JOIN loads l ON l.id = o.suggested_load_id
       WHERE p.status = 'applied'
       ORDER BY p.txn_date DESC, o.id DESC`,
    )
    .all() as Array<{
    qbo_payment_id: string;
    qbo_invoice_id: string;
    doc_number: string;
    amount: number;
    suggested_load_id: number | null;
    txn_date: string;
    load_number: string;
  }>;
  return rows.map((row) => ({
    qboPaymentId: row.qbo_payment_id,
    qboInvoiceId: row.qbo_invoice_id,
    docNumber: row.doc_number,
    amount: roundMoney(Number(row.amount) || 0),
    txnDate: row.txn_date,
    suggestedLoadId: row.suggested_load_id,
    suggestedLoadNumber: row.load_number,
  }));
}

/** Suggestion text for a load. Empty when this payment was not linked by DocNumber. */
export function outsidePaymentSuggestionLines(): Map<number, string> {
  const grouped = new Map<number, string[]>();
  for (const row of listOutsideQboPayments()) {
    if (row.suggestedLoadId == null) continue;
    const when = row.txnDate ? ` on ${row.txnDate}` : "";
    const line = `Suggested QuickBooks payment ${row.qboPaymentId}${when} for ${money(row.amount)}. Confirm before marking paid.`;
    const lines = grouped.get(row.suggestedLoadId) ?? [];
    lines.push(line);
    grouped.set(row.suggestedLoadId, lines);
  }
  const out = new Map<number, string>();
  for (const [loadId, lines] of grouped) out.set(loadId, lines.join(" "));
  return out;
}
