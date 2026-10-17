/** Customer contract packets, detention terms, and load reminders. Flags only. */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DETENTION_FREE_MS, detentionClockStart } from "./detention-clock";
import {
  REMINDER_SNOOZE_MS,
  contractSourceLabel,
  detentionNoticeLead,
  isContractSource,
  isRequirementTrigger,
  reminderIsOverdue,
  requirementDueAt,
  resolveDetentionTerms,
  type ContractDetentionInput,
  type ContractSource,
  type DetentionNoticeLead,
  type MappedRequirement,
  type RateConDetentionInput,
  type ReminderStatus,
  type RequirementTrigger,
} from "./customer-contract-shared";
import { getDataDir, getDb } from "./db";
import { sanitizeName } from "./files";

export type CustomerContractFile = {
  id: number;
  customerId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  signedOn: string;
  source: ContractSource;
  sourceLabel: string;
  createdAt: string;
};

export type CustomerDetentionTerms = ContractDetentionInput & {
  customerId: number;
  updatedAt: string;
};

export type CustomerRequirement = MappedRequirement & {
  id: number;
  customerId: number;
};

export type LoadReminder = {
  requirementId: number;
  loadId: number;
  loadNumber: string;
  customerName: string;
  trigger: RequirementTrigger;
  requirement: string;
  quotedClause: string;
  page: string;
  dueAt: string | null;
  waiting: string;
  overdue: boolean;
  status: ReminderStatus;
  snoozeUntil: string;
};

type StopClock = {
  load_id: number;
  kind: string;
  arrived_at: string;
  departed_at: string;
  window_start: string;
  window_end: string;
  schedule_type: string;
};

const EMPTY_TERMS: CustomerDetentionTerms = {
  customerId: 0,
  ratePerHour: null,
  freeHours: null,
  billingIncrementMinutes: null,
  capPerDay: null,
  capPerStop: null,
  noticeLeadMinutes: null,
  conditions: "",
  updatedAt: "",
};

