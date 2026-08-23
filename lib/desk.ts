import { getDb } from "./db";
import { listExceptionInbox, type ExceptionInbox, type InboxException } from "./exceptions";
import { getLoad, listLoads } from "./queries";
import type { LoadView } from "./types";

export type ExceptionState = {
  exception_key: string;
  status: "open" | "ack" | "snoozed" | "resolved";
  reason: string;
  until: string;
  updated_at: string;
};

export type Claim = {
  id: number;
  load_id: number;
  claim_number: string;
  kind: string;
  status: string;
  notes: string;
  created_at: string;
};

export type AuditRow = {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id: number | null;
  detail: string;
  created_at: string;
};

function now(): string {
  return new Date().toISOString();
}

export function getHandoffNote(): string {
  const row = getDb().prepare("SELECT handoff_note FROM desk_state WHERE id = 1").get() as
    | { handoff_note: string }
    | undefined;
  return row?.handoff_note ?? "";
}

export function setHandoffNote(note: string): void {
  getDb().prepare("UPDATE desk_state SET handoff_note = ? WHERE id = 1").run(note.trim());
}

export function setExceptionState(
  key: string,
  status: ExceptionState["status"],
  reason = "",
  until = "",
): void {
  getDb()
    .prepare(
      `INSERT INTO exception_states (exception_key, status, reason, until, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(exception_key) DO UPDATE SET
         status = excluded.status, reason = excluded.reason, until = excluded.until, updated_at = excluded.updated_at`,
    )
    .run(key, status, reason.trim(), until, now());
}

export function listExceptionStates(): Map<string, ExceptionState> {
  const rows = getDb().prepare("SELECT * FROM exception_states").all() as ExceptionState[];
  return new Map(rows.map((row) => [row.exception_key, row]));
}

export function listLiveExceptionInbox(filters?: {
  kind?: string;
  customer?: string;
  q?: string;
}): ExceptionInbox {
  const inbox = listExceptionInbox();
  const states = listExceptionStates();
  const nowMs = Date.now();
  const items = inbox.items.filter((item) => {
    const state = states.get(item.id);
    if (!state || state.status === "open" || state.status === "ack") return true;
    if (state.status === "resolved") return false;
    if (state.status === "snoozed" && state.until) {
      const until = new Date(state.until).getTime();
      return Number.isNaN(until) || until <= nowMs;
    }
    return state.status !== "snoozed";
  });
  const filtered = items.filter((item) => {
    if (filters?.kind && item.kind !== filters.kind) return false;
    if (filters?.customer && !item.customerName.toLowerCase().includes(filters.customer.toLowerCase())) {
      return false;
    }
    if (filters?.q) {
      const hay = `${item.loadNumber} ${item.customerName} ${item.origin} ${item.destination} ${item.title}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });
  return { ...inbox, items: filtered, attentionCount: filtered.length };
}

export function exceptionStateFor(item: InboxException): ExceptionState | null {
  return listExceptionStates().get(item.id) ?? null;
}

export function createClaim(input: {
  loadId: number;
  claimNumber: string;
  kind: string;
  notes: string;
}): number {
  if (!getLoad(input.loadId)) throw new Error("Load not found.");
  const result = getDb()
    .prepare(
      `INSERT INTO claims (load_id, claim_number, kind, status, notes, created_at)
       VALUES (?, ?, ?, 'open', ?, ?)`,
    )
    .run(input.loadId, input.claimNumber.trim(), input.kind.trim() || "osd", input.notes.trim(), now());
  return Number(result.lastInsertRowid);
}

export function listClaims(loadId?: number): Array<Claim & { load_number?: string }> {
  if (loadId) {
    return getDb().prepare("SELECT * FROM claims WHERE load_id = ? ORDER BY id DESC").all(loadId) as Claim[];
  }
  return getDb()
    .prepare(
      `SELECT claims.*, loads.load_number
       FROM claims JOIN loads ON loads.id = claims.load_id
       ORDER BY claims.id DESC`,
    )
    .all() as Array<Claim & { load_number: string }>;
}

export function writeAudit(action: string, entity: string, entityId: number | null, detail = ""): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail, created_at)
       VALUES ('dispatcher', ?, ?, ?, ?, ?)`,
    )
    .run(action, entity, entityId, detail, now());
}

export function listAudit(limit = 50): AuditRow[] {
  return getDb().prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit) as AuditRow[];
}

export function dailyRecap(): {
  delivered: number;
  late: number;
  claims: number;
  onTimePct: number;
} {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const loads = listLoads({ status: "all" }).filter((load) => new Date(load.updated_at) >= start);
  const delivered = loads.filter((load) => load.status === "delivered" || load.status === "completed");
  const late = delivered.filter((load) => new Date(load.delivery_end).getTime() < Date.now() - 60_000).length;
  const claims = (
    getDb().prepare("SELECT COUNT(*) as count FROM claims WHERE created_at >= ?").get(start.toISOString()) as {
      count: number;
    }
  ).count;
  return {
    delivered: delivered.length,
    late,
    claims,
    onTimePct: delivered.length ? Math.round(((delivered.length - late) / delivered.length) * 100) : 100,
  };
}

export function onTimeReport(): Array<LoadView & { onTime: boolean }> {
  return listLoads({ status: "delivered" })
    .concat(listLoads({ status: "completed" }))
    .map((load) => ({
      ...load,
      onTime: new Date(load.updated_at).getTime() <= new Date(load.delivery_end).getTime() + 30 * 60_000,
    }));
}

export function revenueByCustomer(): Array<{ customer: string; loads: number; revenue: number }> {
  const map = new Map<string, { loads: number; revenue: number }>();
  for (const load of listLoads({ status: "all" })) {
    if (load.status === "cancelled") continue;
    const current = map.get(load.customer_name) ?? { loads: 0, revenue: 0 };
    current.loads += 1;
    current.revenue += load.rate ?? 0;
    map.set(load.customer_name, current);
  }
  return [...map.entries()]
    .map(([customer, value]) => ({ customer, ...value }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function requiredDocumentsForLoad(load: LoadView): Array<{ kind: string; label: string; required: boolean }> {
  const docs = [
    { kind: "rate_con", label: "Rate confirmation", required: true },
    { kind: "bol", label: "BOL", required: true },
    { kind: "pod", label: "POD", required: load.status === "delivered" || load.status === "completed" },
    { kind: "temp_log", label: "Temp log", required: load.reefer_setpoint_f != null },
  ];
  return docs;
}
