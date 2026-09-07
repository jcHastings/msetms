import { getDb } from "./db";
import {
  emptyPeriodTotals,
  fuelRowInWeek,
  fuelWeekAnchorDate,
  fuelWeekPaidStatsForWeek,
  isCurrentFuelWeek,
  isFuelBucket,
  isMoneyCodeCategory,
  localWeekRange,
  matchFuelDriver,
  normalizeUnit,
  parseFuelReport,
  parseFuelWeekStart,
  startOfLocalMonth,
  startOfLocalWeek,
  weekStartsFromFuelRows,
  type FuelCsvRowError,
  type FuelMatchLoad,
  type FuelPeriodTotals,
  type FuelRollup,
  type FuelTransactionView,
  type FuelWeekOption,
  type FuelWeekPaidStats,
} from "./fuel";
import { extractNProductDriverName } from "./fuel-fleetone";
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
  fromIso?: string;
  toIso?: string;
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
  if (filters?.fromIso) {
    clauses.push("fuel_transactions.occurred_at >= ?");
    params.push(filters.fromIso);
  }
  if (filters?.toIso) {
    clauses.push("fuel_transactions.occurred_at < ?");
    params.push(filters.toIso);
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

function listFuelMatchLoads(): FuelMatchLoad[] {
  return getDb()
    .prepare(
      `SELECT truck_id, driver_id, status FROM loads
       WHERE truck_id IS NOT NULL AND driver_id IS NOT NULL`,
    )
    .all() as FuelMatchLoad[];
}

function sameId(left: number | null | undefined, right: number | null | undefined): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a > 0 && a === b;
}

function fuelRowDriverName(row: { driver_name_raw: string; prompt_data: string }): string {
  return (
    extractNProductDriverName(row.driver_name_raw) ||
    row.driver_name_raw.trim() ||
    extractNProductDriverName(row.prompt_data)
  );
}

function storeFuelImportSource(sourceFile: string, text: string): void {
  getDb()
    .prepare(
      `INSERT INTO fuel_import_sources (source_file, text, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(source_file) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`,
    )
    .run(sourceFile, text, nowIso());
}

