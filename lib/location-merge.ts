/**
 * Plan and apply location merges. Dry-run opens the database read-only.
 * Apply archives copies. It never deletes a location row.
 */
import fs from "node:fs";

import { aliasNameAlreadyStored, aliasNameForKeeper, insertKeeperAlias } from "./location-alias";
import {
  loadLocationLinkCounts,
  locationCompleteness,
  locationHasStreet,
  normalizeMergeCity,
  normalizeMergeName,
  normalizeMergeState,
  normalizeMergeStreet,
  normalizeMergeZip,
  type LocationResolveRow,
} from "./location-resolve";
import { Database } from "./sqlite";

const BACKUP_MAX_AGE_MS = 60 * 60 * 1000;

const TEXT_COLUMNS = [
  "street",
  "city",
  "state",
  "zip",
  "phone",
  "notes",
  "hours",
  "scheduling_notes",
  "google_place_id",
  "country",
  "receiving_hours",
  "shipping_hours",
  "parking",
  "overnight_parking",
  "parking_notes",
  "gate_dock_notes",
  "samsara_address_id",
] as const;

export type MergeChange = {
  table: string;
  id: number | null;
  column: string;
  from: string | number | null;
  to: string | number | null;
};

export type MergeGroupPlan = {
  keepId: number;
  mergeIds: number[];
  keep: {
    id: number;
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    reason: string;
  };
  linkCounts: Record<string, number>;
  changes: MergeChange[];
};

export type MergeReport = {
  dryRun: boolean;
  groups: MergeGroupPlan[];
};

export type ExplicitMergeGroup = {
  keep: number;
  merge: number[];
};

type LocationMergeRow = LocationResolveRow & Record<string, unknown>;

export function backupIsFresh(filePath: string, now = Date.now()): { ok: true } | { ok: false; error: string } {
  const target = String(filePath ?? "").trim();
  if (!target) {
    return { ok: false, error: "Apply refused: pass --backup pointing at a backup file modified in the last 60 minutes." };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return { ok: false, error: `Apply refused: backup file not found: ${target}` };
  }
  if (!stat.isFile()) {
    return { ok: false, error: `Apply refused: backup path is not a file: ${target}` };
  }
  if (now - stat.mtimeMs > BACKUP_MAX_AGE_MS) {
    return { ok: false, error: "Apply refused: backup file must have been modified in the last 60 minutes." };
  }
  return { ok: true };
}

