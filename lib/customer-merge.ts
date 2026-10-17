/**
 * Merge customers into one keeper. Losers are archived, never deleted.
 * Every customer_id column discovered in the live schema is repointed.
 * QuickBooks is never called.
 */
import { getDb } from "./db";
import { normalizeCustomerAlias, normalizeMcNumber } from "./customer-name";
import type { Database } from "./sqlite";

export const CUSTOMER_MERGE_QBO_NOTE = "This merge does not call QuickBooks.";

/**
 * Tables whose customer_id is moved onto the keeper.
 * A new customer_id column must be added here or customer-merge-test fails.
 */
export const CUSTOMER_MERGE_FK_TARGETS: Array<{ table: string; column: "customer_id"; idColumn: string }> = [
  { table: "contacts", column: "customer_id", idColumn: "id" },
  { table: "loads", column: "customer_id", idColumn: "id" },
  { table: "load_templates", column: "customer_id", idColumn: "id" },
  { table: "customer_contracts", column: "customer_id", idColumn: "id" },
  { table: "customer_requirements", column: "customer_id", idColumn: "id" },
  { table: "customer_aliases", column: "customer_id", idColumn: "id" },
  { table: "customer_detention_terms", column: "customer_id", idColumn: "customer_id" },
];

const FILL_FIELDS = [
  "payment_terms",
  "main_email",
  "billing_email",
  "billing_notes",
  "mc_number",
  "dot_number",
] as const;

const COUNT_LABELS: Array<{ key: keyof CustomerMergeCounts; label: string }> = [
  { key: "loads", label: "Loads" },
  { key: "contacts", label: "Contacts" },
  { key: "documents", label: "Documents" },
  { key: "load_templates", label: "Load templates" },
  { key: "contracts", label: "Contracts" },
  { key: "detention_terms", label: "Detention terms" },
  { key: "requirements", label: "Requirements" },
  { key: "reminders", label: "Reminders" },
  { key: "detention_requests", label: "Detention requests" },
  { key: "invoices", label: "Invoices" },
];

export type CustomerMergeCounts = {
  loads: number;
  contacts: number;
  documents: number;
  load_templates: number;
  contracts: number;
  detention_terms: number;
  requirements: number;
  reminders: number;
  detention_requests: number;
  invoices: number;
};

export type CustomerMergeRepoint = {
  table: string;
  column: "customer_id";
  idColumn: string;
  from: number;
  to: number;
  ids: number[];
};

export type CustomerFieldFill = {
  field: (typeof FILL_FIELDS)[number];
  fromId: number;
  value: string;
};

type DetentionRow = {
  customer_id: number;
  rate_per_hour: number | null;
  free_hours: number | null;
  billing_increment_minutes: number | null;
  cap_per_day: number | null;
  cap_per_stop: number | null;
  notice_lead_minutes: number | null;
  conditions: string;
  updated_at: string;
};

type CustomerRow = {
  id: number;
  name: string;
  billing_notes: string;
  credit_hold: number;
  payment_terms: string;
  qbo_customer_id: string;
  qbo_status: string;
  main_email: string;
  billing_email: string;
  mc_number: string;
  dot_number: string;
  archived_at: string | null;
  merged_into: number | null;
  updated_at: string;
};

export type CustomerMergeSnapshot = {
  keeperId: number;
  loserIds: number[];
  keeperBefore: {
    billing_notes: string;
    payment_terms: string;
    main_email: string;
    billing_email: string;
    credit_hold: number;
    mc_number: string;
    dot_number: string;
  };
  fills: CustomerFieldFill[];
  creditHoldAfter: number;
  mcApplied: string | null;
  repointed: CustomerMergeRepoint[];
  removedAliases: Array<Record<string, unknown>>;
  insertedAliasIds: number[];
  detention: { keeper: DetentionRow | null; losers: DetentionRow[] };
};