function applyParsedFuelDriverNames(
  parsedRows: Array<{
    driverName: string;
    unitNumber: string;
    invoice: string;
    amount: number | null;
    category: string;
    driverIdRaw?: string;
    prompt?: string;
    dedupKey?: string;
  }>,
): number {
  const drivers = listDrivers();
  const trucks = listTrucks();
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, driver_id, truck_id, amount, unit_number, invoice_number, driver_name_raw, category, dedup_key
       FROM fuel_transactions`,
    )
    .all() as Array<{
    id: number;
    driver_id: number | null;
    truck_id: number | null;
    amount: number | null;
    unit_number: string;
    invoice_number: string;
    driver_name_raw: string;
    category: string;
    dedup_key: string;
  }>;
  const update = db.prepare(
    `UPDATE fuel_transactions
     SET driver_name_raw = ?, invoice_number = ?, driver_id = ?, truck_id = ?
     WHERE id = ?`,
  );
  let updated = 0;
  for (const row of parsedRows) {
    if (isMoneyCodeCategory(row.category)) continue;
    const match = matchFuelDriver(
      {
        driverName: row.driverName,
        driverIdRaw: row.driverIdRaw ?? "",
        unitNumber: row.unitNumber,
        prompt: row.prompt ?? "",
      },
      drivers,
      trucks,
    );
    for (const hit of existing) {
      if (isMoneyCodeCategory(hit.category)) continue;
      if (!parsedFuelRowMatchesExisting(row, hit)) continue;
      const nextName = row.driverName.trim() || hit.driver_name_raw;
      const nextInvoice = row.invoice.trim() || hit.invoice_number;
      const nextDriverId = match.driverId;
      const nextTruckId = match.truckId ?? hit.truck_id;
      if (
        nextName === hit.driver_name_raw &&
        nextInvoice === hit.invoice_number &&
        (hit.driver_id ?? null) === nextDriverId &&
        (hit.truck_id ?? null) === nextTruckId
      ) {
        continue;
      }
      update.run(nextName, nextInvoice, nextDriverId, nextTruckId, hit.id);
      hit.driver_name_raw = nextName;
      hit.invoice_number = nextInvoice;
      hit.driver_id = nextDriverId;
      hit.truck_id = nextTruckId;
      updated += 1;
    }
  }
  return updated;
}

function parsedFuelRowMatchesExisting(
  parsed: { unitNumber: string; invoice: string; amount: number | null; dedupKey?: string },
  existing: { amount: number | null; unit_number: string; invoice_number: string; dedup_key: string },
): boolean {
  if (parsed.dedupKey && parsed.dedupKey === existing.dedup_key) return true;
  if (parsed.amount == null || existing.amount == null) return false;
  if (Math.abs(existing.amount - parsed.amount) >= 0.021) return false;
  const invoiceHit = Boolean(parsed.invoice && existing.invoice_number && parsed.invoice === existing.invoice_number);
  const unitHit = Boolean(
    parsed.unitNumber && existing.unit_number && normalizeUnit(parsed.unitNumber) === normalizeUnit(existing.unit_number),
  );
  return invoiceHit || unitHit;
}

function applyStoredFuelImportNames(): number {
  const sources = getDb().prepare("SELECT source_file, text FROM fuel_import_sources").all() as Array<{
    source_file: string;
    text: string;
  }>;
  let updated = 0;
  for (const source of sources) {
    let parsed;
    try {
      parsed = parseFuelReport(source.text, source.source_file);
    } catch {
      continue;
    }
    updated += applyParsedFuelDriverNames(parsed.rows);
  }
  return updated;
}

function looksLikeTruckOrLoadAssign(
  row: { driver_id: number | null; truck_id: number | null; unit_number: string },
  trucks: ReturnType<typeof listTrucks>,
  drivers: ReturnType<typeof listDrivers>,
  loads: FuelMatchLoad[],
): boolean {
  if (!row.driver_id) return false;
  const truck =
    trucks.find((item) => sameId(item.id, row.truck_id)) ??
    trucks.find((item) => item.unit_number.trim() === row.unit_number.trim());
  if (truck) {
    if (sameId(truck.assigned_driver_id, row.driver_id)) return true;
    if (drivers.some((driver) => sameId(driver.truck_id, truck.id) && sameId(driver.id, row.driver_id))) {
      return true;
    }
  }
  return loads.some((load) => sameId(load.truck_id, row.truck_id) && sameId(load.driver_id, row.driver_id));
}

export function rematchFuelTransactionDrivers(): number {
  let updated = applyStoredFuelImportNames();
  const drivers = listDrivers();
  const trucks = listTrucks();
  const loads = listFuelMatchLoads();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, driver_id, truck_id, category, unit_number, driver_name_raw, prompt_data
       FROM fuel_transactions`,
    )
    .all() as Array<{
    id: number;
    driver_id: number | null;
    truck_id: number | null;
    category: string;
    unit_number: string;
    driver_name_raw: string;
    prompt_data: string;
  }>;
  const update = db.prepare("UPDATE fuel_transactions SET driver_id = ?, truck_id = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      if (isMoneyCodeCategory(row.category)) continue;
      const name = fuelRowDriverName(row);
      const match = matchFuelDriver(
        {
          driverName: name,
          driverIdRaw: "",
          unitNumber: row.unit_number,
          prompt: row.prompt_data,
        },
        drivers,
        trucks,
      );
      let nextDriverId = match.driverId;
      if (!match.driverId && row.driver_id && !looksLikeTruckOrLoadAssign(row, trucks, drivers, loads)) {
        nextDriverId = row.driver_id;
      }
      const nextTruckId = match.truckId ?? row.truck_id;
      if (sameId(row.driver_id, nextDriverId) && sameId(row.truck_id, nextTruckId)) continue;
      if ((row.driver_id ?? null) === nextDriverId && (row.truck_id ?? null) === nextTruckId) continue;
      update.run(nextDriverId, nextTruckId, row.id);
      updated += 1;
    }
  })();
  return updated;
}

