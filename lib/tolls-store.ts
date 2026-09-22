import { getDb } from "./db";
import { listDrivers, listTrucks } from "./queries";
import {
  groupTollTxByList,
  isCurrentTollWeek,
  listTollWeekOptions,
  normalizeTransponder,
  parseTollPeriod,
  parseTollReport,
  parseTollWeekStart,
  tollRangeForPeriod,
  type ParsedTollCsvRow,
  type TollCsvRowError,
  type TollImportResult,
  type TollPeriod,
  type TollTransactionView,
  type TollTxListKind,
  type TollWeekOption,
} from "./tolls";
import { localWeekRange } from "./fuel";

const TOLL_SELECT = `SELECT toll_transactions.*,
  drivers.name AS driver_name,
  trucks.unit_number AS truck_unit,
  loads.load_number AS load_number
  FROM toll_transactions
  LEFT JOIN drivers ON drivers.id = toll_transactions.driver_id
  LEFT JOIN trucks ON trucks.id = toll_transactions.truck_id
  LEFT JOIN loads ON loads.id = toll_transactions.load_id`;

function nowIso(): string {
  return new Date().toISOString();
}

export function listTollTransactions(filters?: {
  driverId?: number;
  truckId?: number;
  unmatchedOnly?: boolean;
  fromIso?: string;
  toIso?: string;
  category?: TollTxListKind;
}): TollTransactionView[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.driverId) {
    clauses.push("toll_transactions.driver_id = ?");
    params.push(filters.driverId);
  }
  if (filters?.truckId) {
    clauses.push("toll_transactions.truck_id = ?");
    params.push(filters.truckId);
  }
  if (filters?.unmatchedOnly) {
    clauses.push("toll_transactions.driver_id IS NULL");
  }
  if (filters?.fromIso) {
    clauses.push("toll_transactions.occurred_at >= ?");
    params.push(filters.fromIso);
  }
  if (filters?.toIso) {
    clauses.push("toll_transactions.occurred_at < ?");
    params.push(filters.toIso);
  }
  if (filters?.category) {
    clauses.push("toll_transactions.category = ?");
    params.push(filters.category);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`${TOLL_SELECT} ${where} ORDER BY toll_transactions.occurred_at DESC, toll_transactions.id DESC`)
    .all(...params) as TollTransactionView[];
}

export function getTollTransaction(id: number): TollTransactionView | null {
  return (
    (getDb().prepare(`${TOLL_SELECT} WHERE toll_transactions.id = ?`).get(id) as TollTransactionView | undefined) ??
    null
  );
}

function storeTollImportSource(sourceFile: string, text: string): void {
  getDb()
    .prepare(
      `INSERT INTO toll_import_sources (source_file, text, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(source_file) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`,
    )
    .run(sourceFile, text, nowIso());
}

function matchTollRow(
  row: Pick<ParsedTollCsvRow, "transponderId" | "unitNumber">,
  drivers: ReturnType<typeof listDrivers>,
  trucks: ReturnType<typeof listTrucks>,
): { driverId: number | null; truckId: number | null; unitNumber: string; transponderId: string } {
  const transponder = normalizeTransponder(row.transponderId);
  const byTransponder = transponder
    ? trucks.find((truck) => normalizeTransponder(truck.prepass_transponder_id) === transponder)
    : undefined;
  const fromTruck = byTransponder ? drivers.find((driver) => driver.truck_id === byTransponder.id) : undefined;
  return {
    driverId: fromTruck?.id ?? null,
    truckId: byTransponder?.id ?? null,
    unitNumber: byTransponder?.unit_number ?? row.unitNumber.trim(),
    transponderId: transponder || (byTransponder ? normalizeTransponder(byTransponder.prepass_transponder_id) : ""),
  };
}