export type CustomerMergePlan = {
  keeperId: number;
  loserIds: number[];
  keeperName: string;
  losers: Array<{ id: number; name: string }>;
  counts: CustomerMergeCounts;
  creditHoldBefore: number;
  creditHoldAfter: number;
  fills: CustomerFieldFill[];
  mcNumber: string;
  aliases: string[];
};

export type CustomerMergePlanResult = { ok: true; plan: CustomerMergePlan } | { ok: false; error: string };

export type CustomerMergeAudit = {
  id: number;
  keeperId: number;
  loserIds: number[];
  actor: string;
  createdAt: string;
  undoneAt: string | null;
  snapshot: CustomerMergeSnapshot;
};

export function customerIdColumns(db: Database): Array<{ table: string; column: string }> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  const found: Array<{ table: string; column: string }> = [];
  for (const table of tables) {
    if (table.name === "customers") continue;
    const columns = db.prepare(`PRAGMA table_info(${ident(table.name)})`).all() as Array<{ name: string }>;
    for (const column of columns) {
      if (column.name === "customer_id") found.push({ table: table.name, column: "customer_id" });
    }
  }
  return found;
}

export function missingCustomerFkTargets(
  columns: Array<{ table: string; column: string }>,
  targets: Array<{ table: string; column: string }> = CUSTOMER_MERGE_FK_TARGETS,
): string[] {
  const handled = new Set(targets.map((target) => `${target.table}.${target.column}`));
  return columns.map((column) => `${column.table}.${column.column}`).filter((key) => !handled.has(key));
}

export function unknownCustomerFkTargets(
  columns: Array<{ table: string; column: string }>,
  targets: Array<{ table: string; column: string }> = CUSTOMER_MERGE_FK_TARGETS,
): string[] {
  const present = new Set(columns.map((column) => `${column.table}.${column.column}`));
  return targets.map((target) => `${target.table}.${target.column}`).filter((key) => !present.has(key));
}

