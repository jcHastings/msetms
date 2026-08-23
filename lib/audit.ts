import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "./db";

export type AuditActorKind = "dispatcher" | "driver" | "system";

export type AuditActor = {
  name: string;
  kind: AuditActorKind;
};

export type LoadAuditRow = {
  id: number;
  load_id: number;
  load_number: string;
  actor: string;
  actor_kind: AuditActorKind;
  action: string;
  field: string;
  old_value: string;
  new_value: string;
  created_at: string;
};

export type LoadAuditFilters = {
  loadNumber?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
};

const actorStore = new AsyncLocalStorage<AuditActor>();

const SECRET_FIELD = /(pin|password|passwd|secret|token|api[_-]?key|auth|credential)/i;

export function runWithAuditActor<T>(actor: AuditActor, fn: () => T): T {
  return actorStore.run(sanitizeActor(actor), fn);
}

export function currentAuditActor(): AuditActor {
  return actorStore.getStore() ?? { name: "System", kind: "system" };
}

export async function resolveRequestActor(): Promise<AuditActor> {
  try {
    const { getSignedInDispatcher } = await import("./dispatcher-session");
    const dispatcher = await getSignedInDispatcher();
    if (dispatcher?.name) return { name: dispatcher.name, kind: "dispatcher" };
  } catch {
    // Scripts and tests have no cookie store.
  }
  try {
    const { getSignedInDriver } = await import("./driver-session");
    const driver = await getSignedInDriver();
    if (driver?.name) return { name: driver.name, kind: "driver" };
  } catch {
    // Scripts and tests have no cookie store.
  }
  return { name: "System", kind: "system" };
}

export async function withRequestAuditActor<T>(fn: () => Promise<T> | T): Promise<T> {
  const actor = await resolveRequestActor();
  return runWithAuditActor(actor, fn);
}

export function recordLoadAudit(input: {
  loadId: number;
  loadNumber?: string;
  action: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}): void {
  const field = sanitizeAuditField(input.field ?? "");
  const oldValue = formatAuditValue(field, input.oldValue);
  const newValue = formatAuditValue(field, input.newValue);
  if (field && oldValue === newValue && input.action !== "clone") {
    return;
  }
  const actor = currentAuditActor();
  const loadNumber = input.loadNumber || lookupLoadNumber(input.loadId);
  getDb()
    .prepare(
      `INSERT INTO load_audit (
        load_id, load_number, actor, actor_kind, action, field, old_value, new_value, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.loadId,
      loadNumber,
      actor.name,
      actor.kind,
      input.action,
      field,
      oldValue,
      newValue,
      new Date().toISOString(),
    );
}

export function recordLoadChanges(
  loadId: number,
  action: string,
  changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>,
): void {
  for (const change of changes) {
    recordLoadAudit({
      loadId,
      action,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  }
}

export function listLoadAudit(loadId: number): LoadAuditRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM load_audit
       WHERE load_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(loadId) as LoadAuditRow[];
}

export function listLoadLog(loadId: number): LoadAuditRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM load_audit
       WHERE load_id = ?
         AND action IN ('status', 'check_call', 'cancel', 'docs_requested')
       ORDER BY created_at DESC, id DESC`,
    )
    .all(loadId) as LoadAuditRow[];
}

export function listCompanyAudit(filters: LoadAuditFilters = {}): LoadAuditRow[] {
  const loadNumber = (filters.loadNumber ?? "").trim();
  const actor = (filters.actor ?? "").trim();
  const from = startOfDay(filters.from);
  const to = endOfDay(filters.to);
  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 1000);
  return getDb()
    .prepare(
      `SELECT * FROM load_audit
       WHERE (? = '' OR load_number LIKE ?)
         AND (? = '' OR actor LIKE ?)
         AND (? = '' OR created_at >= ?)
         AND (? = '' OR created_at <= ?)
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(
      loadNumber,
      `%${loadNumber}%`,
      actor,
      `%${actor}%`,
      from,
      from,
      to,
      to,
      limit,
    ) as LoadAuditRow[];
}

export function listAuditActors(): string[] {
  return (
    getDb().prepare("SELECT DISTINCT actor FROM load_audit ORDER BY actor COLLATE NOCASE").all() as Array<{
      actor: string;
    }>
  )
    .map((row) => row.actor)
    .filter(Boolean);
}

export function customerName(id: number | null | undefined): string {
  if (id == null) return "";
  const row = getDb().prepare("SELECT name FROM customers WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? String(id);
}

export function driverName(id: number | null | undefined): string {
  if (id == null) return "";
  const row = getDb().prepare("SELECT name FROM drivers WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? String(id);
}

export function truckUnit(id: number | null | undefined): string {
  if (id == null) return "";
  const row = getDb().prepare("SELECT unit_number FROM trucks WHERE id = ?").get(id) as
    | { unit_number: string }
    | undefined;
  return row?.unit_number ? `Unit ${row.unit_number}` : String(id);
}

export function trailerUnit(id: number | null | undefined): string {
  if (id == null) return "";
  const row = getDb().prepare("SELECT unit_number FROM trailers WHERE id = ?").get(id) as
    | { unit_number: string }
    | undefined;
  return row?.unit_number ?? String(id);
}

export function locationName(id: number | null | undefined): string {
  if (id == null) return "";
  const row = getDb().prepare("SELECT name FROM locations WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? String(id);
}

function lookupLoadNumber(loadId: number): string {
  const row = getDb().prepare("SELECT load_number FROM loads WHERE id = ?").get(loadId) as
    | { load_number: string }
    | undefined;
  return row?.load_number ?? "";
}

function sanitizeActor(actor: AuditActor): AuditActor {
  const name = actor.name.trim() || "System";
  if (SECRET_FIELD.test(name)) return { name: "Unknown", kind: actor.kind };
  return { name: name.slice(0, 80), kind: actor.kind };
}

function sanitizeAuditField(field: string): string {
  return SECRET_FIELD.test(field) ? "" : field.slice(0, 80);
}

export function formatAuditValue(field: string, value: unknown): string {
  if (SECRET_FIELD.test(field)) return "[redacted]";
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value).trim();
  if (!text) return "";
  if (SECRET_FIELD.test(text)) return "[redacted]";
  return text.slice(0, 500);
}

function startOfDay(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function endOfDay(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.999Z`;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