export function rematchUnmatchedFuelTransactions(): number {
  return rematchFuelTransactionDrivers();
}

export function importFuelFromText(
  text: string,
  sourceFile: string,
): { created: number; skipped: number; unmatched: number; errors: FuelCsvRowError[] } {
  storeFuelImportSource(sourceFile, text);
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
  applyParsedFuelDriverNames(parsed.rows);
  rematchUnmatchedFuelTransactions();
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
  through: Date = now,
): FuelRollup[] {
  const weekStart = startOfLocalWeek(now).toISOString();
  const monthStart = startOfLocalMonth(now).toISOString();
  const endIso = new Date(through.getTime() + 1).toISOString();
  const map = new Map<number, FuelRollup>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    if (row.occurred_at >= endIso) continue;
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

export function getFuelWeekPaidStats(weekStartYmd?: string, now = new Date()): FuelWeekPaidStats {
  const start = parseFuelWeekStart(weekStartYmd, now);
  const live = fuelWeekPaidStatsForWeek(listFuelTransactions(), start);
  if (isCurrentFuelWeek(start, now)) return live;
  const range = localWeekRange(start);
  const weekRows = listFuelTransactions({
    fromIso: range.start.toISOString(),
    toIso: range.end.toISOString(),
  });
  if (weekRows.length > 0) return live;
  return getFuelWeekReport(start)?.stats ?? live;
}

export type FuelWeekReport = {
  weekStartYmd: string;
  weekEndYmd: string;
  stats: FuelWeekPaidStats;
  driverRollups: FuelRollup[];
  truckRollups: FuelRollup[];
  txCount: number;
  savedAt: string;
};

type FuelWeekReportRow = {
  week_start_ymd: string;
  week_end_ymd: string;
  stats_json: string;
  driver_rollups_json: string;
  truck_rollups_json: string;
  tx_count: number;
  saved_at: string;
};

function parseWeekReport(row: FuelWeekReportRow): FuelWeekReport {
  return {
    weekStartYmd: row.week_start_ymd,
    weekEndYmd: row.week_end_ymd,
    stats: JSON.parse(row.stats_json) as FuelWeekPaidStats,
    driverRollups: JSON.parse(row.driver_rollups_json) as FuelRollup[],
    truckRollups: JSON.parse(row.truck_rollups_json) as FuelRollup[],
    txCount: row.tx_count,
    savedAt: row.saved_at,
  };
}

function upsertFuelWeekReport(weekStartYmd: string, rows: FuelTransactionView[]): FuelWeekReport {
  const range = localWeekRange(weekStartYmd);
  const weekRows = rows.filter((row) => fuelRowInWeek(row.occurred_at, range.startYmd));
  const through = new Date(range.end.getTime() - 1);
  const report: FuelWeekReport = {
    weekStartYmd: range.startYmd,
    weekEndYmd: range.endYmd,
    stats: fuelWeekPaidStatsForWeek(rows, range.startYmd),
    driverRollups: rollupRows(
      weekRows,
      through,
      (row) => (row.driver_id ? { id: row.driver_id, name: row.driver_name || "Driver" } : null),
      through,
    ),
    truckRollups: rollupRows(
      weekRows,
      through,
      (row) => (row.truck_id ? { id: row.truck_id, name: row.truck_unit || row.unit_number || "Truck" } : null),
      through,
    ),
    txCount: weekRows.length,
    savedAt: nowIso(),
  };
  getDb()
    .prepare(
      `INSERT INTO fuel_week_reports (
         week_start_ymd, week_end_ymd, stats_json, driver_rollups_json, truck_rollups_json, tx_count, saved_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_start_ymd) DO UPDATE SET
         week_end_ymd = excluded.week_end_ymd,
         stats_json = excluded.stats_json,
         driver_rollups_json = excluded.driver_rollups_json,
         truck_rollups_json = excluded.truck_rollups_json,
         tx_count = excluded.tx_count,
         saved_at = excluded.saved_at`,
    )
    .run(
      report.weekStartYmd,
      report.weekEndYmd,
      JSON.stringify(report.stats),
      JSON.stringify(report.driverRollups),
      JSON.stringify(report.truckRollups),
      report.txCount,
      report.savedAt,
    );
  return report;
}

export function syncFuelWeekReports(now = new Date()): FuelWeekReport[] {
  const rows = listFuelTransactions();
  const starts = new Set(weekStartsFromFuelRows(rows));
  const current = localWeekRange(now).startYmd;
  starts.add(current);
  for (const startYmd of starts) {
    const hasRows = rows.some((row) => fuelRowInWeek(row.occurred_at, startYmd));
    if (!hasRows && !isCurrentFuelWeek(startYmd, now)) continue;
    upsertFuelWeekReport(startYmd, rows);
  }
  return listFuelWeekReports();
}

export function listFuelWeekReports(): FuelWeekReport[] {
  return (
    getDb()
      .prepare("SELECT * FROM fuel_week_reports ORDER BY week_start_ymd DESC")
      .all() as FuelWeekReportRow[]
  ).map(parseWeekReport);
}

export function getFuelWeekReport(weekStartYmd: string): FuelWeekReport | null {
  const row = getDb()
    .prepare("SELECT * FROM fuel_week_reports WHERE week_start_ymd = ?")
    .get(weekStartYmd) as FuelWeekReportRow | undefined;
  return row ? parseWeekReport(row) : null;
}

export function listFuelWeekOptions(now = new Date()): FuelWeekOption[] {
  const current = localWeekRange(now);
  const seen = new Set<string>();
  const options: FuelWeekOption[] = [];
  const add = (startYmd: string, endYmd: string) => {
    if (seen.has(startYmd)) return;
    seen.add(startYmd);
    options.push({ startYmd, endYmd, current: startYmd === current.startYmd });
  };
  add(current.startYmd, current.endYmd);
  for (const report of listFuelWeekReports()) {
    add(report.weekStartYmd, report.weekEndYmd);
  }
  return options;
}

export function loadFuelWeekView(weekParam?: string, now = new Date()) {
  syncFuelWeekReports(now);
  const weekStartYmd = parseFuelWeekStart(weekParam, now);
  const range = localWeekRange(weekStartYmd);
  const current = isCurrentFuelWeek(weekStartYmd, now);
  const fromIso = range.start.toISOString();
  const toIso = range.end.toISOString();
  const weekRows = listFuelTransactions({ fromIso, toIso });
  const snapshot = getFuelWeekReport(weekStartYmd);
  const useLive = current || weekRows.length > 0;
  const anchor = fuelWeekAnchorDate(weekStartYmd, now);
  return {
    weekStartYmd,
    weekEndYmd: range.endYmd,
    fromIso,
    toIso,
    current,
    stats: useLive
      ? fuelWeekPaidStatsForWeek(listFuelTransactions(), weekStartYmd)
      : (snapshot?.stats ?? fuelWeekPaidStatsForWeek([], weekStartYmd)),
    driverRollups: useLive ? listFuelRollups(anchor) : (snapshot?.driverRollups ?? []),
    truckRollups: useLive ? listTruckFuelRollups(anchor) : (snapshot?.truckRollups ?? []),
    weeks: listFuelWeekOptions(now),
    mpgNow: anchor,
  };
}