export function assertCustomerFkCoverage(db: Database): void {
  const columns = customerIdColumns(db);
  const missing = missingCustomerFkTargets(columns);
  const unknown = unknownCustomerFkTargets(columns);
  if (missing.length || unknown.length) {
    const parts = [
      missing.length ? `not handled: ${missing.join(", ")}` : "",
      unknown.length ? `missing from schema: ${unknown.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(`Customer merge foreign keys are out of date (${parts.join("; ")}).`);
  }
}

export function planCustomerMerge(input: {
  keeperId: number;
  loserIds: number[];
  mcNumber?: string;
}): CustomerMergePlanResult {
  const db = getDb();
  assertCustomerFkCoverage(db);
  const loaded = loadGroup(db, input.keeperId, input.loserIds);
  if (!loaded.ok) return loaded;
  const qbo = qboBlock(loaded.keeper, loaded.losers);
  if (qbo) return { ok: false, error: qbo };
  const requested = String(input.mcNumber ?? "").trim();
  const mcError = mcConflict(loaded.keeper, requested);
  if (mcError) return { ok: false, error: mcError };
  return { ok: true, plan: describePlan(db, loaded.keeper, loaded.losers, requested) };
}

export function mergeCustomers(input: {
  keeperId: number;
  loserIds: number[];
  mcNumber?: string;
  actor?: string;
}): { mergeId: number; plan: CustomerMergePlan } {
  const db = getDb();
  const planned = planCustomerMerge(input);
  if (!planned.ok) throw new Error(planned.error);
  const actor = String(input.actor ?? "script").trim() || "script";
  const now = new Date().toISOString();
  let mergeId = 0;
  const run = db.transaction(() => {
    assertCustomerFkCoverage(db);
    const loaded = loadGroup(db, input.keeperId, input.loserIds);
    if (!loaded.ok) throw new Error(loaded.error);
    const qbo = qboBlock(loaded.keeper, loaded.losers);
    if (qbo) throw new Error(qbo);
    const requested = String(input.mcNumber ?? "").trim();
    const mcError = mcConflict(loaded.keeper, requested);
    if (mcError) throw new Error(mcError);
    const plan = describePlan(db, loaded.keeper, loaded.losers, requested);
    const snapshot = applyGroup(db, loaded.keeper, loaded.losers, plan, now);
    const result = db
      .prepare(
        `INSERT INTO customer_merges (keeper_id, loser_ids, snapshot, actor, undone_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .run(loaded.keeper.id, JSON.stringify(loaded.losers.map((row) => row.id)), JSON.stringify(snapshot), actor, now);
    mergeId = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail, created_at)
       VALUES (?, 'customer_merge', 'customer', ?, ?, ?)`,
    ).run(
      actor,
      loaded.keeper.id,
      `Merged customers ${loaded.losers.map((row) => row.id).join(", ")} into ${loaded.keeper.id}. ${CUSTOMER_MERGE_QBO_NOTE}`,
      now,
    );
  });
  run();
  return { mergeId, plan: planned.plan };
}

export function undoCustomerMerge(mergeId: number, actor = "script"): void {
  const db = getDb();
  const row = db.prepare("SELECT * FROM customer_merges WHERE id = ?").get(mergeId) as
    | { id: number; keeper_id: number; snapshot: string; undone_at: string | null }
    | undefined;
  if (!row) throw new Error("That merge was not found.");
  if (row.undone_at) throw new Error("This merge was already undone.");
  const snapshot = JSON.parse(String(row.snapshot)) as CustomerMergeSnapshot;
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    restoreKeeper(db, snapshot, now);
    for (const aliasId of snapshot.insertedAliasIds) {
      db.prepare("DELETE FROM customer_aliases WHERE id = ?").run(aliasId);
    }
    for (const repoint of snapshot.repointed) {
      if (repoint.table === "customer_detention_terms") continue;
      for (const id of repoint.ids) {
        db.prepare(
          `UPDATE ${ident(repoint.table)} SET ${ident(repoint.column)} = ? WHERE ${ident(repoint.idColumn)} = ? AND ${ident(repoint.column)} = ?`,
        ).run(repoint.from, id, repoint.to);
      }
    }
    for (const alias of snapshot.removedAliases) {
      insertRaw(db, "customer_aliases", alias);
    }
    restoreDetention(db, snapshot);
    for (const loserId of snapshot.loserIds) {
      db.prepare("UPDATE customers SET archived_at = NULL, merged_into = NULL, updated_at = ? WHERE id = ?").run(
        now,
        loserId,
      );
    }
    db.prepare("UPDATE customer_merges SET undone_at = ? WHERE id = ? AND undone_at IS NULL").run(now, mergeId);
    db.prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail, created_at)
       VALUES (?, 'customer_merge_undo', 'customer', ?, ?, ?)`,
    ).run(actor, snapshot.keeperId, `Undid customer merge ${mergeId}. ${CUSTOMER_MERGE_QBO_NOTE}`, now);
  });
  run();
}

