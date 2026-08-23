import { computeOwnerOperatorPay } from "./settlement";
import type { CommissionRow, Invoice, InvoiceStatus, LoadView } from "./types";

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function invoiceAgeDays(issuedAt: string, now = new Date()): number {
  const issued = new Date(issuedAt);
  if (Number.isNaN(issued.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - issued.getTime()) / 86_400_000));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function agingTotals(invoices: Invoice[], now = new Date()): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const invoice of invoices) {
    if (invoice.status === "paid") continue;
    totals[agingBucket(invoiceAgeDays(invoice.issued_at, now))] += invoice.amount;
  }
  return totals;
}

export function nextInvoiceNumber(existing: string[]): string {
  let max = 1000;
  for (const number of existing) {
    const match = number.match(/(\d+)$/);
    if (!match) continue;
    max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `INV-${max + 1}`;
}

export function effectiveCommission(load: {
  rate: number | null;
  commission_percent: number | null;
  customer_commission_percent?: number | null;
}): { percent: number; amount: number; source: CommissionRow["source"] } | null {
  const loadPercent = load.commission_percent;
  const customerPercent = load.customer_commission_percent ?? null;
  const percent = loadPercent != null && !Number.isNaN(loadPercent) ? loadPercent : customerPercent;
  if (percent == null || Number.isNaN(percent) || percent <= 0 || load.rate == null) return null;
  const amount = Math.round(load.rate * (percent / 100) * 100) / 100;
  return {
    percent,
    amount,
    source: loadPercent != null && !Number.isNaN(loadPercent) ? "load" : "customer",
  };
}

export function dueDateFromIssued(issuedAt: string, days = 30): string {
  const date = new Date(issuedAt);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function invoiceAmountForLoad(load: Pick<LoadView, "rate">): number {
  if (load.rate == null || Number.isNaN(load.rate) || load.rate <= 0) {
    throw new Error("Set a customer rate before creating an invoice.");
  }
  return load.rate;
}

export function ownerOperatorBillAmount(rate: number | null, percent: number | null): number | null {
  return computeOwnerOperatorPay(rate, percent);
}
