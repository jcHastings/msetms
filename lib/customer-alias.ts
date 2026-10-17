/**
 * Stored names that should resolve to a live customer.
 * Matching reads these before the customer's own name, so a merged-away
 * name is not created again.
 */
import { getDb } from "./db";
import { aliasCustomerId, normalizeCustomerAlias, type CustomerAliasRef } from "./customer-name";

export type { CustomerAliasRef } from "./customer-name";
export { normalizeCustomerAlias } from "./customer-name";

type AliasRow = { id: number; customer_id: number; name: string; normalized: string };

export function listCustomerAliasRefs(): CustomerAliasRef[] {
  const rows = getDb()
    .prepare("SELECT customer_id, name, normalized FROM customer_aliases ORDER BY id")
    .all() as Array<{ customer_id: number; name: string; normalized: string }>;
  return rows.map((row) => ({
    customerId: Number(row.customer_id),
    name: String(row.name ?? ""),
    normalized: String(row.normalized ?? ""),
  }));
}

export function aliasNamesByCustomerId(): Map<number, string[]> {
  const rows = getDb()
    .prepare("SELECT customer_id, name FROM customer_aliases ORDER BY id")
    .all() as Array<{ customer_id: number; name: string }>;
  const grouped = new Map<number, string[]>();
  for (const row of rows) {
    const id = Number(row.customer_id);
    const list = grouped.get(id) ?? [];
    const name = String(row.name ?? "").trim();
    if (name) list.push(name);
    grouped.set(id, list);
  }
  return grouped;
}

export function aliasNamesForCustomer(customerId: number): string[] {
  const rows = getDb()
    .prepare("SELECT name FROM customer_aliases WHERE customer_id = ? ORDER BY id")
    .all(customerId) as Array<{ name: string }>;
  return rows.map((row) => String(row.name ?? "").trim()).filter(Boolean);
}

/** Follow merged_into until a customer that is still active. */
export function liveCustomerId(startId: number): number | null {
  const db = getDb();
  const seen = new Set<number>();
  let id = startId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = db.prepare("SELECT id, archived_at, merged_into FROM customers WHERE id = ?").get(id) as
      | { id: number; archived_at: string | null; merged_into: number | null }
      | undefined;
    if (!row) return null;
    if (!row.archived_at) return Number(row.id);
    if (row.merged_into == null) return null;
    id = Number(row.merged_into);
  }
  return null;
}

export function findLiveCustomerIdByAlias(name: string): number | null {
  const normalized = normalizeCustomerAlias(name);
  if (!normalized) return null;
  const rows = getDb()
    .prepare("SELECT customer_id FROM customer_aliases WHERE normalized = ?")
    .all(normalized) as Array<{ customer_id: number }>;
  if (rows.length !== 1) return null;
  return liveCustomerId(Number(rows[0]?.customer_id));
}

/** Alias first, then the exact live name. Does not create a customer. */
export function resolveLiveCustomerId(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const alias = findLiveCustomerIdByAlias(trimmed);
  if (alias) return alias;
  const rows = getDb()
    .prepare("SELECT id, name FROM customers WHERE archived_at IS NULL")
    .all() as Array<{ id: number; name: string }>;
  const exact = rows.find((row) => row.name.trim().toLowerCase() === trimmed.toLowerCase());
  return exact ? Number(exact.id) : null;
}

export function aliasRefsMatch(name: string, aliases: CustomerAliasRef[] = listCustomerAliasRefs()): number | null {
  const id = aliasCustomerId(name, aliases);
  if (id == null) return null;
  return liveCustomerId(id);
}

export function readAliasRow(id: number): AliasRow | null {
  const row = getDb().prepare("SELECT id, customer_id, name, normalized FROM customer_aliases WHERE id = ?").get(id) as
    | AliasRow
    | undefined;
  return row ?? null;
}
