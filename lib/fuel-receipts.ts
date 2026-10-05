import { getDb } from "./db";
import { extractStateCode } from "./locations";
import { isMoneyCodeCategory, type FuelTransactionView } from "./fuel";
import { listFuelTransactions } from "./fuel-store";
import { listLoads } from "./queries";
import type { Attachment } from "./types";

export type FuelReceiptStatus = "pending_match" | "matched";

export type FuelReceipt = {
  id: number;
  load_id: number | null;
  driver_id: number | null;
  attachment_id: number | null;
  fuel_transaction_id: number | null;
  occurred_at: string;
  gallons: number | null;
  amount: number | null;
  state: string;
  station: string;
  merchant: string;
  card_last4: string;
  status: FuelReceiptStatus;
  stored_name: string;
  original_name: string;
  mime_type: string;
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

function normalizeStatus(value: string | null | undefined): FuelReceiptStatus {
  return value === "matched" ? "matched" : "pending_match";
}

function mapFuelReceipt(row: FuelReceipt): FuelReceipt {
  return {
    ...row,
    load_id: row.load_id ?? null,
    status: normalizeStatus(row.status),
    amount: row.amount ?? null,
    merchant: row.merchant ?? "",
    card_last4: row.card_last4 ?? "",
    stored_name: row.stored_name ?? "",
    original_name: row.original_name ?? "",
    mime_type: row.mime_type ?? "",
  };
}

export function addFuelReceipt(input: {
  loadId?: number | null;
  driverId: number | null;
  attachmentId: number | null;
  fuelTransactionId?: number | null;
  occurredAt?: string;
  gallons?: number | null;
  amount?: number | null;
  state?: string;
  station?: string;
  merchant?: string;
  cardLast4?: string;
  status?: FuelReceiptStatus;
  storedName?: string;
  originalName?: string;
  mimeType?: string;
}): number {
  const loadId = input.loadId && input.loadId > 0 ? input.loadId : null;
  const fuelTransactionId = input.fuelTransactionId && input.fuelTransactionId > 0 ? input.fuelTransactionId : null;
  const status = input.status ?? (loadId || fuelTransactionId ? "matched" : "pending_match");
  const result = getDb()
    .prepare(
      `INSERT INTO fuel_receipts (
        load_id, driver_id, attachment_id, fuel_transaction_id, occurred_at, gallons, amount,
        state, station, merchant, card_last4, status, stored_name, original_name, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      input.driverId,
      input.attachmentId,
      fuelTransactionId,
      input.occurredAt ?? new Date().toISOString(),
      input.gallons ?? null,
      input.amount ?? null,
      (input.state ?? "").trim().toUpperCase(),
      (input.station ?? "").trim(),
      (input.merchant ?? input.station ?? "").trim(),
      (input.cardLast4 ?? "").replace(/\D/g, "").slice(-4),
      status,
      input.storedName ?? "",
      input.originalName ?? "",
      input.mimeType ?? "",
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function getFuelReceipt(id: number): FuelReceipt | null {
  const row = getDb().prepare("SELECT * FROM fuel_receipts WHERE id = ?").get(id) as FuelReceipt | undefined;
  return row ? mapFuelReceipt(row) : null;
}

export function listFuelReceipts(loadId?: number): FuelReceipt[] {
  if (loadId != null) {
    return (getDb().prepare("SELECT * FROM fuel_receipts WHERE load_id = ? ORDER BY id DESC").all(loadId) as FuelReceipt[]).map(
      mapFuelReceipt,
    );
  }
  return (getDb().prepare("SELECT * FROM fuel_receipts ORDER BY id DESC").all() as FuelReceipt[]).map(mapFuelReceipt);
}

export function listDriverFuelReceipts(driverId: number, status?: FuelReceiptStatus): FuelReceipt[] {
  if (status) {
    return (
      getDb()
        .prepare("SELECT * FROM fuel_receipts WHERE driver_id = ? AND status = ? ORDER BY id DESC")
        .all(driverId, status) as FuelReceipt[]
    ).map(mapFuelReceipt);
  }
  return (
    getDb().prepare("SELECT * FROM fuel_receipts WHERE driver_id = ? ORDER BY id DESC").all(driverId) as FuelReceipt[]
  ).map(mapFuelReceipt);
}

export function receiptIdForTransaction(transactionId: number): number | null {
  const row = getDb()
    .prepare("SELECT id FROM fuel_receipts WHERE fuel_transaction_id = ? ORDER BY id DESC LIMIT 1")
    .get(transactionId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function linkFuelReceipt(receiptId: number, transactionId: number): void {
  getDb()
    .prepare("UPDATE fuel_receipts SET fuel_transaction_id = ?, status = 'matched' WHERE id = ?")
    .run(transactionId, receiptId);
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
