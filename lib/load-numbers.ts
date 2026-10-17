import type { Database } from "./sqlite";

/**
 * ITS load numbers are the whole value in digits, such as 1006149.
 * Prefixed numbers such as MSE-1072 are not part of that sequence.
 */
const NUMERIC_LOAD_SQL = "load_number GLOB '[0-9]*' AND load_number NOT GLOB '*[^0-9]*'";

export class LoadNumberCollision extends Error {
  readonly loadNumber: string;

  constructor(loadNumber: string) {
    super(`Load ${loadNumber} was already taken.`);
    this.name = "LoadNumberCollision";
    this.loadNumber = loadNumber;
  }
}

export function isNumericLoadNumber(value: string): boolean {
  return /^[0-9]+$/.test(value.trim());
}

export function maxNumericLoadNumber(db: Database): number {
  const row = db
    .prepare(`SELECT MAX(CAST(load_number AS INTEGER)) AS n FROM loads WHERE ${NUMERIC_LOAD_SQL}`)
    .get() as { n: number | null } | undefined;
  const n = Number(row?.n ?? 0);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function watermark(db: Database): number {
  const row = db.prepare("SELECT load_number_next FROM company_profile WHERE id = 1").get() as
    | { load_number_next: number }
    | undefined;
  const n = Number(row?.load_number_next ?? 1);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

function setWatermark(db: Database, next: number): void {
  db.prepare("UPDATE company_profile SET load_number_next = ? WHERE id = 1").run(next);
}

function loadNumberTaken(db: Database, loadNumber: string): boolean {
  const row = db.prepare("SELECT 1 AS hit FROM loads WHERE load_number = ?").get(loadNumber) as
    | { hit: number }
    | undefined;
  return Boolean(row);
}

function nextCandidate(db: Database): number {
  const maxLoad = maxNumericLoadNumber(db);
  let candidate = Math.max(watermark(db), maxLoad > 0 ? maxLoad + 1 : 1);
  if (!Number.isSafeInteger(candidate) || candidate < 1) candidate = 1;
  while (loadNumberTaken(db, String(candidate))) {
    candidate += 1;
    if (!Number.isSafeInteger(candidate)) throw new Error("No free load number.");
  }
  return candidate;
}

/** Next ITS-style number. Does not write. */
export function peekNextNumericLoadNumber(db: Database): string {
  return String(nextCandidate(db));
}

/**
 * Next free ITS-style number. Caller must already hold BEGIN IMMEDIATE.
 * The watermark moves forward in that same transaction.
 */
export function allocateNextLoadNumber(db: Database): string {
  const candidate = nextCandidate(db);
  const next = candidate + 1;
  if (!Number.isSafeInteger(next)) throw new Error("No free load number.");
  setWatermark(db, next);
  return String(candidate);
}

/** Keep later auto numbers above an ITS or other explicit numeric load number. */
export function reserveNumericLoadNumber(db: Database, loadNumber: string): void {
  if (!isNumericLoadNumber(loadNumber)) return;
  const n = Number(loadNumber);
  if (!Number.isSafeInteger(n) || n < 1) return;
  const floor = n + 1;
  if (!Number.isSafeInteger(floor)) return;
  if (floor > watermark(db)) setWatermark(db, floor);
}

/**
 * Raise the watermark to sit just past every numeric load already stored.
 * Never lowers it, and never rewrites a load number.
 */
export function raiseLoadNumberWatermark(db: Database): void {
  const floor = maxNumericLoadNumber(db) + 1;
  if (Number.isSafeInteger(floor) && floor > watermark(db)) setWatermark(db, floor);
}

/** Throws when another load already owns this number. Caller holds the write transaction. */
export function guardFreeLoadNumber(db: Database, loadNumber: string): void {
  if (loadNumberTaken(db, loadNumber.trim())) throw new LoadNumberCollision(loadNumber.trim());
}

export function listMseLoadNumbers(db: Database): string[] {
  const rows = db
    .prepare("SELECT load_number FROM loads WHERE load_number GLOB 'MSE-*' ORDER BY load_number COLLATE NOCASE")
    .all() as Array<{ load_number: string }>;
  return rows.map((row) => row.load_number);
}
