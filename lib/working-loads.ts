import { getDb } from "./db";
import { ACTIVE_LOAD_STATUSES } from "./types";
import {
  RESULT_CACHE_MS,
  archiveCutoffIso,
  workingWindowDaysFrom,
} from "./working-loads-shared";

export function workingWindowDays(): number {
  return workingWindowDaysFrom(process.env.WORKING_LOAD_WINDOW_DAYS);
}

export function archiveCutoff(now = new Date()): string {
  return archiveCutoffIso(now, workingWindowDays());
}

/** Delivery, then pickup. Empty windows sort as ancient so they stay archived. */
export function loadActivitySql(alias = "loads"): string {
  return `COALESCE(NULLIF(${alias}.delivery_end, ''), NULLIF(${alias}.delivery_start, ''), NULLIF(${alias}.pickup_end, ''), NULLIF(${alias}.pickup_start, ''), '1970-01-01T00:00:00.000Z')`;
}

export function archivedSql(alias = "loads"): string {
  return `(${alias}.status IN ('delivered', 'completed') AND ${loadActivitySql(alias)} < ?)`;
}

export function notArchivedSql(alias = "loads"): string {
  return `NOT ${archivedSql(alias)}`;
}

/** Active loads plus delivered/completed inside the working window. */
export function workingDeskSql(alias = "loads"): string {
  const active = ACTIVE_LOAD_STATUSES.map(() => "?").join(", ");
  return `(${alias}.status IN (${active}) OR (${alias}.status IN ('delivered', 'completed') AND ${loadActivitySql(alias)} >= ?))`;
}

export function workingDeskParams(now = new Date()): string[] {
  return [...ACTIVE_LOAD_STATUSES, archiveCutoff(now)];
}

/**
 * Exception inbox. Recent completed loads stay. Older completed loads stay out
 * unless an invoice number is already on the load and it is not paid.
 * Delivered loads stay in, including older ones, so an open POD is still visible.
 */
export function exceptionScopeSql(alias = "loads"): string {
  const active = ACTIVE_LOAD_STATUSES.map(() => "?").join(", ");
  return `(
    ${alias}.status IN (${active})
    OR ${alias}.status = 'accounting'
    OR ${alias}.status = 'delivered'
    OR (${alias}.status = 'completed' AND ${loadActivitySql(alias)} >= ?)
    OR (
      ${alias}.status = 'completed'
      AND IFNULL(${alias}.invoice_paid, 0) = 0
      AND (
        trim(IFNULL(${alias}.tms_invoice_number, '')) != ''
        OR trim(IFNULL(${alias}.qbo_invoice_id, '')) != ''
      )
    )
  )`;
}

export function exceptionScopeParams(now = new Date()): string[] {
  return [...ACTIVE_LOAD_STATUSES, archiveCutoff(now)];
}

/** Cheap change token for result caches. Same idea as fleetLaneStamp. */
export function loadsChangeStamp(): string {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) || ':' || IFNULL(MAX(updated_at), '') FROM loads) AS loads,
         (SELECT COUNT(*) || ':' || IFNULL(MAX(rowid), 0) FROM load_stops) AS stops,
         (SELECT COUNT(*) || ':' || IFNULL(MAX(rowid), 0) FROM attachments) AS files,
         (SELECT COUNT(*) || ':' || IFNULL(MAX(rowid), 0) FROM sent_mail) AS mail,
         (SELECT COUNT(*) || ':' || IFNULL(MAX(rowid), 0) FROM exception_states) AS exceptions,
         total_changes() AS changes`,
    )
    .get() as {
    loads: string;
    stops: string;
    files: string;
    mail: string;
    exceptions: string;
    changes: number;
  };
  return `loads:${row.loads}|stops:${row.stops}|files:${row.files}|mail:${row.mail}|ex:${row.exceptions}|chg:${Number(row.changes)}`;
}

type CacheSlot<T> = { key: string; at: number; value: T };
const slots = new Map<string, CacheSlot<unknown>>();

export function readResultCache<T>(name: string, key: string, now = Date.now()): T | null {
  const slot = slots.get(name) as CacheSlot<T> | undefined;
  if (!slot || slot.key !== key || now - slot.at > RESULT_CACHE_MS) return null;
  return slot.value;
}

export function writeResultCache<T>(name: string, key: string, value: T, now = Date.now()): T {
  slots.set(name, { key, at: now, value });
  return value;
}

export function resetResultCache(): void {
  slots.clear();
}
