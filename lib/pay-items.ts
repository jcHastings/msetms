import { getDb } from "./db";
import { isPayItemCategory, type PayItemBillTo, type PayItemSide } from "./load-page-shared";

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

export function customerInvoicePayItems(loadId: number): LoadPayItem[] {
  return listPayItems(loadId, "income").filter((item) => item.bill_to === "customer");
}

/** Billed customer rate already on the load or on customer invoice lines. Never invents a number. */
export function billedCustomerRate(load: { id: number; rate?: number | null }): number | null {
  if (load.rate != null && !Number.isNaN(load.rate)) return load.rate;
  const income = customerInvoicePayItems(load.id);
  const linehaul = income
    .filter((item) => item.category === "flat_rate")
    .reduce((sum, item) => sum + (item.total ?? item.rate ?? 0), 0);
  if (linehaul > 0) return linehaul;
  const billed = income.reduce((sum, item) => sum + (item.total ?? 0), 0);
  return billed > 0 ? billed : null;
}

export function driverPayItems(loadId: number): LoadPayItem[] {
  return listPayItems(loadId).filter((item) => item.bill_to === "driver");
}

export function syncCustomerRateFromPayItems(loadId: number): void {
  const items = customerInvoicePayItems(loadId);
  if (!items.length) return;
  const total = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
  getDb().prepare("UPDATE loads SET rate = ?, updated_at = ? WHERE id = ?").run(total, new Date().toISOString(), loadId);
}
