import { getDb } from "./db";
import { extractStateCode } from "./locations";
import { isMoneyCodeCategory, type FuelTransactionView } from "./fuel";
import { listFuelTransactions } from "./fuel-store";
import { listLoads } from "./queries";
import type { Attachment } from "./types";

export type FuelReceipt = {
  id: number;
  load_id: number;
  driver_id: number | null;
  attachment_id: number | null;
  fuel_transaction_id: number | null;
  occurred_at: string;
  gallons: number | null;
  state: string;
  station: string;
  created_at: string;
};

export type FuelMatchStatus = "matched" | "no_photo" | "wrong_state" | "gallons_off";

export type FuelMatchRow = {
  transaction: FuelTransactionView;
  receipt: FuelReceipt | null;
  loadId: number | null;
  loadNumber: string;
  status: FuelMatchStatus;
};

export function addFuelReceipt(input: {
  loadId: number;
  driverId: number | null;
  attachmentId: number | null;
  occurredAt?: string;
  gallons?: number | null;
  state?: string;
  station?: string;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO fuel_receipts (
        load_id, driver_id, attachment_id, fuel_transaction_id, occurred_at, gallons, state, station, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.loadId,
      input.driverId,
      input.attachmentId,
      input.occurredAt ?? new Date().toISOString(),
      input.gallons ?? null,
      (input.state ?? "").trim().toUpperCase(),
      (input.station ?? "").trim(),
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function listFuelReceipts(loadId?: number): FuelReceipt[] {
  if (loadId != null) {
    return getDb().prepare("SELECT * FROM fuel_receipts WHERE load_id = ? ORDER BY id DESC").all(loadId) as FuelReceipt[];
  }
  return getDb().prepare("SELECT * FROM fuel_receipts ORDER BY id DESC").all() as FuelReceipt[];
}

export function linkFuelReceipt(receiptId: number, transactionId: number): void {
  getDb().prepare("UPDATE fuel_receipts SET fuel_transaction_id = ? WHERE id = ?").run(transactionId, receiptId);
}

function dayKey(value: string): string {
  return String(value ?? "").slice(0, 10);
}

function gallonsOff(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return false;
  return Math.abs(left - right) > 2;
}

export function listFuelMatchQueue(): FuelMatchRow[] {
  const transactions = listFuelTransactions().filter((row) => !isMoneyCodeCategory(row.category));
  const receipts = listFuelReceipts();
  const loads = listLoads({ status: "all" });
  const usedReceipts = new Set<number>();
  return transactions.map((transaction) => {
    const load =
      loads.find((item) => item.truck_id === transaction.truck_id && dayKey(item.pickup_start) === dayKey(transaction.occurred_at)) ??
      loads.find((item) => item.driver_id === transaction.driver_id && dayKey(item.pickup_start) === dayKey(transaction.occurred_at)) ??
      loads.find((item) => item.truck_id === transaction.truck_id) ??
      null;
    const receipt =
      receipts.find((item) => {
        if (usedReceipts.has(item.id)) return false;
        if (item.fuel_transaction_id === transaction.id) return true;
        if (load && item.load_id === load.id && dayKey(item.occurred_at) === dayKey(transaction.occurred_at)) return true;
        return false;
      }) ?? null;
    if (receipt) usedReceipts.add(receipt.id);
    const efsState = extractStateCode(transaction.location || "");
    const receiptState = receipt?.state || "";
    let status: FuelMatchStatus = "no_photo";
    if (receipt) {
      if (receiptState && efsState && receiptState !== efsState) status = "wrong_state";
      else if (gallonsOff(receipt.gallons, transaction.gallons)) status = "gallons_off";
      else status = "matched";
    }
    return {
      transaction,
      receipt,
      loadId: load?.id ?? receipt?.load_id ?? null,
      loadNumber: load?.load_number ?? "",
      status,
    };
  });
}

export function fuelReceiptsForAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter((item) => item.kind === "fuel_receipt");
}
