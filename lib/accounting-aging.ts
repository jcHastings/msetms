import { listBills, listReceivables, type Bill } from "./accounting";
import { formatAccountingDateTime, formatMdYFull, formatMoney } from "./format";
import { getCustomer, getLoad } from "./queries";
import { getCompanySettings, taxOnAmount } from "./settings";
import { buildXlsxFromGrid } from "./xlsx-first-sheet";
import type { LoadView } from "./types";

export type AgingBucket = "current" | "0-29" | "30+";

export type ArApReportRow = {
  id: number;
  kind: "ar" | "ap";
  name: string;
  invoiceDate: string;
  invoiceDateLabel: string;
  containerNumber: string;
  loadNumber: string;
  loadId: number | null;
  reference: string;
  paymentTerms: string;
  dueDate: string;
  dueDateLabel: string;
  daysPastDue: number;
  total: number;
  paid: number;
  balance: number;
  current: number;
  aging0to29: number;
  aging30: number;
};

export function paymentTermsDays(terms: string): number {
  const net = String(terms ?? "").match(/net\s*(\d+)/i);
  if (net) return Number(net[1]);
  const days = String(terms ?? "").match(/(\d+)\s*days?/i);
  if (days) return Number(days[1]);
  return 30;
}

export function paymentTermsLabel(terms: string): string {
  const days = paymentTermsDays(terms);
  return `${days} days`;
}

export function invoiceAnchorIso(load: Pick<LoadView, "tms_invoice_at" | "delivery_end" | "delivery_start">): string {
  return (load.tms_invoice_at || load.delivery_end || load.delivery_start || "").trim();
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function daysPastDueOn(dueIso: string, now = new Date()): number {
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return 0;
  const startDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const startNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((startNow - startDue) / 86_400_000);
}

export function agingAmounts(balance: number, daysPastDue: number): {
  current: number;
  aging0to29: number;
  aging30: number;
} {
  if (balance <= 0) return { current: 0, aging0to29: 0, aging30: 0 };
  if (daysPastDue <= 0) return { current: balance, aging0to29: 0, aging30: 0 };
  if (daysPastDue < 30) return { current: 0, aging0to29: balance, aging30: 0 };
  return { current: 0, aging0to29: 0, aging30: balance };
}

export function qboInvoiceExportStatus(load: {
  qbo_invoice_id: string;
  qbo_sent_at: string;
  invoice_paid?: number;
  paid?: boolean;
}): { sent: boolean; invoiceLine: string; paymentsLine: string } {
  if (!load.qbo_invoice_id) {
    return { sent: false, invoiceLine: "Unsent", paymentsLine: "" };
  }
  const when = load.qbo_sent_at ? formatAccountingDateTime(load.qbo_sent_at) : "";
  const recorded = load.paid || load.invoice_paid ? 1 : 0;
  return {
    sent: true,
    invoiceLine: when ? `Invoice Exported: ${when}` : "Invoice Exported",
    paymentsLine: `Payments Exported: 0/${recorded}`,
  };
}

function receivableTotal(load: LoadView): number {
  const settings = getCompanySettings();
  const tax = taxOnAmount(load.rate);
  return (load.rate ?? 0) + (settings.tax_enabled ? tax.tax : 0);
}

export function listArReportRows(): ArApReportRow[] {
  return listReceivables().map((load) => {
    const customer = getCustomer(load.customer_id);
    const terms = customer?.payment_terms ?? "";
    const invoiceIso = invoiceAnchorIso(load);
    const dueIso = invoiceIso ? addDaysIso(invoiceIso, paymentTermsDays(terms)) : "";
    const total = receivableTotal(load);
    const paid = load.paid ? total : 0;
    const balance = load.paid ? 0 : total;
    const days = dueIso ? Math.max(0, daysPastDueOn(dueIso)) : 0;
    const buckets = agingAmounts(balance, dueIso ? daysPastDueOn(dueIso) : 0);
    return {
      id: load.id,
      kind: "ar",
      name: load.customer_name,
      invoiceDate: invoiceIso,
      invoiceDateLabel: invoiceIso ? formatMdYFull(invoiceIso) : "Unsent",
      containerNumber: load.container_number || "",
      loadNumber: load.load_number,
      loadId: load.id,
      reference: load.customer_reference || load.po_number || load.reference_number || "",
      paymentTerms: paymentTermsLabel(terms),
      dueDate: dueIso,
      dueDateLabel: dueIso ? formatMdYFull(dueIso) : "Not Available",
      daysPastDue: days,
      total,
      paid,
      balance,
      current: buckets.current,
      aging0to29: buckets.aging0to29,
      aging30: buckets.aging30,
    };
  });
}

export function listApReportRows(): ArApReportRow[] {
  return listBills().map((bill) => toApRow(bill));
}

function toApRow(bill: Bill): ArApReportRow {
  const invoiceIso = bill.created_at;
  const dueIso = invoiceIso ? addDaysIso(invoiceIso, 30) : "";
  const paid = bill.status === "paid" ? bill.amount : 0;
  const balance = bill.status === "paid" ? 0 : bill.amount;
  const days = dueIso ? Math.max(0, daysPastDueOn(dueIso)) : 0;
  const buckets = agingAmounts(balance, dueIso ? daysPastDueOn(dueIso) : 0);
  const load = bill.load_id ? getLoad(bill.load_id) : null;
  return {
    id: bill.id,
    kind: "ap",
    name: bill.vendor,
    invoiceDate: invoiceIso,
    invoiceDateLabel: invoiceIso ? formatMdYFull(invoiceIso) : "—",
    containerNumber: load?.container_number || "",
    loadNumber: load?.load_number || "",
    loadId: bill.load_id,
    reference: bill.memo,
    paymentTerms: "30 days",
    dueDate: dueIso,
    dueDateLabel: dueIso ? formatMdYFull(dueIso) : "Not Available",
    daysPastDue: days,
    total: bill.amount,
    paid,
    balance,
    current: buckets.current,
    aging0to29: buckets.aging0to29,
    aging30: buckets.aging30,
  };
}

export function renderArApXlsx(rows: ArApReportRow[], title = "Accounts Receivable"): Uint8Array {
  const settings = getCompanySettings();
  const money = (value: number) => formatMoney(value, settings.currency);
  return buildXlsxFromGrid([
    [
      title,
    ],
    [
      "Name",
      "Invoice Date",
      "Container Number",
      "Load #",
      "Reference #",
      "Payment Terms",
      "Due Date",
      "Days Past Due",
      "Invoice Totals",
      "Paid",
      "Current",
      "0-29 Days Past Due",
      "30+ Day",
    ],
    ...rows.map((row) => [
      row.name,
      row.invoiceDateLabel,
      row.containerNumber,
      row.loadNumber,
      row.reference,
      row.paymentTerms,
      row.dueDateLabel,
      row.daysPastDue,
      money(row.total),
      money(row.paid),
      money(row.current),
      money(row.aging0to29),
      money(row.aging30),
    ]),
  ]);
}
