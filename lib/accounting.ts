import { getDb } from "./db";
import { getLoad, listDrivers, listLoads } from "./queries";
import { listPayItems, markPayItemPaid, type LoadPayItem } from "./pay-items";
import { computeOwnerOperatorPay } from "./settlement";
import { isOwnerOperator, type LoadView } from "./types";
import { buildXlsxFromGrid } from "./xlsx-first-sheet";

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
    .filter((load) => load.accounting_desk === "accounting")
    .map((load) => ({
      ...load,
      billed: Boolean(load.tms_invoice_number || load.qbo_invoice_id),
      paid: Boolean(load.invoice_paid),
      invoiceLabel: load.tms_invoice_number || load.qbo_invoice_number || load.qbo_invoice_id || "Unbilled",
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

export type DriverPayLine = {
  key: string;
  load: LoadView;
  driverName: string;
  description: string;
  amount: number;
  status: "open" | "paid";
  settlement: Settlement | null;
  payItem: LoadPayItem | null;
};

export type DriverPayGroup = {
  driverName: string;
  lines: DriverPayLine[];
  openTotal: number;
  paidTotal: number;
};

function inPayPeriod(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = (iso || "").slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function defaultPayPeriod(now = new Date()): { from: string; to: string } {
  const day = new Date(now);
  const weekday = day.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(day);
  start.setDate(day.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

export function listDriverPay(from = "", to = ""): DriverPayLine[] {
  const settlements = getDb().prepare("SELECT * FROM settlements").all() as Settlement[];
  const byLoad = new Map(settlements.map((row) => [row.load_id, row]));
  const lines: DriverPayLine[] = [];

  for (const load of listLoads({ status: "all" })) {
    if (load.accounting_desk !== "accounting") continue;
    const periodDate = load.delivery_end || load.delivery_start || load.updated_at;
    if (!inPayPeriod(periodDate, from, to)) continue;

    if (isOwnerOperator(load.driver_type)) {
      const amount = load.oo_pay ?? computeOwnerOperatorPay(load.rate, load.oo_percent) ?? 0;
      const settlement = byLoad.get(load.id) ?? null;
      lines.push({
        key: `oo-${load.id}`,
        load,
        driverName: load.driver_name ?? "—",
        description: "Owner-operator settlement",
        amount,
        status: settlement?.status === "paid" ? "paid" : "open",
        settlement,
        payItem: null,
      });
    }

    for (const item of listPayItems(load.id).filter((row) => row.bill_to === "driver")) {
      lines.push({
        key: `item-${item.id}`,
        load,
        driverName: item.payee || load.driver_name || "—",
        description: item.category.replaceAll("_", " "),
        amount: item.total ?? 0,
        status: item.paid_at ? "paid" : "open",
        settlement: null,
        payItem: item,
      });
    }
  }

  return lines;
}

export function groupDriverPay(lines: DriverPayLine[]): DriverPayGroup[] {
  const groups = new Map<string, DriverPayGroup>();
  for (const line of lines) {
    const current = groups.get(line.driverName) ?? {
      driverName: line.driverName,
      lines: [],
      openTotal: 0,
      paidTotal: 0,
    };
    current.lines.push(line);
    if (line.status === "paid") current.paidTotal += line.amount;
    else current.openTotal += line.amount;
    groups.set(line.driverName, current);
  }
  return [...groups.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

export function closeDriverPayPeriod(from: string, to: string): number {
  let count = 0;
  for (const line of listDriverPay(from, to)) {
    if (line.status === "paid") continue;
    if (line.payItem) {
      markPayItemPaid(line.payItem.id);
      count += 1;
    } else {
      markSettlementPaid(line.load.id);
      count += 1;
    }
  }
  return count;
}

export function renderDriverPayCsv(lines: DriverPayLine[]): string {
  const header = ["Driver", "Load #", "Description", "Amount", "Status", "Delivery", "Customer"];
  const rows = lines.map((line) =>
    [
      line.driverName,
      line.load.load_number,
      line.description,
      line.amount.toFixed(2),
      line.status,
      (line.load.delivery_end || line.load.delivery_start || "").slice(0, 10),
      line.load.customer_name,
    ]
      .map((value) => {
        const raw = String(value ?? "");
        return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
      })
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function renderDriverPayXlsx(lines: DriverPayLine[]): Uint8Array {
  return buildXlsxFromGrid([
    ["Driver", "Load #", "Description", "Amount", "Status", "Delivery", "Customer"],
    ...lines.map((line) => [
      line.driverName,
      line.load.load_number,
      line.description,
      Number(line.amount.toFixed(2)),
      line.status,
      (line.load.delivery_end || line.load.delivery_start || "").slice(0, 10),
      line.load.customer_name,
    ]),
  ]);
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
    memo: "Demo lumper",
    amount: 150,
    loadId: load?.id ?? null,
  });
  const drivers = listDrivers();
  const oo = drivers.find((driver) => isOwnerOperator(driver.driver_type));
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
