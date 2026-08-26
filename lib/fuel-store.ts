import { getDb } from "./db";
import {
  emptyPeriodTotals,
  isFuelBucket,
  matchFuelDriver,
  parseFuelReport,
  startOfLocalMonth,
  startOfLocalWeek,
  type FuelCsvRowError,
  type FuelPeriodTotals,
  type FuelRollup,
  type FuelTransactionView,
} from "./fuel";
import { listDrivers, listTrucks } from "./queries";

function nowIso(): string {
  return new Date().toISOString();
}

const FUEL_SELECT = `SELECT fuel_transactions.*,
  drivers.name AS driver_name,
  trucks.unit_number AS truck_unit,
  loads.load_number AS load_number
  FROM fuel_transactions
  LEFT JOIN drivers ON drivers.id = fuel_transactions.driver_id
  LEFT JOIN trucks ON trucks.id = fuel_transactions.truck_id
  LEFT JOIN loads ON loads.id = fuel_transactions.load_id`;

export function listFuelTransactions(filters?: {
  driverId?: number;
  truckId?: number;
  unmatchedOnly?: boolean;
}): FuelTransactionView[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.driverId) {
    clauses.push("fuel_transactions.driver_id = ?");
    params.push(filters.driverId);
  }
  if (filters?.truckId) {
    clauses.push("fuel_transactions.truck_id = ?");
    params.push(filters.truckId);
  }
  if (filters?.unmatchedOnly) {
    clauses.push("fuel_transactions.driver_id IS NULL");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`${FUEL_SELECT} ${where} ORDER BY fuel_transactions.occurred_at DESC, fuel_transactions.id DESC`)
    .all(...params) as FuelTransactionView[];
}

export function getFuelTransaction(id: number): FuelTransactionView | null {
  return (
    (getDb().prepare(`${FUEL_SELECT} WHERE fuel_transactions.id = ?`).get(id) as FuelTransactionView | undefined) ??
    null
  );
}

export function importFuelFromText(
  text: string,
  sourceFile: string,
): { created: number; skipped: number; unmatched: number; errors: FuelCsvRowError[] } {
  const parsed = parseFuelReport(text, sourceFile);
  const drivers = listDrivers();
  const trucks = listTrucks();
  const db = getDb();
  const existing = new Set(
    (db.prepare("SELECT dedup_key FROM fuel_transactions").all() as Array<{ dedup_key: string }>).map(
      (row) => row.dedup_key,
    ),
  );
  const insert = db.prepare(
    `INSERT INTO fuel_transactions (
      occurred_at, driver_id, truck_id, load_id, location, gallons, price_per_gallon, amount,
      card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
      prompt_data, dedup_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let created = 0;
  let skipped = parsed.skipped;
  let unmatched = 0;
  const seen = new Set<string>();
  db.transaction(() => {
    for (const row of parsed.rows) {
      if (existing.has(row.dedupKey) || seen.has(row.dedupKey)) {
        skipped += 1;
        continue;
      }
      const match = matchFuelDriver(row, drivers, trucks);
      insert.run(
        row.occurredAt,
        match.driverId,
        match.truckId,
        null,
        row.location,
        row.gallons,
        row.pricePerGallon,
        row.amount,
        row.cardLast4,
        sourceFile,
        row.category,
        match.unitNumber,
        row.driverName,
        row.invoice,
        row.prompt,
        row.dedupKey,
        nowIso(),
      );
      seen.add(row.dedupKey);
      if (match.driverId) created += 1;
      else unmatched += 1;
    }
  })();
  return { created, skipped, unmatched, errors: parsed.errors };
}

export function importFuelFromCsv(text: string, sourceFile: string) {
  return importFuelFromText(text, sourceFile);
}

export function assignFuelTransactionDriver(id: number, driverId: number): void {
  const row = getFuelTransaction(id);
  if (!row) throw new Error("Fuel row is missing.");
  const driver = listDrivers().find((item) => item.id === driverId);
  if (!driver) throw new Error("Pick a driver.");
  const truckId = row.truck_id ?? driver.truck_id;
  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = ?, truck_id = ? WHERE id = ?")
    .run(driverId, truckId, id);
}

export function deleteFuelTransaction(id: number): void {
  const row = getFuelTransaction(id);
  if (!row) throw new Error("Fuel row is missing.");
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE fuel_receipts SET fuel_transaction_id = NULL WHERE fuel_transaction_id = ?").run(id);
    db.prepare("DELETE FROM fuel_transactions WHERE id = ?").run(id);
  })();
}

export function assignFuelTransactionLoad(id: number, loadId: number): void {
  const row = getFuelTransaction(id);
  if (!row) throw new Error("Fuel row is missing.");
  const load = getDb().prepare("SELECT id FROM loads WHERE id = ?").get(loadId) as { id: number } | undefined;
  if (!load) throw new Error("Pick a load.");
  getDb().prepare("UPDATE fuel_transactions SET load_id = ? WHERE id = ?").run(loadId, id);
}

function addToPeriod(period: FuelPeriodTotals, row: FuelTransactionView): void {
  period.gallons += row.gallons ?? 0;
  period.amount += row.amount ?? 0;
  if (!isFuelBucket(row.category)) return;
  period[row.category].gallons += row.gallons ?? 0;
  period[row.category].amount += row.amount ?? 0;
}

function toRollup(id: number, name: string): FuelRollup {
  const week = emptyPeriodTotals();
  const month = emptyPeriodTotals();
  return {
    id,
    name,
    week,
    month,
    weekGallons: 0,
    weekAmount: 0,
    monthGallons: 0,
    monthAmount: 0,
  };
}

function syncRollupTotals(row: FuelRollup): FuelRollup {
  row.weekGallons = row.week.gallons;
  row.weekAmount = row.week.amount;
  row.monthGallons = row.month.gallons;
  row.monthAmount = row.month.amount;
  return row;
}

function rollupRows(
  rows: FuelTransactionView[],
  now: Date,
  keyOf: (row: FuelTransactionView) => { id: number; name: string } | null,
): FuelRollup[] {
  const weekStart = startOfLocalWeek(now).toISOString();
  const monthStart = startOfLocalMonth(now).toISOString();
  const map = new Map<number, FuelRollup>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const current = map.get(key.id) ?? toRollup(key.id, key.name);
    if (row.occurred_at >= monthStart) addToPeriod(current.month, row);
    if (row.occurred_at >= weekStart) addToPeriod(current.week, row);
    map.set(key.id, syncRollupTotals(current));
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function listFuelRollups(now = new Date()): FuelRollup[] {
  return rollupRows(listFuelTransactions(), now, (row) =>
    row.driver_id ? { id: row.driver_id, name: row.driver_name || "Driver" } : null,
  );
}

export function listTruckFuelRollups(now = new Date()): FuelRollup[] {
  return rollupRows(listFuelTransactions(), now, (row) =>
    row.truck_id ? { id: row.truck_id, name: row.truck_unit || row.unit_number || "Truck" } : null,
  );
}

export function getDriverFuelRollup(driverId: number, now = new Date()): FuelRollup {
  return (
    listFuelRollups(now).find((row) => row.id === driverId) ?? {
      ...toRollup(driverId, ""),
    }
  );
}