export function rematchTollTransactionDrivers(options?: { unmatchedOnly?: boolean }): number {
  const unmatchedOnly = Boolean(options?.unmatchedOnly);
  const drivers = listDrivers();
  const trucks = listTrucks();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, driver_id, truck_id, transponder_id, unit_number, driver_name_raw
       FROM toll_transactions`,
    )
    .all() as Array<{
    id: number;
    driver_id: number | null;
    truck_id: number | null;
    transponder_id: string;
    unit_number: string;
    driver_name_raw: string;
  }>;
  const update = db.prepare(
    `UPDATE toll_transactions
     SET driver_id = ?, truck_id = ?, unit_number = ?, transponder_id = ?, driver_name_raw = ?
     WHERE id = ?`,
  );
  let updated = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (unmatchedOnly && row.driver_id) continue;
      const match = matchTollRow(
        {
          transponderId: row.transponder_id,
          unitNumber: row.unit_number,
        },
        drivers,
        trucks,
      );
      const nextDriverId = match.driverId;
      const nextTruckId = match.truckId;
      const nextUnit = match.unitNumber || row.unit_number;
      const nextTransponder = match.transponderId || normalizeTransponder(row.transponder_id);
      const nextName = row.driver_name_raw;
      if (
        (row.driver_id ?? null) === nextDriverId &&
        (row.truck_id ?? null) === nextTruckId &&
        row.unit_number === nextUnit &&
        normalizeTransponder(row.transponder_id) === nextTransponder
      ) {
        continue;
      }
      update.run(nextDriverId, nextTruckId, nextUnit, nextTransponder, nextName, row.id);
      updated += 1;
    }
  })();
  return updated;
}

export function rematchUnmatchedTollTransactions(): number {
  return rematchTollTransactionDrivers({ unmatchedOnly: true });
}

export function importTollsFromText(
  text: string,
  sourceFile: string,
  options?: { sourceKind?: string; provider?: string },
): { created: number; skipped: number; unmatched: number; errors: TollCsvRowError[] } {
  storeTollImportSource(sourceFile, text);
  const parsed = parseTollReport(text);
  const drivers = listDrivers();
  const trucks = listTrucks();
  const db = getDb();
  const existing = new Set(
    (db.prepare("SELECT dedup_key FROM toll_transactions").all() as Array<{ dedup_key: string }>).map(
      (row) => row.dedup_key,
    ),
  );
  const insert = db.prepare(
    `INSERT INTO toll_transactions (
      occurred_at, driver_id, truck_id, load_id, plaza, state, amount,
      source_file, source_kind, provider, category, transponder_id, unit_number, driver_name_raw,
      invoice_number, reference_number, raw_json, dedup_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const match = matchTollRow(row, drivers, trucks);
      insert.run(
        row.occurredAt,
        match.driverId,
        match.truckId,
        null,
        row.plaza,
        row.state,
        row.amount,
        sourceFile,
        options?.sourceKind ?? "manual_import",
        options?.provider ?? "prepass",
        row.category,
        match.transponderId || normalizeTransponder(row.transponderId),
        match.unitNumber,
        row.driverName,
        row.invoice,
        row.reference,
        "",
        row.dedupKey,
        nowIso(),
      );
      seen.add(row.dedupKey);
      if (match.driverId) created += 1;
      else unmatched += 1;
    }
  })();
  rematchUnmatchedTollTransactions();
  return { created, skipped, unmatched, errors: parsed.errors };
}

export function assignTollTransactionDriver(id: number, driverId: number): void {
  const row = getTollTransaction(id);
  if (!row) throw new Error("Toll row is missing.");
  const driver = listDrivers().find((item) => item.id === driverId);
  if (!driver) throw new Error("Pick a driver.");
  const truckId = row.truck_id ?? driver.truck_id;
  const rawName = row.driver_name_raw.trim() || driver.name;
  getDb()
    .prepare("UPDATE toll_transactions SET driver_id = ?, truck_id = ?, driver_name_raw = ? WHERE id = ?")
    .run(driverId, truckId, rawName, id);
}

function resolveAssignLoadId(loadId: number): number | null {
  const db = getDb();
  const byId = db.prepare("SELECT id FROM loads WHERE id = ?").get(loadId) as { id: number } | undefined;
  if (byId) return byId.id;
  const key = String(loadId);
  const byNumber = db
    .prepare("SELECT id FROM loads WHERE load_number = ? OR load_number = ?")
    .get(key, `MSE-${key}`) as { id: number } | undefined;
  return byNumber?.id ?? null;
}

export function assignTollTransactionLoad(id: number, loadId: number): void {
  const row = getTollTransaction(id);
  if (!row) throw new Error("Toll row is missing.");
  const resolved = resolveAssignLoadId(loadId);
  if (!resolved) throw new Error("Pick a load.");
  getDb().prepare("UPDATE toll_transactions SET load_id = ? WHERE id = ?").run(resolved, id);
}

export function assignTollTransaction(id: number, input: { driverId?: number | null; loadId?: number | null }): void {
  if (!input.driverId && !input.loadId) throw new Error("Pick a driver or a load.");
  getDb().transaction(() => {
    if (input.driverId) assignTollTransactionDriver(id, input.driverId);
    if (input.loadId) assignTollTransactionLoad(id, input.loadId);
  })();
}

