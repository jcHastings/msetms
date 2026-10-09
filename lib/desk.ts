import { getDb } from "./db";
import {
  isOutOfToleranceException,
  listExceptionInbox,
  type ExceptionInbox,
  type InboxException,
} from "./exceptions";
import { getLoad, listLoads } from "./queries";
import { showsSampleData } from "./settings";
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
  return {
    ...inbox,
    items: filtered,
    attentionCount: new Set(filtered.map((item) => item.loadId)).size,
  };
}

/** Ranked out-of-tolerance loads only. A load leaves when every flag is back in tolerance. */
export function listWorkbenchInbox(filters?: {
  kind?: string;
  customer?: string;
  q?: string;
}): ExceptionInbox {
  const live = listLiveExceptionInbox(filters);
  const items = live.items.filter(isOutOfToleranceException);
  const attentionIds = new Set(items.map((item) => item.loadId));
  const active = listLoads({ status: "active" });
  return {
    items,
    attentionCount: attentionIds.size,
    fineCount: active.filter((load) => !attentionIds.has(load.id)).length,
  };
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

export function onTimeFromRows(rows: Array<{ onTime: boolean }>): {
  delivered: number;
  late: number;
  onTimePct: number | null;
} {
  const delivered = rows.length;
  const late = rows.filter((row) => !row.onTime).length;
  return {
    delivered,
    late,
    onTimePct: delivered ? Math.round(((delivered - late) / delivered) * 100) : null,
  };
}

export function formatOnTimePct(pct: number | null): string {
  return pct == null ? "—" : `${pct}%`;
}

export function dailyRecap(): {
  delivered: number;
  late: number;
  claims: number;
  onTimePct: number | null;
} {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sample = showsSampleData() ? "" : " AND is_sample = 0";
  const delivered = getDb()
    .prepare(
      `SELECT delivery_end FROM loads
       WHERE updated_at >= ?
         AND status IN ('delivered', 'completed')${sample}`,
    )
    .all(start.toISOString()) as Array<{ delivery_end: string }>;
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
    onTimePct: delivered.length ? Math.round(((delivered.length - late) / delivered.length) * 100) : null,
  };
}

const ON_TIME_GRACE_MS = 30 * 60_000;

/** Null when arrival was never recorded — those loads are left out of on-time, not counted late. */
export function onTimeForDeliveryArrival(arrivalIso: string, deliveryEndIso: string): boolean | null {
  const arrival = String(arrivalIso ?? "").trim();
  if (!arrival) return null;
  const arrivalMs = new Date(arrival).getTime();
  const endMs = new Date(deliveryEndIso).getTime();
  if (Number.isNaN(arrivalMs) || Number.isNaN(endMs)) return null;
  return arrivalMs <= endMs + ON_TIME_GRACE_MS;
}

function lastDeliveryArrivals(loadIds: number[]): Map<number, string> {
  const arrivals = new Map<number, string>();
  if (!loadIds.length) return arrivals;
  const seen = new Set<number>();
  const rows = getDb()
    .prepare(
      `SELECT load_id, arrived_at FROM load_stops
       WHERE kind = 'delivery' AND load_id IN (${loadIds.map(() => "?").join(", ")})
       ORDER BY sequence DESC, id DESC`,
    )
    .all(...loadIds) as Array<{ load_id: number; arrived_at: string }>;
  for (const row of rows) {
    if (seen.has(row.load_id)) continue;
    seen.add(row.load_id);
    const arrival = String(row.arrived_at ?? "").trim();
    if (arrival) arrivals.set(row.load_id, arrival);
  }
  return arrivals;
}

export function onTimeReport(): Array<LoadView & { onTime: boolean }> {
  const loads = listLoads({ status: "delivered" }).concat(listLoads({ status: "completed" }));
  const arrivals = lastDeliveryArrivals(loads.map((load) => load.id));
  const rows: Array<LoadView & { onTime: boolean }> = [];
  for (const load of loads) {
    const onTime = onTimeForDeliveryArrival(arrivals.get(load.id) ?? "", load.delivery_end);
    if (onTime == null) continue;
    rows.push({ ...load, onTime });
  }
  return rows;
}

export function revenueByCustomer(): Array<{ customer: string; loads: number; revenue: number }> {
  const sample = showsSampleData() ? "" : " AND loads.is_sample = 0";
  return getDb()
    .prepare(
      `SELECT customers.name AS customer,
              COUNT(*) AS loads,
              IFNULL(SUM(loads.rate), 0) AS revenue
       FROM loads
       JOIN customers ON customers.id = loads.customer_id
       WHERE loads.status != 'cancelled'${sample}
       GROUP BY customers.name
       ORDER BY revenue DESC, customers.name`,
    )
    .all() as Array<{ customer: string; loads: number; revenue: number }>;
}

export function requiredDocumentsForLoad(load: LoadView): Array<{ kind: string; label: string; required: boolean }> {
  const docs = [
    { kind: "rate_con", label: "Rate confirmation", required: true },
    { kind: "invoice", label: "Invoice (customer)", required: false },
    { kind: "carrier_invoice", label: "Bill / carrier invoice", required: false },
    { kind: "bol", label: "BOL", required: false },
    { kind: "pod", label: "POD", required: load.status === "delivered" || load.status === "completed" },
    { kind: "temp_log", label: "Temp log", required: load.reefer_setpoint_f != null },
  ];
  return docs;
}
