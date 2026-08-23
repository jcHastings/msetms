import { getDb } from "./db";
import {
  matchFuelDriver,
  parseFuelCsv,
  startOfLocalMonth,
  startOfLocalWeek,
  type FuelCsvRowError,
  type FuelRollup,
  type FuelTransactionView,
} from "./fuel";
import { listDrivers, listTrucks } from "./queries";

function nowIso(): string {
  return new Date().toISOString();
}

const FUEL_SELECT = `SELECT fuel_transactions.*,
  drivers.name AS driver_name,
  trucks.unit_number AS truck_unit
  FROM fuel_transactions
  LEFT JOIN drivers ON drivers.id = fuel_transactions.driver_id
  LEFT JOIN trucks ON trucks.id = fuel_transactions.truck_id`;

export function listFuelTransactions(filters?: {
  driverId?: number;
  unmatchedOnly?: boolean;
}): FuelTransactionView[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.driverId) {
    clauses.push("fuel_transactions.driver_id = ?");
    params.push(filters.driverId);
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

export function importFuelFromCsv(
  text: string,
  sourceFile: string,
): { created: number; skipped: number; unmatched: number; errors: FuelCsvRowError[] } {
  const parsed = parseFuelCsv(text);
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
      occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
      card_last4, source_file, category, unit_number, driver_name_raw, dedup_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        row.location,
        row.gallons,
        row.pricePerGallon,
        row.amount,
        row.cardLast4,
        sourceFile,
        row.category,
        match.unitNumber,
        row.driverName,
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

export function listFuelRollups(now = new Date()): FuelRollup[] {
  const weekStart = startOfLocalWeek(now).toISOString();
  const monthStart = startOfLocalMonth(now).toISOString();
  const rows = listFuelTransactions().filter((row) => row.driver_id);
  const map = new Map<number, FuelRollup>();
  for (const row of rows) {
    const driverId = row.driver_id as number;
    const current = map.get(driverId) ?? {
      driverId,
      driverName: row.driver_name || "Driver",
      weekGallons: 0,
      weekAmount: 0,
      monthGallons: 0,
      monthAmount: 0,
    };
    if (row.occurred_at >= monthStart) {
      current.monthGallons += row.gallons ?? 0;
      current.monthAmount += row.amount ?? 0;
    }
    if (row.occurred_at >= weekStart) {
      current.weekGallons += row.gallons ?? 0;
      current.weekAmount += row.amount ?? 0;
    }
    map.set(driverId, current);
  }
  return [...map.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

export function getDriverFuelRollup(driverId: number, now = new Date()): FuelRollup | null {
  return listFuelRollups(now).find((row) => row.driverId === driverId) ?? {
    driverId,
    driverName: "",
    weekGallons: 0,
    weekAmount: 0,
    monthGallons: 0,
    monthAmount: 0,
  };
}
