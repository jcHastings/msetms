/** Read-only checks. Does not write invoices, settlements, or QuickBooks. */

import { getDb } from "./db";
import { DETENTION_LINE_LOCKED, INVOICE_ALREADY_SENT_WARNING } from "./detention-request";
import { lastSentMail } from "./mail-store";

export function invoiceAlreadyOut(loadId: number): boolean {
  const load = getDb()
    .prepare("SELECT tms_invoice_number, qbo_invoice_id, qbo_sent_at FROM loads WHERE id = ?")
    .get(loadId) as { tms_invoice_number?: string; qbo_invoice_id?: string; qbo_sent_at?: string } | undefined;
  if (!load) return false;
  if (String(load.tms_invoice_number ?? "").trim()) return true;
  if (String(load.qbo_invoice_id ?? "").trim()) return true;
  if (String(load.qbo_sent_at ?? "").trim()) return true;
  const file = getDb()
    .prepare("SELECT id FROM attachments WHERE load_id = ? AND kind = 'invoice' LIMIT 1")
    .get(loadId) as { id: number } | undefined;
  if (file) return true;
  return lastSentMail(loadId, "customer_invoice") != null;
}

export function invoiceAlreadySentWarning(loadId: number): string {
  return invoiceAlreadyOut(loadId) ? INVOICE_ALREADY_SENT_WARNING : "";
}

export function detentionLineLockReason(payItemId: number): string {
  const request = getDb()
    .prepare("SELECT load_id FROM detention_requests WHERE pay_item_id = ? LIMIT 1")
    .get(payItemId) as { load_id: number } | undefined;
  if (!request) return "";
  const item = getDb()
    .prepare("SELECT created_at, paid_at FROM load_pay_items WHERE id = ?")
    .get(payItemId) as { created_at?: string; paid_at?: string } | undefined;
  if (!item) return "";
  if (String(item.paid_at ?? "").trim()) return DETENTION_LINE_LOCKED;
  const lineAt = Date.parse(String(item.created_at ?? ""));
  if (!Number.isFinite(lineAt)) return "";
  const sent = lastSentMail(request.load_id, "customer_invoice");
  if (sent && atOrAfter(sent.created_at, lineAt)) return DETENTION_LINE_LOCKED;
  const load = getDb()
    .prepare("SELECT qbo_sent_at FROM loads WHERE id = ?")
    .get(request.load_id) as { qbo_sent_at?: string } | undefined;
  if (load && atOrAfter(load.qbo_sent_at, lineAt)) return DETENTION_LINE_LOCKED;
  const settlement = getDb()
    .prepare("SELECT paid_at FROM settlements WHERE load_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1")
    .get(request.load_id) as { paid_at?: string } | undefined;
  if (settlement && atOrAfter(settlement.paid_at, lineAt)) return DETENTION_LINE_LOCKED;
  return "";
}

export function lockedDetentionPayItemIds(loadId: number): number[] {
  const rows = getDb()
    .prepare("SELECT pay_item_id FROM detention_requests WHERE load_id = ? AND pay_item_id IS NOT NULL")
    .all(loadId) as Array<{ pay_item_id: number }>;
  return rows.map((row) => Number(row.pay_item_id)).filter((id) => id > 0 && detentionLineLockReason(id) !== "");
}

function atOrAfter(iso: string | null | undefined, lineAt: number): boolean {
  const at = Date.parse(String(iso ?? "").trim());
  return Number.isFinite(at) && at >= lineAt - 1000;
}
