import { getDb } from "./db";
import { getLoad, listDrivers, listLoads } from "./queries";
import { computeOwnerOperatorPay } from "./settlement";
import type { LoadView } from "./types";

export type Bill = {
  id: number;
  vendor: string;
  memo: string;
  amount: number;
  load_id: number | null;
  status: "open" | "paid";
  created_at: string;
};

export type Settlement = {
  id: number;
  driver_id: number;
  load_id: number;
  amount: number;
  status: "open" | "paid";
  paid_at: string;
  created_at: string;
};

function now(): string {
  return new Date().toISOString();
}

export function listReceivables(): Array<
  LoadView & { billed: boolean; paid: boolean; invoiceLabel: string }
> {
  return listLoads({ status: "all" })
    .filter((load) => load.status === "delivered" || load.status === "completed")
    .map((load) => ({
      ...load,
      billed: Boolean(load.qbo_invoice_id),
      paid: Boolean(load.invoice_paid),
      invoiceLabel: load.qbo_invoice_number || load.qbo_invoice_id || "Unbilled",
    }));
}

export function listBills(): Bill[] {
  return getDb().prepare("SELECT * FROM bills ORDER BY id DESC").all() as Bill[];
}

export function createBill(input: { vendor: string; memo: string; amount: number; loadId?: number | null }): number {
  if (!input.vendor.trim()) throw new Error("Vendor is required.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Amount must be positive.");
  const result = getDb()
    .prepare(
      `INSERT INTO bills (vendor, memo, amount, load_id, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    )
    .run(input.vendor.trim(), input.memo.trim(), input.amount, input.loadId ?? null, now());
  return Number(result.lastInsertRowid);
}

export function markBillPaid(id: number): void {
  getDb().prepare("UPDATE bills SET status = 'paid' WHERE id = ?").run(id);
}

export function listDriverPay(): Array<{
  load: LoadView;
  driverName: string;
  amount: number;
  settlement: Settlement | null;
}> {
  const settlements = getDb().prepare("SELECT * FROM settlements").all() as Settlement[];
  const byLoad = new Map(settlements.map((row) => [row.load_id, row]));
  return listLoads({ status: "all" })
    .filter((load) => load.driver_type === "owner_operator" && (load.status === "delivered" || load.status === "completed"))
    .map((load) => ({
      load,
      driverName: load.driver_name ?? "—",
      amount: load.oo_pay ?? computeOwnerOperatorPay(load.rate, load.oo_percent) ?? 0,
      settlement: byLoad.get(load.id) ?? null,
    }));
}

export function markSettlementPaid(loadId: number): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (!load.driver_id) throw new Error("No driver on this load.");
  const amount = load.oo_pay ?? computeOwnerOperatorPay(load.rate, load.oo_percent) ?? 0;
  const existing = getDb().prepare("SELECT id FROM settlements WHERE load_id = ?").get(loadId) as
    | { id: number }
    | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE settlements SET status = 'paid', paid_at = ?, amount = ? WHERE id = ?")
      .run(now(), amount, existing.id);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO settlements (driver_id, load_id, amount, status, paid_at, created_at)
       VALUES (?, ?, ?, 'paid', ?, ?)`,
    )
    .run(load.driver_id, loadId, amount, now(), now());
}

export function listCommissions(): Array<{
  load: LoadView;
  percent: number;
  amount: number;
}> {
  const percent = 3;
  return listLoads({ status: "all" })
    .filter((load) => load.status === "delivered" || load.status === "completed")
    .filter((load) => load.rate != null)
    .map((load) => ({
      load,
      percent,
      amount: Math.round(((load.rate ?? 0) * percent) / 100 * 100) / 100,
    }));
}

export function seedDemoAccounting(): void {
  const count = (getDb().prepare("SELECT COUNT(*) as count FROM bills").get() as { count: number }).count;
  if (count > 0) return;
  const load = listLoads({ status: "delivered" })[0];
  createBill({
    vendor: "Atlanta DC Lumper",
    memo: "Demo lumper — labeled demo, not a live AP feed",
    amount: 150,
    loadId: load?.id ?? null,
  });
  const drivers = listDrivers();
  const oo = drivers.find((driver) => driver.driver_type === "owner_operator");
  const ooLoad = listLoads({ status: "all" }).find((load) => load.driver_id === oo?.id);
  if (ooLoad) {
    getDb()
      .prepare(
        `INSERT INTO settlements (driver_id, load_id, amount, status, paid_at, created_at)
         VALUES (?, ?, ?, 'open', '', ?)`,
      )
      .run(ooLoad.driver_id, ooLoad.id, ooLoad.oo_pay ?? 0, now());
  }
}
