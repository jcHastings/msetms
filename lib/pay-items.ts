import { getDb } from "./db";
import { isPayItemCategory, type PayItemBillTo, type PayItemSide } from "./load-page-shared";
import { computeOwnerOperatorPay, isAutoOwnerOperatorPay } from "./settlement";

export type LoadPayItem = {
  id: number;
  load_id: number;
  side: PayItemSide;
  bill_to: PayItemBillTo;
  payee: string;
  category: string;
  rate: number | null;
  qty: number | null;
  total: number | null;
  notes: string;
  created_at: string;
  paid_at?: string;
};

export function listPayItems(loadId: number, side?: PayItemSide): LoadPayItem[] {
  if (side) {
    return getDb()
      .prepare("SELECT * FROM load_pay_items WHERE load_id = ? AND side = ? ORDER BY id")
      .all(loadId, side) as LoadPayItem[];
  }
  return getDb()
    .prepare("SELECT * FROM load_pay_items WHERE load_id = ? ORDER BY side, id")
    .all(loadId) as LoadPayItem[];
}

export function addPayItem(
  loadId: number,
  input: {
    side: PayItemSide;
    bill_to: PayItemBillTo;
    payee: string;
    category: string;
    rate: number | null;
    qty: number | null;
    total: number | null;
    notes: string;
  },
): number {
  const load = getDb().prepare("SELECT id FROM loads WHERE id = ?").get(loadId) as { id: number } | undefined;
  if (!load) throw new Error("Load not found.");
  if (input.side !== "income" && input.side !== "expense") throw new Error("Pick income or expenses.");
  if (input.bill_to !== "customer" && input.bill_to !== "driver") throw new Error("Pick who this bills.");
  if (!isPayItemCategory(input.category)) throw new Error("Pick a pay category.");
  const rate = input.rate;
  const qty = input.qty ?? 1;
  const total = input.total ?? (rate != null ? Math.round(rate * qty * 100) / 100 : null);
  const result = getDb()
    .prepare(
      `INSERT INTO load_pay_items (
        load_id, side, bill_to, payee, category, rate, qty, total, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      input.side,
      input.bill_to,
      input.payee.trim(),
      input.category,
      rate,
      qty,
      total,
      input.notes.trim(),
      new Date().toISOString(),
    );
  syncCustomerRateFromPayItems(loadId);
  return Number(result.lastInsertRowid);
}

export function markPayItemPaid(id: number): void {
  const row = getDb().prepare("SELECT id, bill_to FROM load_pay_items WHERE id = ?").get(id) as
    | { id: number; bill_to: string }
    | undefined;
  if (!row) throw new Error("Pay item not found.");
  if (row.bill_to !== "driver") throw new Error("Only driver / OO pay items can be marked paid here.");
  getDb().prepare("UPDATE load_pay_items SET paid_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function deletePayItem(id: number): void {
  const row = getDb().prepare("SELECT load_id FROM load_pay_items WHERE id = ?").get(id) as
    | { load_id: number }
    | undefined;
  if (!row) throw new Error("Pay item not found.");
  getDb().prepare("DELETE FROM load_pay_items WHERE id = ?").run(id);
  syncCustomerRateFromPayItems(row.load_id);
}

/**
 * Lumper is always billed to the customer (TMS invoice PDF and QuickBooks use the same amount).
 * JC, 5:11 PM ET: bill it regardless of the rate confirmation.
 */
export const INVOICE_INCLUDES_LUMPER = true;

/** Customer income lines that belong on the customer invoice (TMS PDF and QuickBooks use the same rule). */
export function customerInvoiceBillableItems(loadId: number): LoadPayItem[] {
  return customerInvoicePayItems(loadId).filter((item) => INVOICE_INCLUDES_LUMPER || item.category !== "lumper");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function payItemAmount(item: { total: number | null; rate: number | null; qty: number | null }): number {
  if (item.total != null && !Number.isNaN(item.total)) return roundMoney(item.total);
  if (item.rate != null && !Number.isNaN(item.rate)) return roundMoney(item.rate * (item.qty ?? 1));
  return 0;
}

function moneyLabel(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * One lumper amount for the customer invoice.
 * Customer lumper pay lines and the driver receipt (lumper_actual) must not both be billed.
 * A blank or zero receipt counts as not entered. A driver-side pay item is not a customer line.
 */
export function resolveCustomerLumper(load: { id: number; lumper_actual?: number | null }):
  | { ok: true; mode: "none" }
  | { ok: true; mode: "pay-lines" }
  | { ok: true; mode: "actual"; amount: number }
  | { ok: false; message: string } {
  if (!INVOICE_INCLUDES_LUMPER) return { ok: true, mode: "none" };
  const payItems = customerInvoicePayItems(load.id).filter((item) => item.category === "lumper");
  const payTotal = roundMoney(payItems.reduce((sum, item) => sum + payItemAmount(item), 0));
  const hasPay = payItems.length > 0;
  const actualRaw = load.lumper_actual;
  const hasActual = actualRaw != null && !Number.isNaN(Number(actualRaw)) && roundMoney(Number(actualRaw)) > 0;
  const actual = hasActual ? roundMoney(Number(actualRaw)) : 0;
  if (hasPay && hasActual && Math.abs(payTotal - actual) >= 0.005) {
    return {
      ok: false,
      message: `Lumper is entered twice with different amounts (${moneyLabel(payTotal)} pay line vs ${moneyLabel(actual)} driver receipt). Fix one before invoicing.`,
    };
  }
  if (hasPay) return { ok: true, mode: "pay-lines" };
  if (hasActual) return { ok: true, mode: "actual", amount: actual };
  return { ok: true, mode: "none" };
}

export function customerInvoicePayItems(loadId: number): LoadPayItem[] {
  return listPayItems(loadId, "income").filter((item) => item.bill_to === "customer");
}

/** Flat customer freight only. Detention, fuel, layover, and other accessories stay out. */
export function flatCustomerRate(load: { id: number; rate?: number | null }): number | null {
  const linehaul = customerInvoicePayItems(load.id)
    .filter((item) => item.category === "flat_rate")
    .reduce((sum, item) => sum + (item.total ?? item.rate ?? 0), 0);
  if (linehaul > 0) return Math.round(linehaul * 100) / 100;
  if (load.rate != null && !Number.isNaN(load.rate)) return load.rate;
  return null;
}

/** Billed customer rate already on the load or on customer invoice lines. Never invents a number. */
export function billedCustomerRate(load: { id: number; rate?: number | null }): number | null {
  if (load.rate != null && !Number.isNaN(load.rate)) return load.rate;
  return flatCustomerRate(load);
}

/** New-load customer rate becomes the Income / Budget customer rate. Does not add a pay line. */
export function importCreateRateToFinancials(loadId: number, rate: number | null): void {
  if (rate == null || Number.isNaN(rate)) return;
  const flats = customerInvoicePayItems(loadId).filter((item) => item.category === "flat_rate");
  if (flats.length) return;
  getDb()
    .prepare("UPDATE loads SET rate = ?, updated_at = ? WHERE id = ?")
    .run(rate, new Date().toISOString(), loadId);
}

export function driverPayItems(loadId: number): LoadPayItem[] {
  return listPayItems(loadId).filter((item) => item.bill_to === "driver");
}

export function syncCustomerRateFromPayItems(loadId: number): void {
  const flats = customerInvoicePayItems(loadId).filter((item) => item.category === "flat_rate");
  if (!flats.length) return;
  const nextRate = Math.round(flats.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100) / 100;
  const load = getDb()
    .prepare("SELECT rate, oo_percent, oo_pay FROM loads WHERE id = ?")
    .get(loadId) as { rate: number | null; oo_percent: number | null; oo_pay: number | null } | undefined;
  if (!load) return;
  const nextOoPay = isAutoOwnerOperatorPay(load.oo_pay, load.rate, load.oo_percent)
    ? computeOwnerOperatorPay(nextRate, load.oo_percent)
    : load.oo_pay;
  if (nextRate === load.rate && nextOoPay === load.oo_pay) return;
  getDb()
    .prepare("UPDATE loads SET rate = ?, oo_pay = ?, updated_at = ? WHERE id = ?")
    .run(nextRate, nextOoPay, new Date().toISOString(), loadId);
}
