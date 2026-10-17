import { getDb } from "./db";

export const FUEL_AUTO_MATCH_MIN_SCORE = 70;
export const FUEL_AUTO_MATCH_AMBIGUOUS_GAP = 8;

export type FuelMatchFacts = {
  occurredAt: string;
  amount: number | null;
  gallons: number | null;
  merchant: string;
  cardLast4: string;
};

export type FuelMatchScore = {
  score: number;
  amountMatched: boolean;
  last4Matched: boolean;
};

export type FuelAutoMatchCandidate = FuelMatchScore & { id: number };

function dayUtcMs(value: string): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const ms = Date.parse(`${day}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const dated = Date.parse(raw);
  if (!Number.isFinite(dated)) return null;
  return Date.parse(`${new Date(dated).toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function last4(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function normalizeMerchant(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function scoreFuelReceiptMatch(receipt: FuelMatchFacts, transaction: FuelMatchFacts): FuelMatchScore {
  let score = 0;
  const receiptDay = dayUtcMs(receipt.occurredAt);
  const txDay = dayUtcMs(transaction.occurredAt);
  if (receiptDay != null && txDay != null) {
    const days = Math.abs(receiptDay - txDay) / 86_400_000;
    if (days === 0) score += 40;
    else if (days <= 1) score += 25;
    else if (days <= 3) score += 10;
  }

  let amountMatched = false;
  if (receipt.amount != null && transaction.amount != null) {
    const diff = Math.abs(receipt.amount - transaction.amount);
    const base = Math.abs(transaction.amount);
    const pct = base === 0 ? (diff === 0 ? 0 : 1) : diff / base;
    if (diff < 0.005) {
      score += 30;
      amountMatched = true;
    } else if (diff <= 1 || pct <= 0.01) {
      score += 20;
      amountMatched = true;
    } else if (pct <= 0.05) {
      score += 8;
    }
  }

  if (receipt.gallons != null && transaction.gallons != null) {
    const gallonsDiff = Math.abs(receipt.gallons - transaction.gallons);
    if (gallonsDiff < 0.05) score += 15;
    else if (gallonsDiff <= 2) score += 8;
  }

  const receiptMerchant = normalizeMerchant(receipt.merchant);
  const txMerchant = normalizeMerchant(transaction.merchant);
  if (receiptMerchant && txMerchant && (receiptMerchant.includes(txMerchant) || txMerchant.includes(receiptMerchant))) {
    score += 15;
  }

  const receiptLast4 = last4(receipt.cardLast4);
  const txLast4 = last4(transaction.cardLast4);
  const last4Matched = Boolean(receiptLast4 && txLast4 && receiptLast4 === txLast4);
  if (last4Matched) score += 25;

  return { score: Math.min(100, score), amountMatched, last4Matched };
}

export function pickFuelAutoMatch(ranked: FuelAutoMatchCandidate[]): number | null {
  if (ranked.length === 0) return null;
  const byScore = [...ranked].sort((left, right) => right.score - left.score || left.id - right.id);
  const top = byScore[0];
  const second = byScore[1];
  if (!top) return null;
  if (second && top.score - second.score <= FUEL_AUTO_MATCH_AMBIGUOUS_GAP) return null;
  if (top.score < FUEL_AUTO_MATCH_MIN_SCORE || (!top.amountMatched && !top.last4Matched)) return null;
  return top.id;
}

type PendingReceiptRow = {
  id: number;
  driver_id: number | null;
  occurred_at: string;
  gallons: number | null;
  amount: number | null;
  station: string;
  merchant: string;
  card_last4: string;
};

type FuelTxRow = {
  id: number;
  driver_id: number | null;
  occurred_at: string;
  gallons: number | null;
  amount: number | null;
  location: string;
  card_last4: string;
};

export function autoMatchPendingFuelReceipts(): { matched: number } {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT id, driver_id, occurred_at, gallons, amount, station, merchant, card_last4
       FROM fuel_receipts
       WHERE status = 'pending_match'
         AND fuel_transaction_id IS NULL
       ORDER BY id ASC`,
    )
    .all() as PendingReceiptRow[];
  if (pending.length === 0) return { matched: 0 };

  const claimed = new Set(
    (
      db
        .prepare(`SELECT fuel_transaction_id AS id FROM fuel_receipts WHERE fuel_transaction_id IS NOT NULL`)
        .all() as Array<{ id: number }>
    ).map((row) => row.id),
  );
  const transactions = db
    .prepare(
      `SELECT id, driver_id, occurred_at, gallons, amount, location, card_last4
       FROM fuel_transactions
       ORDER BY id ASC`,
    )
    .all() as FuelTxRow[];

  const update = db.prepare(`UPDATE fuel_receipts SET fuel_transaction_id = ?, status = 'matched' WHERE id = ?`);
  let matched = 0;
  db.transaction(() => {
    for (const receipt of pending) {
      const scored = transactions
        .filter((tx) => {
          if (claimed.has(tx.id)) return false;
          if (receipt.driver_id && tx.driver_id && receipt.driver_id !== tx.driver_id) return false;
          return true;
        })
        .map((tx) => ({
          id: tx.id,
          ...scoreFuelReceiptMatch(
            {
              occurredAt: receipt.occurred_at,
              amount: receipt.amount,
              gallons: receipt.gallons,
              merchant: receipt.merchant || receipt.station,
              cardLast4: receipt.card_last4,
            },
            {
              occurredAt: tx.occurred_at,
              amount: tx.amount,
              gallons: tx.gallons,
              merchant: tx.location,
              cardLast4: tx.card_last4,
            },
          ),
        }));
      const pick = pickFuelAutoMatch(scored);
      if (pick == null) continue;
      update.run(pick, receipt.id);
      claimed.add(pick);
      matched += 1;
    }
  })();
  return { matched };
}