function contractsDir(): string {
  const dir = path.join(getDataDir(), "uploads", "customer-contracts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function customerContractPath(storedName: string): string {
  return path.join(contractsDir(), path.basename(storedName));
}

export function listCustomerContracts(customerId: number): CustomerContractFile[] {
  const rows = getDb()
    .prepare(
      `SELECT id, customer_id, original_name, stored_name, mime_type, signed_on, source, created_at
       FROM customer_contracts WHERE customer_id = ? ORDER BY signed_on DESC, id DESC`,
    )
    .all(customerId) as Array<Record<string, unknown>>;
  return rows.map(asContract);
}

export function getCustomerContract(id: number): CustomerContractFile | null {
  const row = getDb()
    .prepare(
      `SELECT id, customer_id, original_name, stored_name, mime_type, signed_on, source, created_at
       FROM customer_contracts WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? asContract(row) : null;
}

export function addCustomerContract(input: {
  customerId: number;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  signedOn: string;
  source: string;
}): CustomerContractFile {
  if (!isContractSource(input.source)) throw new Error("Pick a contract source.");
  const signedOn = cleanDate(input.signedOn);
  const originalName = path.basename(input.originalName || "contract.pdf");
  if (!/\.pdf$/i.test(originalName) && input.mimeType !== "application/pdf") {
    throw new Error("Upload a PDF.");
  }
  const storedName = `${randomUUID()}-${sanitizeName(originalName.endsWith(".pdf") ? originalName : `${originalName}.pdf`)}`;
  fs.writeFileSync(path.join(contractsDir(), storedName), input.buffer);
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO customer_contracts (
        customer_id, original_name, stored_name, mime_type, signed_on, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.customerId,
      originalName,
      storedName,
      input.mimeType || "application/pdf",
      signedOn,
      input.source,
      createdAt,
    );
  const saved = getCustomerContract(Number(result.lastInsertRowid));
  if (!saved) throw new Error("Contract could not be saved.");
  return saved;
}

export function deleteCustomerContract(id: number): void {
  const existing = getCustomerContract(id);
  if (!existing) return;
  getDb().prepare("DELETE FROM customer_contracts WHERE id = ?").run(id);
  const stored = customerContractPath(existing.storedName);
  if (fs.existsSync(stored)) fs.unlinkSync(stored);
}

export function readCustomerDetentionTerms(customerId: number | null | undefined): CustomerDetentionTerms {
  if (!customerId) return { ...EMPTY_TERMS };
  const row = getDb()
    .prepare("SELECT * FROM customer_detention_terms WHERE customer_id = ?")
    .get(customerId) as Record<string, unknown> | undefined;
  if (!row) return { ...EMPTY_TERMS, customerId };
  return {
    customerId,
    ratePerHour: numberOrNull(row.rate_per_hour),
    freeHours: numberOrNull(row.free_hours),
    billingIncrementMinutes: intOrNull(row.billing_increment_minutes),
    capPerDay: numberOrNull(row.cap_per_day),
    capPerStop: numberOrNull(row.cap_per_stop),
    noticeLeadMinutes: intOrNull(row.notice_lead_minutes),
    conditions: String(row.conditions ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function saveCustomerDetentionTerms(
  customerId: number,
  input: ContractDetentionInput,
): CustomerDetentionTerms {
  if (input.freeHours != null && input.freeHours < 0) throw new Error("Free hours cannot be negative.");
  if (input.noticeLeadMinutes != null && input.noticeLeadMinutes < 0) throw new Error("Notice lead cannot be negative.");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO customer_detention_terms (
        customer_id, rate_per_hour, free_hours, billing_increment_minutes,
        cap_per_day, cap_per_stop, notice_lead_minutes, conditions, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(customer_id) DO UPDATE SET
        rate_per_hour = excluded.rate_per_hour,
        free_hours = excluded.free_hours,
        billing_increment_minutes = excluded.billing_increment_minutes,
        cap_per_day = excluded.cap_per_day,
        cap_per_stop = excluded.cap_per_stop,
        notice_lead_minutes = excluded.notice_lead_minutes,
        conditions = excluded.conditions,
        updated_at = excluded.updated_at`,
    )
    .run(
      customerId,
      input.ratePerHour ?? null,
      input.freeHours ?? null,
      input.billingIncrementMinutes ?? null,
      input.capPerDay ?? null,
      input.capPerStop ?? null,
      input.noticeLeadMinutes ?? null,
      String(input.conditions ?? "").trim(),
      now,
    );
  return readCustomerDetentionTerms(customerId);
}

/** Contract free time in minutes. Null when the contract does not state it. */
export function contractFreeMinutesForCustomer(customerId: number | null | undefined): number | null {
  if (!customerId) return null;
  const hours = readCustomerDetentionTerms(customerId).freeHours;
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}

/** Minutes before detention the contract says to give notice. Missing when the contract is silent. */
export function detentionNoticeLeadForLoad(loadId: number): DetentionNoticeLead {
  const row = getDb().prepare("SELECT customer_id FROM loads WHERE id = ?").get(loadId) as
    | { customer_id?: number }
    | undefined;
  if (!row?.customer_id) return { minutes: null, source: "missing" };
  return detentionNoticeLead(readCustomerDetentionTerms(row.customer_id).noticeLeadMinutes);
}

export function listCustomerRequirements(customerId: number): CustomerRequirement[] {
  const rows = getDb()
    .prepare(
      `SELECT id, customer_id, trigger, deadline_hours, time_of_day, requirement, quoted_clause, page
       FROM customer_requirements WHERE customer_id = ? ORDER BY id`,
    )
    .all(customerId) as Array<Record<string, unknown>>;
  return rows.map(asRequirement);
}

export function saveCustomerRequirement(
  customerId: number,
  input: MappedRequirement & { id?: number | null },
): CustomerRequirement {
  if (!isRequirementTrigger(input.trigger)) throw new Error("Pick a trigger.");
  const requirement = input.requirement.trim();
  if (!requirement) throw new Error("Enter the requirement.");
  if (input.trigger === "daily_time" && !/^(\d{1,2}):(\d{2})$/.test(input.timeOfDay.trim())) {
    throw new Error("Daily time needs a clock time.");
  }
  const now = new Date().toISOString();
  if (input.id) {
    getDb()
      .prepare(
        `UPDATE customer_requirements SET
          trigger = ?, deadline_hours = ?, time_of_day = ?, requirement = ?, quoted_clause = ?, page = ?, updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
      .run(
        input.trigger,
        input.deadlineHours,
        input.trigger === "daily_time" ? input.timeOfDay.trim() : "",
        requirement,
        input.quotedClause.trim(),
        input.page.trim(),
        now,
        input.id,
        customerId,
      );
    const saved = listCustomerRequirements(customerId).find((item) => item.id === input.id);
    if (!saved) throw new Error("Requirement was not found.");
    return saved;
  }
  const result = getDb()
    .prepare(
      `INSERT INTO customer_requirements (
        customer_id, trigger, deadline_hours, time_of_day, requirement, quoted_clause, page, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      customerId,
      input.trigger,
      input.deadlineHours,
      input.trigger === "daily_time" ? input.timeOfDay.trim() : "",
      requirement,
      input.quotedClause.trim(),
      input.page.trim(),
      now,
      now,
    );
  const saved = listCustomerRequirements(customerId).find((item) => item.id === Number(result.lastInsertRowid));
  if (!saved) throw new Error("Requirement could not be saved.");
  return saved;
}

export function deleteCustomerRequirement(customerId: number, id: number): void {
  getDb().prepare("DELETE FROM customer_requirements WHERE id = ? AND customer_id = ?").run(id, customerId);
}

export function findCustomerRequirement(
  customerId: number,
  input: Pick<MappedRequirement, "trigger" | "requirement" | "page">,
): CustomerRequirement | null {
  const row = getDb()
    .prepare(
      `SELECT id, customer_id, trigger, deadline_hours, time_of_day, requirement, quoted_clause, page
       FROM customer_requirements
       WHERE customer_id = ? AND trigger = ? AND requirement = ? AND page = ?`,
    )
    .get(customerId, input.trigger, input.requirement, input.page) as Record<string, unknown> | undefined;
  return row ? asRequirement(row) : null;
}

export function setRequirementReminder(input: {
  loadId: number;
  requirementId: number;
  op: "done" | "snooze" | "reopen";
  now?: string;
}): void {
  const owns = getDb()
    .prepare(
      `SELECT r.id FROM customer_requirements r
       JOIN loads l ON l.customer_id = r.customer_id
       WHERE r.id = ? AND l.id = ?`,
    )
    .get(input.requirementId, input.loadId);
  if (!owns) throw new Error("That requirement is not on this load.");
  const now = input.now || new Date().toISOString();
  const status: ReminderStatus = input.op === "done" ? "done" : input.op === "snooze" ? "snoozed" : "open";
  const snoozeUntil = input.op === "snooze" ? new Date(Date.parse(now) + REMINDER_SNOOZE_MS).toISOString() : "";
  const doneAt = input.op === "done" ? now : "";
  getDb()
    .prepare(
      `INSERT INTO load_requirement_reminders (load_id, requirement_id, status, snooze_until, done_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(load_id, requirement_id) DO UPDATE SET
         status = excluded.status,
         snooze_until = excluded.snooze_until,
         done_at = excluded.done_at,
         updated_at = excluded.updated_at`,
    )
    .run(input.loadId, input.requirementId, status, snoozeUntil, doneAt, now);
}

export function listRemindersForLoad(loadId: number, now = new Date().toISOString()): LoadReminder[] {
  const load = getDb()
    .prepare(
      `SELECT loads.id, loads.load_number, loads.customer_id, loads.pickup_end, loads.delivery_end, customers.name AS customer_name
       FROM loads JOIN customers ON customers.id = loads.customer_id WHERE loads.id = ?`,
    )
    .get(loadId) as LoadRow | undefined;
  if (!load) return [];
  return buildReminders([load], now);
}

export function listDeskReminders(now = new Date().toISOString()): LoadReminder[] {
  const loads = getDb()
    .prepare(
      `SELECT loads.id, loads.load_number, loads.customer_id, loads.pickup_end, loads.delivery_end, customers.name AS customer_name
       FROM loads
       JOIN customers ON customers.id = loads.customer_id
       WHERE loads.status != 'cancelled'
         AND EXISTS (SELECT 1 FROM customer_requirements r WHERE r.customer_id = loads.customer_id)
       ORDER BY loads.pickup_start`,
    )
    .all() as LoadRow[];
  return buildReminders(loads, now).filter((item) => item.status !== "done");
}

type LoadRow = {
  id: number;
  load_number: string;
  customer_id: number;
  pickup_end: string;
  delivery_end: string;
  customer_name: string;
};

function buildReminders(loads: LoadRow[], now: string): LoadReminder[] {
  if (!loads.length) return [];
  const loadIds = loads.map((load) => load.id);
  const customerIds = [...new Set(loads.map((load) => load.customer_id))];
  const requirements = getDb()
    .prepare(
      `SELECT id, customer_id, trigger, deadline_hours, time_of_day, requirement, quoted_clause, page
       FROM customer_requirements WHERE customer_id IN (${customerIds.map(() => "?").join(", ")})
       ORDER BY id`,
    )
    .all(...customerIds) as Array<Record<string, unknown>>;
  const states = getDb()
    .prepare(
      `SELECT load_id, requirement_id, status, snooze_until
       FROM load_requirement_reminders WHERE load_id IN (${loadIds.map(() => "?").join(", ")})`,
    )
    .all(...loadIds) as Array<{ load_id: number; requirement_id: number; status: string; snooze_until: string }>;
  const stateKey = new Map(states.map((row) => [`${row.load_id}:${row.requirement_id}`, row]));
  const stops = getDb()
    .prepare(
      `SELECT load_id, kind, arrived_at, departed_at, window_start, window_end, schedule_type
       FROM load_stops WHERE load_id IN (${loadIds.map(() => "?").join(", ")})
       ORDER BY load_id, sequence, id`,
    )
    .all(...loadIds) as StopClock[];
  const rateCons = getDb()
    .prepare(
      `SELECT load_id, MIN(created_at) AS created_at FROM attachments
       WHERE kind = 'rate_con' AND load_id IN (${loadIds.map(() => "?").join(", ")})
       GROUP BY load_id`,
    )
    .all(...loadIds) as Array<{ load_id: number; created_at: string }>;
  const rateConAt = new Map(rateCons.map((row) => [row.load_id, row.created_at]));
  const stopsByLoad = new Map<number, StopClock[]>();
  for (const stop of stops) {
    const list = stopsByLoad.get(stop.load_id) ?? [];
    list.push(stop);
    stopsByLoad.set(stop.load_id, list);
  }
  const termsByCustomer = new Map<number, CustomerDetentionTerms>();
  const out: LoadReminder[] = [];
  for (const load of loads) {
    const terms = termsByCustomer.get(load.customer_id) ?? readCustomerDetentionTerms(load.customer_id);
    termsByCustomer.set(load.customer_id, terms);
    const rateCon = readRateConTerms(load.id);
    const resolved = resolveDetentionTerms(rateCon, terms);
    const freeMinutes =
      resolved.freeMinutes.source === "missing" ? DETENTION_FREE_MS / 60_000 : Number(resolved.freeMinutes.value);
    const loadStops = stopsByLoad.get(load.id) ?? [];
    const anchors = {
      now,
      pickupAt: anchorTime(loadStops, "pickup", load.pickup_end),
      deliveryAt: anchorTime(loadStops, "delivery", load.delivery_end),
      rateConAt: rateConAt.get(load.id) ?? null,
      detentionStartsAt: earliestDetentionStart(loadStops, freeMinutes),
    };
    for (const row of requirements) {
      if (Number(row.customer_id) !== load.customer_id) continue;
      const requirement = asRequirement(row);
      const due = requirementDueAt(requirement, anchors);
      const state = stateKey.get(`${load.id}:${requirement.id}`);
      const status: ReminderStatus =
        state?.status === "done" || state?.status === "snoozed" ? state.status : "open";
      out.push({
        requirementId: requirement.id,
        loadId: load.id,
        loadNumber: load.load_number,
        customerName: load.customer_name,
        trigger: requirement.trigger,
        requirement: requirement.requirement,
        quotedClause: requirement.quotedClause,
        page: requirement.page,
        dueAt: due.dueAt,
        waiting: due.waiting,
        overdue: reminderIsOverdue({ dueAt: due.dueAt, now, status, snoozeUntil: state?.snooze_until }),
        status,
        snoozeUntil: String(state?.snooze_until ?? ""),
      });
    }
  }
  return out.sort(compareReminders);
}

function compareReminders(a: LoadReminder, b: LoadReminder): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.loadNumber.localeCompare(b.loadNumber) || a.requirementId - b.requirementId;
}

function anchorTime(stops: StopClock[], kind: string, fallback: string): string | null {
  const matching = stops.filter((stop) => stop.kind === kind);
  const departed = latest(matching.map((stop) => stop.departed_at));
  if (departed) return departed;
  const windowEnd = latest(matching.map((stop) => stop.window_end));
  if (windowEnd) return windowEnd;
  const windowStart = latest(matching.map((stop) => stop.window_start));
  if (windowStart) return windowStart;
  return latest([fallback]);
}

function earliestDetentionStart(stops: StopClock[], freeMinutes: number): string | null {
  const starts = stops
    .map((stop) => {
      const clock = detentionClockStart({
        scheduleType: stop.schedule_type,
        arrivedAt: stop.arrived_at,
        windowStart: stop.window_start,
        windowEnd: stop.window_end,
      });
      return clock ? clock.getTime() + freeMinutes * 60_000 : null;
    })
    .filter((value): value is number => value != null);
  if (!starts.length) return null;
  return new Date(Math.min(...starts)).toISOString();
}

function latest(values: Array<string | null | undefined>): string | null {
  let best = Number.NEGATIVE_INFINITY;
  let iso = "";
  for (const value of values) {
    const ms = Date.parse(String(value ?? ""));
    if (!Number.isFinite(ms) || ms < best) continue;
    best = ms;
    iso = new Date(ms).toISOString();
  }
  return iso || null;
}

function asContract(row: Record<string, unknown>): CustomerContractFile {
  const source = String(row.source ?? "other");
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    originalName: String(row.original_name ?? ""),
    storedName: String(row.stored_name ?? ""),
    mimeType: String(row.mime_type ?? "application/pdf"),
    signedOn: String(row.signed_on ?? ""),
    source: isContractSource(source) ? source : "other",
    sourceLabel: contractSourceLabel(source),
    createdAt: String(row.created_at ?? ""),
  };
}

function asRequirement(row: Record<string, unknown>): CustomerRequirement {
  const trigger = String(row.trigger ?? "");
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    trigger: isRequirementTrigger(trigger) ? trigger : "after_delivery",
    deadlineHours: numberOrNull(row.deadline_hours),
    timeOfDay: String(row.time_of_day ?? ""),
    requirement: String(row.requirement ?? ""),
    quotedClause: String(row.quoted_clause ?? ""),
    page: String(row.page ?? ""),
  };
}

function readRateConTerms(loadId: number): RateConDetentionInput {
  const row = getDb()
    .prepare(
      `SELECT detention_rate, detention_free_minutes, detention_cap, detention_round_minutes, detention_clause
       FROM loads WHERE id = ?`,
    )
    .get(loadId) as Record<string, unknown> | undefined;
  if (!row) return {};
  return {
    rate: numberOrNull(row.detention_rate),
    freeMinutes: intOrNull(row.detention_free_minutes),
    cap: numberOrNull(row.detention_cap),
    roundMinutes: intOrNull(row.detention_round_minutes),
    clause: String(row.detention_clause ?? ""),
  };
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

function cleanDate(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Signed date uses YYYY-MM-DD.");
  return raw;
}