export function parseExplicitGroups(raw: string): ExplicitMergeGroup[] {
  const parsed = JSON.parse(raw) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { groups?: unknown }).groups)
      ? (parsed as { groups: unknown[] }).groups
      : null;
  if (!list) throw new Error("--groups JSON must be an array of { keep, merge } objects.");
  return list.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Group ${index + 1} is not an object.`);
    const record = item as { keep?: unknown; keepId?: unknown; merge?: unknown; mergeIds?: unknown };
    const keep = Number(record.keep ?? record.keepId);
    const mergeRaw = record.merge ?? record.mergeIds;
    const merge = Array.isArray(mergeRaw) ? mergeRaw.map((id) => Number(id)) : [];
    if (!Number.isInteger(keep) || keep <= 0) throw new Error(`Group ${index + 1} is missing a keep id.`);
    if (!merge.length || merge.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error(`Group ${index + 1} is missing merge ids.`);
    }
    if (merge.includes(keep)) throw new Error(`Group ${index + 1} lists the keep id as a copy.`);
    return { keep, merge };
  });
}

export function openMergeDb(dbPath: string, writable: boolean): Database {
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
  const db = new Database(dbPath);
  if (!writable) db.exec("PRAGMA query_only = ON");
  return db;
}

export function planLocationMerges(db: Database, explicit?: ExplicitMergeGroup[]): MergeReport {
  const rows = db.prepare("SELECT * FROM locations ORDER BY id").all() as LocationMergeRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const counts = loadLocationLinkCounts(db);
  const groups = explicit ? groupsFromExplicit(explicit, byId) : autoGroups(rows, counts);
  return {
    dryRun: true,
    groups: groups.map((group) => describeGroup(db, group.keep, group.merge, counts, Boolean(explicit))),
  };
}

export function applyLocationMerges(db: Database, report: MergeReport, now = new Date().toISOString()): MergeReport {
  const rows = db.prepare("SELECT * FROM locations ORDER BY id").all() as LocationMergeRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const tx = db.transaction(() => {
    for (const group of report.groups) {
      const keep = byId.get(group.keepId);
      if (!keep) throw new Error(`Keep location ${group.keepId} was not found.`);
      const copies = group.mergeIds.map((id) => {
        const row = byId.get(id);
        if (!row) throw new Error(`Location ${id} was not found.`);
        return row;
      });
      const filled = fillKeeper(keep, copies);
      writeKeeperFills(db, keep, filled.updates);
      for (const copy of copies) {
        repointColumn(db, "loads", "shipper_location_id", "id", copy.id, keep.id);
        repointColumn(db, "loads", "consignee_location_id", "id", copy.id, keep.id);
        repointColumn(db, "load_stops", "location_id", "id", copy.id, keep.id);
        repointColumn(db, "load_template_stops", "location_id", "id", copy.id, keep.id);
        repointColumn(db, "load_swaps", "location_id", "id", copy.id, keep.id);
        repointColumn(db, "location_aliases", "location_id", "id", copy.id, keep.id);
        repointVerifyCache(db, copy.id, keep.id);
      }
      fillStopAddress(db, keep.id, String(filled.street ?? ""), String(filled.zip ?? ""));
      for (const copy of copies) {
        db.prepare("UPDATE locations SET archived_at = ?, merged_into = ?, updated_at = ? WHERE id = ?").run(
          now,
          keep.id,
          now,
          copy.id,
        );
        addNameAlias(db, keep, copy, now);
        db.prepare(
          `INSERT INTO audit_log (actor, action, entity, entity_id, detail, created_at)
           VALUES ('dispatcher', 'location_merge', 'location', ?, ?, ?)`,
        ).run(
          keep.id,
          `Merged location ${copy.id} (${copy.name}) into ${keep.id} (${keep.name}).`,
          now,
        );
      }
    }
  });
  tx();
  return { ...report, dryRun: false };
}

function groupsFromExplicit(
  explicit: ExplicitMergeGroup[],
  byId: Map<number, LocationMergeRow>,
): Array<{ keep: LocationMergeRow; merge: LocationMergeRow[] }> {
  const seen = new Set<number>();
  return explicit.map((group) => {
    const keep = byId.get(group.keep);
    if (!keep) throw new Error(`Keep location ${group.keep} was not found.`);
    if (seen.has(keep.id)) throw new Error(`Location ${keep.id} is already in a merge group.`);
    seen.add(keep.id);
    const merge = group.merge.map((id) => {
      const row = byId.get(id);
      if (!row) throw new Error(`Location ${id} was not found.`);
      if (seen.has(row.id)) throw new Error(`Location ${row.id} is already in a merge group.`);
      seen.add(row.id);
      return row;
    });
    return { keep, merge };
  });
}

function autoGroups(
  rows: LocationMergeRow[],
  counts: Map<number, number>,
): Array<{ keep: LocationMergeRow; merge: LocationMergeRow[] }> {
  const live = rows.filter((row) => String(row.archived_at ?? "").trim() === "" && !Number(row.merged_into));
  const parent = new Map<number, number>();
  function find(id: number): number {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  }
  function union(left: number, right: number) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  }

  const byName = new Map<string, LocationMergeRow[]>();
  for (const row of live) {
    const name = normalizeMergeName(row.name);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(row);
    byName.set(name, list);
  }

  for (const named of byName.values()) {
    for (let i = 0; i < named.length; i += 1) {
      for (let j = i + 1; j < named.length; j += 1) {
        const left = named[i]!;
        const right = named[j]!;
        const leftStreet = normalizeMergeStreet(left.street);
        const rightStreet = normalizeMergeStreet(right.street);
        if (
          leftStreet &&
          rightStreet &&
          leftStreet === rightStreet &&
          normalizeMergeZip(left.zip) &&
          normalizeMergeZip(left.zip) === normalizeMergeZip(right.zip)
        ) {
          union(left.id, right.id);
        }
      }
    }

    const addressedRoots = new Map<string, Set<number>>();
    for (const row of named) {
      if (!locationHasStreet(row)) continue;
      const key = cityStateKey(row);
      if (!key) continue;
      const roots = addressedRoots.get(key) ?? new Set<number>();
      roots.add(find(row.id));
      addressedRoots.set(key, roots);
    }

    const blanksByPlace = new Map<string, LocationMergeRow[]>();
    for (const row of named) {
      if (locationHasStreet(row)) continue;
      const key = cityStateKey(row);
      if (!key) continue;
      const roots = addressedRoots.get(key);
      if (roots && roots.size === 1) {
        union(row.id, [...roots][0]!);
        continue;
      }
      if (!roots || roots.size === 0) {
        const list = blanksByPlace.get(key) ?? [];
        list.push(row);
        blanksByPlace.set(key, list);
      }
    }
    for (const blanks of blanksByPlace.values()) {
      for (let i = 1; i < blanks.length; i += 1) union(blanks[0]!.id, blanks[i]!.id);
    }
  }

  const buckets = new Map<number, LocationMergeRow[]>();
  for (const row of live) {
    if (!normalizeMergeName(row.name)) continue;
    const root = find(row.id);
    const list = buckets.get(root) ?? [];
    list.push(row);
    buckets.set(root, list);
  }

  const groups: Array<{ keep: LocationMergeRow; merge: LocationMergeRow[] }> = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const ranked = [...members].sort((left, right) => compareKeep(left, right, counts));
    const keep = ranked[0]!;
    groups.push({ keep, merge: ranked.filter((row) => row.id !== keep.id) });
  }
  groups.sort((left, right) => left.keep.id - right.keep.id);
  return groups;
}

function cityStateKey(row: LocationMergeRow): string {
  const city = normalizeMergeCity(row.city);
  const state = normalizeMergeState(row.state);
  if (!city || !state) return "";
  return `${city}|${state}`;
}

function compareKeep(
  left: LocationMergeRow,
  right: LocationMergeRow,
  counts: Map<number, number>,
): number {
  const street = Number(locationHasStreet(right)) - Number(locationHasStreet(left));
  if (street) return street;
  const links = (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0);
  if (links) return links;
  const complete = locationCompleteness(right) - locationCompleteness(left);
  if (complete) return complete;
  const created = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
  if (created) return created;
  return left.id - right.id;
}

function describeGroup(
  db: Database,
  keep: LocationMergeRow,
  merge: LocationMergeRow[],
  counts: Map<number, number>,
  lockKeep: boolean,
): MergeGroupPlan {
  const ranked = lockKeep ? [keep, ...merge] : [keep, ...merge].sort((left, right) => compareKeep(left, right, counts));
  const chosen = ranked[0] ?? keep;
  const copies = lockKeep ? merge : ranked.filter((row) => row.id !== chosen.id);
  const filled = fillKeeper(chosen, copies);
  const changes: MergeChange[] = [];
  for (const [column, value] of Object.entries(filled.updates)) {
    changes.push({
      table: "locations",
      id: chosen.id,
      column,
      from: textOrNull(chosen[column]),
      to: value,
    });
  }
  const ids = copies.map((row) => row.id);
  if (ids.length) {
    pushRepoints(db, changes, "loads", "shipper_location_id", ids, chosen.id);
    pushRepoints(db, changes, "loads", "consignee_location_id", ids, chosen.id);
    pushRepoints(db, changes, "load_stops", "location_id", ids, chosen.id);
    pushRepoints(db, changes, "load_template_stops", "location_id", ids, chosen.id);
    pushRepoints(db, changes, "load_swaps", "location_id", ids, chosen.id);
    pushRepoints(db, changes, "location_aliases", "location_id", ids, chosen.id);
    pushRepoints(db, changes, "location_verify_cache", "location_id", ids, chosen.id);
    const stopRows = db
      .prepare(
        `SELECT id, street, zip FROM load_stops WHERE location_id = ? OR location_id IN (${ids.map(() => "?").join(", ")})`,
      )
      .all(chosen.id, ...ids) as Array<{ id: number; street: string; zip: string }>;
    for (const stop of stopRows) {
      if (!String(stop.street ?? "").trim() && String(filled.street ?? "").trim()) {
        changes.push({ table: "load_stops", id: stop.id, column: "street", from: stop.street ?? "", to: String(filled.street) });
      }
      if (!String(stop.zip ?? "").trim() && String(filled.zip ?? "").trim()) {
        changes.push({ table: "load_stops", id: stop.id, column: "zip", from: stop.zip ?? "", to: String(filled.zip) });
      }
    }
  }
  for (const copy of copies) {
    changes.push({ table: "locations", id: copy.id, column: "archived_at", from: textOrNull(copy.archived_at), to: "set on apply" });
    changes.push({ table: "locations", id: copy.id, column: "merged_into", from: textOrNull(copy.merged_into), to: chosen.id });
    if (aliasName(chosen, copy)) {
      changes.push({ table: "location_aliases", id: null, column: "name", from: copy.name, to: chosen.id });
    }
    changes.push({
      table: "audit_log",
      id: null,
      column: "detail",
      from: null,
      to: `Merged location ${copy.id} (${copy.name}) into ${chosen.id} (${chosen.name}).`,
    });
  }
  const linkCounts: Record<string, number> = {};
  for (const row of [chosen, ...copies]) linkCounts[String(row.id)] = counts.get(row.id) ?? 0;
  return {
    keepId: chosen.id,
    mergeIds: copies.map((row) => row.id),
    keep: {
      id: chosen.id,
      name: chosen.name,
      street: chosen.street,
      city: chosen.city,
      state: chosen.state,
      zip: chosen.zip,
      reason: keepReason(chosen, copies, counts),
    },
    linkCounts,
    changes,
  };
}

function keepReason(keep: LocationMergeRow, copies: LocationMergeRow[], counts: Map<number, number>): string {
  const parts = [
    locationHasStreet(keep) ? "has a street" : "no street",
    `${counts.get(keep.id) ?? 0} links`,
    `${locationCompleteness(keep)} complete fields`,
    `oldest among ${copies.length + 1}`,
  ];
  return parts.join(", ");
}

function textOrNull(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return String(value);
}

function pushRepoints(
  db: Database,
  changes: MergeChange[],
  table: string,
  column: string,
  fromIds: number[],
  keepId: number,
) {
  const idColumn = table === "location_verify_cache" ? "location_id" : "id";
  const rows = db
    .prepare(
      `SELECT ${idColumn} AS id FROM ${table} WHERE ${column} IN (${fromIds.map(() => "?").join(", ")})`,
    )
    .all(...fromIds) as Array<{ id: number }>;
  for (const row of rows) {
    changes.push({ table, id: Number(row.id), column, from: null, to: keepId });
  }
}

type KeeperFill = {
  street: string;
  zip: string;
  updates: Record<string, string | number | null>;
};

function fillKeeper(keep: LocationMergeRow, copies: LocationMergeRow[]): KeeperFill {
  const updates: Record<string, string | number | null> = {};
  const next: LocationMergeRow = { ...keep };
  const donors = [...copies].sort((left, right) => compareKeep(left, right, new Map()));
  for (const column of TEXT_COLUMNS) {
    if (String(next[column] ?? "").trim()) continue;
    for (const donor of donors) {
      const value = String(donor[column] ?? "").trim();
      if (!value) continue;
      updates[column] = donor[column] == null ? value : (donor[column] as string | number);
      next[column] = value;
      break;
    }
  }
  if (finiteOrNull(next.latitude) == null || finiteOrNull(next.longitude) == null) {
    for (const donor of donors) {
      const lat = finiteOrNull(donor.latitude);
      const lng = finiteOrNull(donor.longitude);
      if (lat == null || lng == null) continue;
      if (finiteOrNull(next.latitude) == null) {
        updates.latitude = lat;
        next.latitude = lat;
      }
      if (finiteOrNull(next.longitude) == null) {
        updates.longitude = lng;
        next.longitude = lng;
      }
      break;
    }
  }
  return { street: String(next.street ?? ""), zip: String(next.zip ?? ""), updates };
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function writeKeeperFills(db: Database, keep: LocationMergeRow, updates: Record<string, string | number | null>) {
  const entries = Object.entries(updates);
  if (!entries.length) return;
  const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
  db.prepare(`UPDATE locations SET ${assignments}, updated_at = ? WHERE id = ?`).run(
    ...entries.map(([, value]) => value),
    new Date().toISOString(),
    keep.id,
  );
}

function repointColumn(
  db: Database,
  table: string,
  column: string,
  idColumn: string,
  fromId: number,
  keepId: number,
) {
  void idColumn;
  db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(keepId, fromId);
}

function repointVerifyCache(db: Database, fromId: number, keepId: number) {
  db.prepare(
    `DELETE FROM location_verify_cache
     WHERE location_id = ?
       AND query_key IN (SELECT query_key FROM location_verify_cache WHERE location_id = ?)`,
  ).run(fromId, keepId);
  db.prepare("UPDATE location_verify_cache SET location_id = ? WHERE location_id = ?").run(keepId, fromId);
}

function fillStopAddress(db: Database, keepId: number, street: string, zip: string) {
  db.prepare(
    `UPDATE load_stops
     SET street = CASE WHEN TRIM(IFNULL(street, '')) = '' THEN ? ELSE street END,
         zip = CASE WHEN TRIM(IFNULL(zip, '')) = '' THEN ? ELSE zip END
     WHERE location_id = ?`,
  ).run(street, zip, keepId);
}

function aliasName(keep: LocationMergeRow, copy: LocationMergeRow): string {
  return aliasNameForKeeper(keep.name, copy.name);
}

function addNameAlias(db: Database, keep: LocationMergeRow, copy: LocationMergeRow, now: string) {
  const name = aliasName(keep, copy);
  if (!name) return;
  const existing = db.prepare("SELECT name FROM location_aliases WHERE location_id = ?").all(keep.id) as Array<{
    name: string;
  }>;
  if (aliasNameAlreadyStored(existing.map((row) => row.name), name)) return;
  insertKeeperAlias(
    db,
    keep.id,
    {
      name,
      street: copy.street,
      city: copy.city,
      state: copy.state,
      zip: copy.zip,
    },
    now,
  );
}