export function getCustomerMerge(id: number): CustomerMergeAudit | null {
  const row = getDb().prepare("SELECT * FROM customer_merges WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? asAudit(row) : null;
}

export function listOpenMergesTouching(customerId: number): CustomerMergeAudit[] {
  const rows = getDb()
    .prepare("SELECT * FROM customer_merges WHERE undone_at IS NULL ORDER BY id DESC")
    .all() as Array<Record<string, unknown>>;
  return rows.map(asAudit).filter((row) => row.keeperId === customerId || row.loserIds.includes(customerId));
}

export function formatCustomerMergePlan(plan: CustomerMergePlan, dryRun: boolean): string {
  const lines = [
    dryRun ? "Dry run. Nothing written." : "Applied. Nothing was sent to QuickBooks.",
    `Keeper: ${plan.keeperId} ${plan.keeperName}`,
    `Merging: ${plan.losers.map((row) => `${row.id} ${row.name}`).join("; ")}`,
  ];
  for (const item of COUNT_LABELS) {
    lines.push(`${item.label}: ${plan.counts[item.key]}`);
  }
  lines.push(`Credit hold: ${plan.creditHoldAfter ? "on" : "off"}`);
  for (const fill of plan.fills) {
    lines.push(`${fillLabel(fill.field)}: ${fill.value}`);
  }
  if (plan.mcNumber) lines.push(`MC: ${plan.mcNumber}`);
  if (plan.aliases.length) lines.push(`Aliases: ${plan.aliases.join(", ")}`);
  return lines.join("\n");
}

export function countLabels(): Array<{ key: keyof CustomerMergeCounts; label: string }> {
  return COUNT_LABELS;
}

function describePlan(db: Database, keeper: CustomerRow, losers: CustomerRow[], requestedMc: string): CustomerMergePlan {
  const fills = fieldFills(keeper, losers);
  const mcFromFill = fills.find((fill) => fill.field === "mc_number")?.value ?? "";
  let mcNumber = "";
  if (requestedMc) {
    if (normalizeMcNumber(keeper.mc_number) !== normalizeMcNumber(requestedMc)) mcNumber = requestedMc;
  } else if (mcFromFill) {
    mcNumber = mcFromFill;
  }
  const creditHoldAfter = Number(keeper.credit_hold) || losers.some((row) => Number(row.credit_hold)) ? 1 : 0;
  return {
    keeperId: keeper.id,
    loserIds: losers.map((row) => row.id),
    keeperName: keeper.name,
    losers: losers.map((row) => ({ id: row.id, name: row.name })),
    counts: countLoserRows(db, losers.map((row) => row.id)),
    creditHoldBefore: Number(keeper.credit_hold) ? 1 : 0,
    creditHoldAfter,
    fills: requestedMc ? fills.filter((fill) => fill.field !== "mc_number") : fills,
    mcNumber,
    aliases: losers.map((row) => row.name.trim()).filter((name) => aliasNameForKeeper(keeper.name, name)),
  };
}

function applyGroup(
  db: Database,
  keeper: CustomerRow,
  losers: CustomerRow[],
  plan: CustomerMergePlan,
  now: string,
): CustomerMergeSnapshot {
  const snapshot: CustomerMergeSnapshot = {
    keeperId: keeper.id,
    loserIds: losers.map((row) => row.id),
    keeperBefore: {
      billing_notes: keeper.billing_notes ?? "",
      payment_terms: keeper.payment_terms ?? "",
      main_email: keeper.main_email ?? "",
      billing_email: keeper.billing_email ?? "",
      credit_hold: Number(keeper.credit_hold) ? 1 : 0,
      mc_number: keeper.mc_number ?? "",
      dot_number: keeper.dot_number ?? "",
    },
    fills: plan.fills,
    creditHoldAfter: plan.creditHoldAfter,
    mcApplied: plan.mcNumber || null,
    repointed: [],
    removedAliases: [],
    insertedAliasIds: [],
    detention: { keeper: null, losers: [] },
  };
  const next = { ...snapshot.keeperBefore };
  for (const fill of plan.fills) {
    next[fill.field] = fill.value;
  }
  if (plan.mcNumber) next.mc_number = plan.mcNumber;
  next.credit_hold = plan.creditHoldAfter;
  db.prepare(
    `UPDATE customers
     SET billing_notes = ?, payment_terms = ?, main_email = ?, billing_email = ?,
         credit_hold = ?, mc_number = ?, dot_number = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.billing_notes,
    next.payment_terms,
    next.main_email,
    next.billing_email,
    next.credit_hold,
    next.mc_number,
    next.dot_number,
    now,
    keeper.id,
  );

  mergeDetention(db, keeper.id, losers.map((row) => row.id), now, snapshot);

  for (const loser of losers) {
    for (const target of CUSTOMER_MERGE_FK_TARGETS) {
      if (target.table === "customer_detention_terms") continue;
      if (target.table === "customer_aliases") {
        repointAliases(db, loser.id, keeper.id, keeper.name, snapshot);
        continue;
      }
      repointIds(db, target, loser.id, keeper.id, snapshot);
    }
    const aliasId = insertAlias(db, keeper.id, keeper.name, loser.name, now);
    if (aliasId) snapshot.insertedAliasIds.push(aliasId);
    db.prepare("UPDATE customers SET archived_at = ?, merged_into = ?, updated_at = ? WHERE id = ?").run(
      now,
      keeper.id,
      now,
      loser.id,
    );
  }
  return snapshot;
}

function repointIds(
  db: Database,
  target: { table: string; column: "customer_id"; idColumn: string },
  fromId: number,
  toId: number,
  snapshot: CustomerMergeSnapshot,
): void {
  const rows = db
    .prepare(`SELECT ${ident(target.idColumn)} AS id FROM ${ident(target.table)} WHERE ${ident(target.column)} = ?`)
    .all(fromId) as Array<{ id: number }>;
  if (!rows.length) return;
  db.prepare(`UPDATE ${ident(target.table)} SET ${ident(target.column)} = ? WHERE ${ident(target.column)} = ?`).run(
    toId,
    fromId,
  );
  snapshot.repointed.push({
    table: target.table,
    column: "customer_id",
    idColumn: target.idColumn,
    from: fromId,
    to: toId,
    ids: rows.map((row) => Number(row.id)),
  });
}

function repointAliases(
  db: Database,
  fromId: number,
  toId: number,
  keeperName: string,
  snapshot: CustomerMergeSnapshot,
): void {
  const rows = db.prepare("SELECT * FROM customer_aliases WHERE customer_id = ? ORDER BY id").all(fromId) as Array<
    Record<string, unknown>
  >;
  const moved: number[] = [];
  for (const row of rows) {
    const normalized = String(row.normalized ?? "");
    const owned = db
      .prepare("SELECT id FROM customer_aliases WHERE normalized = ? AND customer_id = ?")
      .get(normalized, toId) as { id: number } | undefined;
    const sameAsKeeper = normalizeCustomerAlias(keeperName) === normalized;
    if (owned || sameAsKeeper) {
      snapshot.removedAliases.push(row);
      db.prepare("DELETE FROM customer_aliases WHERE id = ?").run(Number(row.id));
      continue;
    }
    db.prepare("UPDATE customer_aliases SET customer_id = ? WHERE id = ?").run(toId, Number(row.id));
    moved.push(Number(row.id));
  }
  if (moved.length) {
    snapshot.repointed.push({
      table: "customer_aliases",
      column: "customer_id",
      idColumn: "id",
      from: fromId,
      to: toId,
      ids: moved,
    });
  }
}

function mergeDetention(
  db: Database,
  keeperId: number,
  loserIds: number[],
  now: string,
  snapshot: CustomerMergeSnapshot,
): void {
  const keeper = readDetention(db, keeperId);
  const losers = loserIds.map((id) => readDetention(db, id)).filter((row): row is DetentionRow => Boolean(row));
  snapshot.detention = { keeper, losers };
  if (!losers.length) return;
  let combined: DetentionRow | null = keeper ? { ...keeper } : null;
  for (const loser of losers) {
    snapshot.repointed.push({
      table: "customer_detention_terms",
      column: "customer_id",
      idColumn: "customer_id",
      from: loser.customer_id,
      to: keeperId,
      ids: [loser.customer_id],
    });
    if (!combined) {
      combined = { ...loser, customer_id: keeperId, updated_at: now };
      continue;
    }
    fillDetention(combined, loser);
    combined.updated_at = now;
  }
  for (const loser of losers) {
    db.prepare("DELETE FROM customer_detention_terms WHERE customer_id = ?").run(loser.customer_id);
  }
  if (!combined) return;
  if (keeper) {
    writeDetention(db, keeperId, combined);
  } else {
    insertDetention(db, { ...combined, customer_id: keeperId });
  }
}

function restoreKeeper(db: Database, snapshot: CustomerMergeSnapshot, now: string): void {
  const before = snapshot.keeperBefore;
  db.prepare(
    `UPDATE customers
     SET billing_notes = ?, payment_terms = ?, main_email = ?, billing_email = ?,
         credit_hold = ?, mc_number = ?, dot_number = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    before.billing_notes,
    before.payment_terms,
    before.main_email,
    before.billing_email,
    before.credit_hold,
    before.mc_number,
    before.dot_number,
    now,
    snapshot.keeperId,
  );
}

function fillDetention(combined: DetentionRow, loser: DetentionRow): void {
  if (combined.rate_per_hour == null && loser.rate_per_hour != null) combined.rate_per_hour = loser.rate_per_hour;
  if (combined.free_hours == null && loser.free_hours != null) combined.free_hours = loser.free_hours;
  if (combined.billing_increment_minutes == null && loser.billing_increment_minutes != null) {
    combined.billing_increment_minutes = loser.billing_increment_minutes;
  }
  if (combined.cap_per_day == null && loser.cap_per_day != null) combined.cap_per_day = loser.cap_per_day;
  if (combined.cap_per_stop == null && loser.cap_per_stop != null) combined.cap_per_stop = loser.cap_per_stop;
  if (combined.notice_lead_minutes == null && loser.notice_lead_minutes != null) {
    combined.notice_lead_minutes = loser.notice_lead_minutes;
  }
  if (isBlank(combined.conditions) && !isBlank(loser.conditions)) combined.conditions = loser.conditions;
}

function restoreDetention(db: Database, snapshot: CustomerMergeSnapshot): void {
  const saved = snapshot.detention;
  if (!saved) return;
  const ids = [snapshot.keeperId, ...snapshot.loserIds];
  for (const id of ids) db.prepare("DELETE FROM customer_detention_terms WHERE customer_id = ?").run(id);
  if (saved.keeper) insertDetention(db, saved.keeper);
  for (const row of saved.losers) insertDetention(db, row);
}

function countLoserRows(db: Database, loserIds: number[]): CustomerMergeCounts {
  const { sql, params } = placeholders(loserIds);
  const direct = (table: string) =>
    scalar(db, `SELECT COUNT(*) AS n FROM ${ident(table)} WHERE customer_id IN (${sql})`, params);
  return {
    loads: direct("loads"),
    contacts: direct("contacts"),
    documents: scalar(
      db,
      `SELECT COUNT(*) AS n FROM attachments WHERE load_id IN (SELECT id FROM loads WHERE customer_id IN (${sql}))`,
      params,
    ),
    load_templates: direct("load_templates"),
    contracts: direct("customer_contracts"),
    detention_terms: direct("customer_detention_terms"),
    requirements: direct("customer_requirements"),
    reminders: scalar(
      db,
      `SELECT COUNT(*) AS n FROM load_requirement_reminders
       WHERE requirement_id IN (SELECT id FROM customer_requirements WHERE customer_id IN (${sql}))`,
      params,
    ),
    detention_requests: scalar(
      db,
      `SELECT COUNT(*) AS n FROM detention_requests WHERE load_id IN (SELECT id FROM loads WHERE customer_id IN (${sql}))`,
      params,
    ),
    invoices: scalar(
      db,
      `SELECT COUNT(*) AS n FROM loads
       WHERE customer_id IN (${sql})
         AND (
           TRIM(IFNULL(qbo_invoice_id, '')) != ''
           OR TRIM(IFNULL(tms_invoice_number, '')) != ''
         )`,
      params,
    ),
  };
}

function fieldFills(keeper: CustomerRow, losers: CustomerRow[]): CustomerFieldFill[] {
  const fills: CustomerFieldFill[] = [];
  for (const field of FILL_FIELDS) {
    if (!isBlank(keeper[field])) continue;
    const source = losers.find((row) => !isBlank(row[field]));
    if (!source) continue;
    fills.push({ field, fromId: source.id, value: String(source[field]).trim() });
  }
  return fills;
}

function qboBlock(keeper: CustomerRow, losers: CustomerRow[]): string | null {
  if (qboId(keeper)) return null;
  const linked = losers.find((row) => qboId(row));
  if (!linked) return null;
  return `Merge blocked. ${linked.name} is linked to QuickBooks customer ${qboId(linked)}, and ${keeper.name} is not. Put that QuickBooks customer on ${keeper.name} first. ${CUSTOMER_MERGE_QBO_NOTE}`;
}

function mcConflict(keeper: CustomerRow, requested: string): string | null {
  if (!requested) return null;
  const current = normalizeMcNumber(keeper.mc_number);
  const next = normalizeMcNumber(requested);
  if (current && next && current !== next) {
    return `Keeper already has MC ${keeper.mc_number}. The file says ${requested}. Nothing was written.`;
  }
  return null;
}

function loadGroup(
  db: Database,
  keeperId: number,
  loserIds: number[],
): { ok: true; keeper: CustomerRow; losers: CustomerRow[] } | { ok: false; error: string } {
  const unique = [...new Set(loserIds.map((id) => Number(id)))];
  if (!Number.isInteger(keeperId) || keeperId <= 0) return { ok: false, error: "Pick a keeper." };
  if (!unique.length) return { ok: false, error: "Pick at least one customer to merge." };
  if (unique.some((id) => !Number.isInteger(id) || id <= 0)) return { ok: false, error: "A customer id is not valid." };
  if (unique.includes(keeperId)) return { ok: false, error: "The keeper cannot also be merged away." };
  const keeper = readCustomer(db, keeperId);
  if (!keeper) return { ok: false, error: "Keeper was not found." };
  if (keeper.archived_at) return { ok: false, error: `${keeper.name} is archived. Pick an active keeper.` };
  const losers: CustomerRow[] = [];
  for (const id of unique.sort((a, b) => a - b)) {
    const row = readCustomer(db, id);
    if (!row) return { ok: false, error: `Customer ${id} was not found.` };
    if (row.archived_at) return { ok: false, error: `${row.name} is already archived.` };
    const aliasOwner = aliasOwnedByOther(db, row.name, keeperId, unique);
    if (aliasOwner) {
      return {
        ok: false,
        error: `${row.name} is already an alias of customer ${aliasOwner}. Nothing was written.`,
      };
    }
    losers.push(row);
  }
  return { ok: true, keeper, losers };
}

function aliasOwnedByOther(db: Database, name: string, keeperId: number, loserIds: number[]): number | null {
  const normalized = normalizeCustomerAlias(name);
  if (!normalized) return null;
  const row = db.prepare("SELECT customer_id FROM customer_aliases WHERE normalized = ?").get(normalized) as
    | { customer_id: number }
    | undefined;
  if (!row) return null;
  const owner = Number(row.customer_id);
  if (owner === keeperId || loserIds.includes(owner)) return null;
  return owner;
}

function aliasNameForKeeper(keeperName: string, copyName: string): string {
  const name = copyName.trim();
  const normalized = normalizeCustomerAlias(name);
  if (!normalized) return "";
  if (normalized === normalizeCustomerAlias(keeperName)) return "";
  return name;
}

function insertAlias(db: Database, keeperId: number, keeperName: string, copyName: string, now: string): number | null {
  const name = aliasNameForKeeper(keeperName, copyName);
  if (!name) return null;
  const normalized = normalizeCustomerAlias(name);
  const existing = db.prepare("SELECT id, customer_id FROM customer_aliases WHERE normalized = ?").get(normalized) as
    | { id: number; customer_id: number }
    | undefined;
  if (existing) return Number(existing.customer_id) === keeperId ? null : null;
  const result = db
    .prepare("INSERT INTO customer_aliases (customer_id, name, normalized, created_at) VALUES (?, ?, ?, ?)")
    .run(keeperId, name, normalized, now);
  return Number(result.lastInsertRowid);
}

function readCustomer(db: Database, id: number): CustomerRow | null {
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
  return row ?? null;
}

function readDetention(db: Database, customerId: number): DetentionRow | null {
  const row = db.prepare("SELECT * FROM customer_detention_terms WHERE customer_id = ?").get(customerId) as
    | DetentionRow
    | undefined;
  return row ?? null;
}

function writeDetention(db: Database, customerId: number, row: DetentionRow): void {
  db.prepare(
    `UPDATE customer_detention_terms
     SET rate_per_hour = ?, free_hours = ?, billing_increment_minutes = ?,
         cap_per_day = ?, cap_per_stop = ?, notice_lead_minutes = ?, conditions = ?, updated_at = ?
     WHERE customer_id = ?`,
  ).run(
    row.rate_per_hour,
    row.free_hours,
    row.billing_increment_minutes,
    row.cap_per_day,
    row.cap_per_stop,
    row.notice_lead_minutes,
    row.conditions ?? "",
    row.updated_at,
    customerId,
  );
}

function insertDetention(db: Database, row: DetentionRow): void {
  db.prepare(
    `INSERT INTO customer_detention_terms (
      customer_id, rate_per_hour, free_hours, billing_increment_minutes,
      cap_per_day, cap_per_stop, notice_lead_minutes, conditions, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.customer_id,
    row.rate_per_hour,
    row.free_hours,
    row.billing_increment_minutes,
    row.cap_per_day,
    row.cap_per_stop,
    row.notice_lead_minutes,
    row.conditions ?? "",
    row.updated_at,
  );
}

function insertRaw(db: Database, table: string, row: Record<string, unknown>): void {
  const keys = Object.keys(row);
  if (!keys.length) return;
  db.prepare(
    `INSERT INTO ${ident(table)} (${keys.map((key) => ident(key)).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
  ).run(...keys.map((key) => row[key] as string | number | null));
}

function asAudit(row: Record<string, unknown>): CustomerMergeAudit {
  const loserIds = JSON.parse(String(row.loser_ids ?? "[]")) as number[];
  return {
    id: Number(row.id),
    keeperId: Number(row.keeper_id),
    loserIds: loserIds.map((id) => Number(id)),
    actor: String(row.actor ?? ""),
    createdAt: String(row.created_at ?? ""),
    undoneAt: row.undone_at == null || row.undone_at === "" ? null : String(row.undone_at),
    snapshot: JSON.parse(String(row.snapshot ?? "{}")) as CustomerMergeSnapshot,
  };
}

function qboId(row: CustomerRow): string {
  return String(row.qbo_customer_id ?? "").trim();
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function fillLabel(field: CustomerFieldFill["field"]): string {
  switch (field) {
    case "payment_terms":
      return "Payment terms";
    case "main_email":
      return "Main email";
    case "billing_email":
      return "Billing email";
    case "billing_notes":
      return "Billing notes";
    case "mc_number":
      return "MC";
    case "dot_number":
      return "DOT";
  }
}

function scalar(db: Database, sql: string, params: number[]): number {
  const row = db.prepare(sql).get(...params) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function placeholders(ids: number[]): { sql: string; params: number[] } {
  if (!ids.length) return { sql: "NULL", params: [] };
  return { sql: ids.map(() => "?").join(", "), params: ids };
}

function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Refusing name ${name}`);
  return `"${name}"`;
}
