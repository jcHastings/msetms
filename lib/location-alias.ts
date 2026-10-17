/**
 * Aliases that point an old location name at the kept row.
 * Comparison uses the same name normalization as merge grouping.
 * The stored name stays the copy's own spelling so search can show it.
 */
import { normalizeMergeName } from "./location-resolve";
import type { Database } from "./sqlite";

export type AliasBackfillItem = {
  fromId: number;
  keeperId: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type AliasBackfillSkip = {
  fromId: number;
  reason: string;
};

export type AliasBackfillReport = {
  dryRun: boolean;
  aliases: AliasBackfillItem[];
  skipped: AliasBackfillSkip[];
};

type AliasLocationRow = {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  archived_at: string | null;
  merged_into: number | null;
};

/** Blank, or the copy name when it is not the keeper's own name. */
export function aliasNameForKeeper(keeperName: string | null | undefined, copyName: string | null | undefined): string {
  const name = String(copyName ?? "").trim();
  const normalized = normalizeMergeName(name);
  if (!normalized) return "";
  if (normalized === normalizeMergeName(keeperName)) return "";
  return name;
}

export function aliasNameAlreadyStored(existingNames: Array<string | null | undefined>, copyName: string): boolean {
  const normalized = normalizeMergeName(copyName);
  if (!normalized) return true;
  return existingNames.some((name) => normalizeMergeName(name) === normalized);
}

export function planLocationAliasBackfill(db: Database): AliasBackfillReport {
  const rows = db.prepare("SELECT id, name, street, city, state, zip, archived_at, merged_into FROM locations ORDER BY id").all() as AliasLocationRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const stored = aliasNamesByLocation(db);
  const aliases: AliasBackfillItem[] = [];
  const skipped: AliasBackfillSkip[] = [];
  const planned = new Map<number, string[]>();

  for (const row of rows) {
    if (!isArchivedMerged(row)) continue;
    const keeper = finalKeeper(row, byId);
    if (!keeper.ok) {
      skipped.push({ fromId: row.id, reason: keeper.reason });
      continue;
    }
    const name = aliasNameForKeeper(keeper.row.name, row.name);
    if (!name) {
      skipped.push({ fromId: row.id, reason: "same name as the keeper" });
      continue;
    }
    const known = [...(stored.get(keeper.row.id) ?? []), ...(planned.get(keeper.row.id) ?? [])];
    if (aliasNameAlreadyStored(known, name)) {
      skipped.push({ fromId: row.id, reason: "alias already stored" });
      continue;
    }
    const item: AliasBackfillItem = {
      fromId: row.id,
      keeperId: keeper.row.id,
      name,
      street: String(row.street ?? "").trim(),
      city: String(row.city ?? "").trim(),
      state: String(row.state ?? "").trim().toUpperCase(),
      zip: String(row.zip ?? "").trim(),
    };
    aliases.push(item);
    const list = planned.get(keeper.row.id) ?? [];
    list.push(name);
    planned.set(keeper.row.id, list);
  }

  return { dryRun: true, aliases, skipped };
}

export function applyLocationAliasBackfill(
  db: Database,
  report: AliasBackfillReport,
  now = new Date().toISOString(),
): AliasBackfillReport {
  const inserted: AliasBackfillItem[] = [];
  const skipped: AliasBackfillSkip[] = [...report.skipped];
  const tx = db.transaction(() => {
    for (const item of report.aliases) {
      const existing = db
        .prepare("SELECT name FROM location_aliases WHERE location_id = ?")
        .all(item.keeperId) as Array<{ name: string }>;
      if (aliasNameAlreadyStored(existing.map((row) => row.name), item.name)) {
        skipped.push({ fromId: item.fromId, reason: "alias already stored" });
        continue;
      }
      insertKeeperAlias(db, item.keeperId, item, now);
      inserted.push(item);
    }
  });
  tx();
  return { dryRun: false, aliases: inserted, skipped };
}

export function insertKeeperAlias(
  db: Database,
  keeperId: number,
  alias: { name: string; street?: string | null; city?: string | null; state?: string | null; zip?: string | null },
  now: string,
): void {
  db.prepare(
    `INSERT INTO location_aliases (location_id, name, street, city, state, zip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    keeperId,
    alias.name,
    String(alias.street ?? "").trim(),
    String(alias.city ?? "").trim(),
    String(alias.state ?? "").trim().toUpperCase(),
    String(alias.zip ?? "").trim(),
    now,
  );
}

function aliasNamesByLocation(db: Database): Map<number, string[]> {
  const rows = db.prepare("SELECT location_id, name FROM location_aliases ORDER BY id").all() as Array<{
    location_id: number;
    name: string;
  }>;
  const grouped = new Map<number, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.location_id) ?? [];
    list.push(row.name);
    grouped.set(row.location_id, list);
  }
  return grouped;
}

function isArchivedMerged(row: AliasLocationRow): boolean {
  if (String(row.archived_at ?? "").trim() === "") return false;
  const merged = Number(row.merged_into);
  return Number.isInteger(merged) && merged > 0;
}

function finalKeeper(
  start: AliasLocationRow,
  byId: Map<number, AliasLocationRow>,
): { ok: true; row: AliasLocationRow } | { ok: false; reason: string } {
  const seen = new Set<number>();
  let current: AliasLocationRow | undefined = start;
  while (current) {
    if (seen.has(current.id)) return { ok: false, reason: "merge chain loops" };
    seen.add(current.id);
    const nextId = Number(current.merged_into);
    if (!Number.isInteger(nextId) || nextId <= 0) {
      if (current.id === start.id || String(current.archived_at ?? "").trim() !== "") {
        return { ok: false, reason: "kept location was not found" };
      }
      return { ok: true, row: current };
    }
    const next = byId.get(nextId);
    if (!next) return { ok: false, reason: "kept location was not found" };
    current = next;
  }
  return { ok: false, reason: "kept location was not found" };
}