export type TollTotals = {
  toll: number;
  scale_bypass: number;
  total: number;
  txCount: number;
};

export type TollRollup = {
  id: number;
  name: string;
  totals: TollTotals;
};

function emptyTollTotals(): TollTotals {
  return { toll: 0, scale_bypass: 0, total: 0, txCount: 0 };
}

function addToTotals(totals: TollTotals, row: Pick<TollTransactionView, "category" | "amount">): void {
  if (row.amount == null || !Number.isFinite(row.amount)) return;
  const kind = row.category === "scale_bypass" ? "scale_bypass" : "toll";
  totals[kind] += row.amount;
  totals.total += row.amount;
  totals.txCount += 1;
}

function rollupByDriver(rows: TollTransactionView[]): TollRollup[] {
  const map = new Map<number, TollRollup>();
  for (const row of rows) {
    if (!row.driver_id) continue;
    const current = map.get(row.driver_id) ?? {
      id: row.driver_id,
      name: row.driver_name || row.driver_name_raw || "Driver",
      totals: emptyTollTotals(),
    };
    addToTotals(current.totals, row);
    map.set(row.driver_id, current);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeTotals(rows: TollTransactionView[]): TollTotals {
  const totals = emptyTollTotals();
  for (const row of rows) addToTotals(totals, row);
  return totals;
}

export function loadTollPeriodView(
  input?: { week?: string; period?: string },
  now = new Date(),
): {
  weekStartYmd: string;
  weekEndYmd: string;
  selectedPeriod: TollPeriod;
  currentWeek: boolean;
  fromIso: string;
  toIso: string;
  periodStartYmd: string;
  periodEndYmd: string;
  totals: TollTotals;
  driverRollups: TollRollup[];
  transactions: TollTransactionView[];
  unmatched: TollTransactionView[];
  txGroups: Record<TollTxListKind, TollTransactionView[]>;
  weeks: TollWeekOption[];
} {
  rematchUnmatchedTollTransactions();
  const weekStartYmd = parseTollWeekStart(input?.week, now);
  const selectedPeriod = parseTollPeriod(input?.period);
  const range = tollRangeForPeriod(weekStartYmd, selectedPeriod);
  const transactions = listTollTransactions({ fromIso: range.fromIso, toIso: range.toIso });
  const unmatched = listTollTransactions({ fromIso: range.fromIso, toIso: range.toIso, unmatchedOnly: true });
  const allRows = listTollTransactions();
  return {
    weekStartYmd,
    weekEndYmd: localWeekRange(weekStartYmd).endYmd,
    selectedPeriod,
    currentWeek: isCurrentTollWeek(weekStartYmd, now),
    fromIso: range.fromIso,
    toIso: range.toIso,
    periodStartYmd: range.startYmd,
    periodEndYmd: range.endYmd,
    totals: summarizeTotals(transactions),
    driverRollups: rollupByDriver(transactions),
    transactions,
    unmatched,
    txGroups: groupTollTxByList(transactions),
    weeks: listTollWeekOptions(allRows, now),
  };
}

export async function pullPrepassTollTransactions(): Promise<TollImportResult> {
  const { pullPrepassTransactions } = await import("./prepass-client");
  const pulled = await pullPrepassTransactions();
  if (!pulled.ok) return pulled;
  const rows = pulled.rows;
  if (!rows.length) {
    return {
      ok: true,
      created: 0,
      skipped: 0,
      unmatched: 0,
      errors: [],
      message: pulled.message,
    };
  }
  const { renderUtf8Csv } = await import("./csv");
  const text = renderUtf8Csv(
    ["Date", "Time", "Transponder ID", "Unit", "Driver Name", "Plaza", "State", "Category", "Amount", "Invoice", "Reference"],
    rows.map((row) => [
      row.date,
      row.time ?? "",
      row.transponder_id,
      row.unit_number ?? "",
      row.driver_name ?? "",
      row.plaza ?? "",
      row.state ?? "",
      row.category,
      String(row.amount),
      row.invoice_number ?? "",
      row.reference_number ?? "",
    ]),
  );
  const imported = importTollsFromText(text, `prepass-api-${new Date().toISOString().slice(0, 10)}.csv`, {
    sourceKind: "api_pull",
    provider: "prepass",
  });
  return {
    ok: true,
    ...imported,
    message: pulled.message,
  };
}
