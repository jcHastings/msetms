/**
 * Customer contract detention fallback and requirement due times.
 * Pure: no database, no mail, no file writes.
 *
 * Detention values resolve in this order: rate confirmation, then the
 * customer contract, then "Missing, enter from rate con".
 *
 * `detentionNoticeLead` is the hook a later "detention starting soon" alert
 * should call. This module does not send anything.
 */

import { aliasCustomerId } from "./customer-name";

export const DETENTION_TERMS_MISSING = "Missing, enter from rate con";

export const CONTRACT_SOURCES = [
  { value: "highway", label: "Highway" },
  { value: "mycarrierpackets", label: "MyCarrierPackets" },
  { value: "rmis", label: "RMIS" },
  { value: "assure", label: "Assure" },
  { value: "other", label: "Other" },
] as const;

export type ContractSource = (typeof CONTRACT_SOURCES)[number]["value"];

export const REQUIREMENT_TRIGGERS = [
  "after_pickup",
  "after_delivery",
  "daily_time",
  "before_detention",
  "on_ratecon",
  "invoice_cutoff",
] as const;

export type RequirementTrigger = (typeof REQUIREMENT_TRIGGERS)[number];

export const REMINDER_SNOOZE_MS = 4 * 60 * 60 * 1000;

export type DetentionValueSource = "rate_con" | "contract" | "missing";

export type SourcedValue<T> = {
  value: T | null;
  source: DetentionValueSource;
};

export type RateConDetentionInput = {
  rate?: number | null;
  freeMinutes?: number | null;
  cap?: number | null;
  roundMinutes?: number | null;
  clause?: string | null;
};

export type ContractDetentionInput = {
  ratePerHour?: number | null;
  freeHours?: number | null;
  billingIncrementMinutes?: number | null;
  capPerDay?: number | null;
  capPerStop?: number | null;
  noticeLeadMinutes?: number | null;
  conditions?: string | null;
};

export type ResolvedDetentionTerms = {
  rate: SourcedValue<number>;
  freeMinutes: SourcedValue<number>;
  billingIncrementMinutes: SourcedValue<number>;
  capPerDay: SourcedValue<number>;
  capPerStop: SourcedValue<number>;
  noticeLeadMinutes: SourcedValue<number>;
  conditions: SourcedValue<string>;
};

export type DetentionTermLine = {
  key: string;
  label: string;
  text: string;
  source: DetentionValueSource;
  sourceLabel: string;
};

export type DetentionNoticeLead = {
  minutes: number | null;
  source: "contract" | "missing";
};

export type RequirementClock = {
  trigger: RequirementTrigger;
  deadlineHours: number | null;
  timeOfDay: string;
};

export type ReminderAnchors = {
  now: string;
  timeZone?: string;
  pickupAt?: string | null;
  deliveryAt?: string | null;
  rateConAt?: string | null;
  detentionStartsAt?: string | null;
};

export type ReminderDue = {
  dueAt: string | null;
  waiting: string;
};

export type ReminderStatus = "open" | "done" | "snoozed";

const TRIGGER_LABELS: Record<RequirementTrigger, string> = {
  after_pickup: "After pickup",
  after_delivery: "After delivery",
  daily_time: "Daily time",
  before_detention: "Before detention",
  on_ratecon: "When the rate confirmation is on the load",
  invoice_cutoff: "Invoice cutoff",
};

export function isContractSource(value: string): value is ContractSource {
  return CONTRACT_SOURCES.some((item) => item.value === value);
}

export function contractSourceLabel(value: string): string {
  return CONTRACT_SOURCES.find((item) => item.value === value)?.label ?? "Other";
}

export function isRequirementTrigger(value: string): value is RequirementTrigger {
  return (REQUIREMENT_TRIGGERS as readonly string[]).includes(value);
}

export function requirementTriggerLabel(trigger: RequirementTrigger): string {
  return TRIGGER_LABELS[trigger];
}

export function detentionSourceLabel(source: DetentionValueSource): string {
  if (source === "rate_con") return "Rate confirmation";
  if (source === "contract") return "Contract";
  return DETENTION_TERMS_MISSING;
}

/** Notice lead the contract states, in minutes. Null when the contract is silent. */
export function detentionNoticeLead(minutes: number | null | undefined): DetentionNoticeLead {
  if (minutes == null || !Number.isFinite(Number(minutes)) || Number(minutes) < 0) {
    return { minutes: null, source: "missing" };
  }
  return { minutes: Math.round(Number(minutes)), source: "contract" };
}

function finite(value: number | null | undefined): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value: number | null | undefined): number | null {
  const number = finite(value);
  if (number == null || number <= 0) return null;
  return number;
}

function nonNegative(value: number | null | undefined): number | null {
  const number = finite(value);
  if (number == null || number < 0) return null;
  return number;
}

function text(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pickNumber(
  rateCon: number | null,
  contract: number | null,
): SourcedValue<number> {
  if (rateCon != null) return { value: rateCon, source: "rate_con" };
  if (contract != null) return { value: contract, source: "contract" };
  return { value: null, source: "missing" };
}

function pickText(rateCon: string, contract: string): SourcedValue<string> {
  if (rateCon) return { value: rateCon, source: "rate_con" };
  if (contract) return { value: contract, source: "contract" };
  return { value: null, source: "missing" };
}

export function resolveDetentionTerms(
  rateCon: RateConDetentionInput | null | undefined,
  contract: ContractDetentionInput | null | undefined,
): ResolvedDetentionTerms {
  const rate = pickNumber(positive(rateCon?.rate), positive(contract?.ratePerHour));
  const freeMinutes = pickNumber(
    nonNegative(rateCon?.freeMinutes) == null ? null : Math.round(Number(rateCon?.freeMinutes)),
    nonNegative(contract?.freeHours) == null ? null : Math.round(Number(contract?.freeHours) * 60),
  );
  const billingIncrementMinutes = pickNumber(
    positive(rateCon?.roundMinutes) == null ? null : Math.round(Number(rateCon?.roundMinutes)),
    positive(contract?.billingIncrementMinutes) == null
      ? null
      : Math.round(Number(contract?.billingIncrementMinutes)),
  );
  const capPerStop = pickNumber(positive(rateCon?.cap), positive(contract?.capPerStop));
  const capPerDay = pickNumber(null, positive(contract?.capPerDay));
  const notice = detentionNoticeLead(contract?.noticeLeadMinutes);
  return {
    rate,
    freeMinutes,
    billingIncrementMinutes,
    capPerDay,
    capPerStop,
    noticeLeadMinutes:
      notice.source === "contract"
        ? { value: notice.minutes, source: "contract" }
        : { value: null, source: "missing" },
    conditions: pickText(text(rateCon?.clause), text(contract?.conditions)),
  };
}

/** Cap applied to one detention amount. The stop cap wins; a day cap is the fallback. */
export function detentionAmountCap(resolved: ResolvedDetentionTerms): number | null {
  if (resolved.capPerStop.source !== "missing") return resolved.capPerStop.value;
  if (resolved.capPerDay.source !== "missing") return resolved.capPerDay.value;
  return null;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function hoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  const shown = Number.isInteger(hours) ? String(hours) : String(hours);
  return hours === 1 ? "1 hour" : `${shown} hours`;
}

function minutesLabel(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function line(
  key: string,
  label: string,
  sourced: SourcedValue<number | string>,
  format: (value: number | string) => string,
): DetentionTermLine {
  if (sourced.source === "missing" || sourced.value == null) {
    return { key, label, text: DETENTION_TERMS_MISSING, source: "missing", sourceLabel: "" };
  }
  return {
    key,
    label,
    text: format(sourced.value),
    source: sourced.source,
    sourceLabel: detentionSourceLabel(sourced.source),
  };
}

export function detentionTermLines(resolved: ResolvedDetentionTerms): DetentionTermLine[] {
  return [
    line("rate", "Rate per hour", resolved.rate, (value) => `${money(Number(value))} per hour`),
    line("free", "Free time", resolved.freeMinutes, (value) => hoursLabel(Number(value))),
    line("increment", "Billing increment", resolved.billingIncrementMinutes, (value) => minutesLabel(Number(value))),
    line("cap_stop", "Cap per stop", resolved.capPerStop, (value) => money(Number(value))),
    line("cap_day", "Cap per day", resolved.capPerDay, (value) => money(Number(value))),
    line("notice", "Notice lead", resolved.noticeLeadMinutes, (value) => minutesLabel(Number(value))),
    line("conditions", "Conditions", resolved.conditions, (value) => String(value)),
  ];
}

function addHours(iso: string | null | undefined, hours: number): string | null {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms) || !Number.isFinite(hours)) return null;
  return new Date(ms + hours * 60 * 60 * 1000).toISOString();
}

function calendarParts(ms: number, timeZone: string): { year: number; month: number; day: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
  } catch {
    return null;
  }
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "NaN");
  const year = num("year");
  const month = num("month");
  const day = num("day");
  if (![year, month, day].every((value) => Number.isFinite(value))) return null;
  return { year, month, day };
}

function zoneOffsetMs(instantMs: number, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instantMs));
  } catch {
    return null;
  }
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "NaN");
  const year = num("year");
  const month = num("month");
  const day = num("day");
  let hour = num("hour");
  const minute = num("minute");
  const second = num("second");
  if (![year, month, day, hour, minute, second].every((value) => Number.isFinite(value))) return null;
  if (hour === 24) hour = 0;
  return Date.UTC(year, month - 1, day, hour, minute, second) - instantMs;
}

function wallTimeMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = zoneOffsetMs(guess, timeZone);
  if (first == null) return null;
  const second = zoneOffsetMs(guess - first, timeZone);
  if (second == null) return null;
  return guess - second;
}

function dailyDue(nowIso: string, timeOfDay: string, timeZone: string): string | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const date = calendarParts(now, timeZone);
  if (!date) return null;
  const ms = wallTimeMs(date.year, date.month, date.day, hour, minute, timeZone);
  return ms == null ? null : new Date(ms).toISOString();
}

export function requirementDueAt(clock: RequirementClock, anchors: ReminderAnchors): ReminderDue {
  const hours = clock.deadlineHours == null || !Number.isFinite(clock.deadlineHours) ? null : clock.deadlineHours;
  const zone = anchors.timeZone || "America/Chicago";
  if (clock.trigger === "after_pickup") {
    if (!anchors.pickupAt) return { dueAt: null, waiting: "Waiting on pickup" };
    return { dueAt: addHours(anchors.pickupAt, hours ?? 0), waiting: "" };
  }
  if (clock.trigger === "after_delivery") {
    if (!anchors.deliveryAt) return { dueAt: null, waiting: "Waiting on delivery" };
    return { dueAt: addHours(anchors.deliveryAt, hours ?? 0), waiting: "" };
  }
  if (clock.trigger === "daily_time") {
    const dueAt = dailyDue(anchors.now, clock.timeOfDay, zone);
    if (!dueAt) return { dueAt: null, waiting: "Daily time needs a clock time" };
    return { dueAt, waiting: "" };
  }
  if (clock.trigger === "before_detention") {
    if (!anchors.detentionStartsAt) return { dueAt: null, waiting: "Waiting on the detention clock" };
    const lead = hours == null ? 0 : Math.abs(hours);
    return { dueAt: addHours(anchors.detentionStartsAt, -lead), waiting: "" };
  }
  if (clock.trigger === "on_ratecon") {
    if (!anchors.rateConAt) return { dueAt: null, waiting: "Waiting on the rate confirmation" };
    return { dueAt: addHours(anchors.rateConAt, hours ?? 0), waiting: "" };
  }
  if (!anchors.deliveryAt) return { dueAt: null, waiting: "Waiting on delivery" };
  if (hours == null) return { dueAt: null, waiting: "No invoice cutoff hours on the requirement" };
  return { dueAt: addHours(anchors.deliveryAt, hours), waiting: "" };
}

export function reminderIsOverdue(input: {
  dueAt: string | null;
  now: string;
  status: ReminderStatus;
  snoozeUntil?: string | null;
}): boolean {
  if (input.status === "done") return false;
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) return false;
  if (input.status === "snoozed") {
    const until = Date.parse(String(input.snoozeUntil ?? ""));
    if (Number.isFinite(until) && now <= until) return false;
  }
  const due = Date.parse(String(input.dueAt ?? ""));
  if (!Number.isFinite(due)) return false;
  return now > due;
}

export function customerSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CustomerName = { id: number; name: string };

export function matchCustomerByName(
  label: string,
  customers: CustomerName[],
  aliases: Array<{ customerId: number; name: string; normalized: string }> = [],
): CustomerName | null {
  const aliasId = aliasCustomerId(label, aliases);
  if (aliasId != null) {
    return customers.find((customer) => customer.id === aliasId) ?? { id: aliasId, name: label.trim() };
  }
  const needle = label.trim().toLowerCase();
  const slug = customerSlug(label);
  if (!needle && !slug) return null;
  const exact = customers.filter((customer) => customer.name.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const bySlug = customers.filter((customer) => customerSlug(customer.name) === slug || customerSlug(customer.name) === needle);
  if (bySlug.length === 1) return bySlug[0];
  return null;
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

export function csvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  const header = rows[0]?.map((item) => item.trim()) ?? [];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (!key) return;
      record[key] = String(row[index] ?? "").trim();
    });
    return record;
  });
}

const REQUIREMENT_HEADER = [
  "customer_slug",
  "type",
  "trigger",
  "deadline_hours",
  "what_to_send",
  "where",
  "page",
  "clause_quote",
  "confidence",
];

const TERMS_HEADER = [
  "customer_name",
  "rate_per_hour",
  "free_hours",
  "billing_increment_minutes",
  "cap_per_day",
  "cap_per_stop",
  "notice_lead_minutes",
  "conditions",
  "signed_on",
  "source",
  "pdf_file",
];

export function missingCsvHeaders(text: string, required: readonly string[]): string[] {
  const header = new Set((parseCsv(text)[0] ?? []).map((item) => item.trim()));
  return required.filter((key) => !header.has(key));
}

export function requirementCsvHeaders(): readonly string[] {
  return REQUIREMENT_HEADER;
}

export function termsCsvHeaders(): readonly string[] {
  return TERMS_HEADER;
}

const TRIGGER_ALIASES: Record<string, RequirementTrigger> = {
  after_pickup: "after_pickup",
  at_pickup: "after_pickup",
  on_pickup: "after_pickup",
  on_pickup_depart: "after_pickup",
  after_delivery: "after_delivery",
  at_delivery: "after_delivery",
  on_delivery: "after_delivery",
  daily_time: "daily_time",
  before_detention: "before_detention",
  on_ratecon: "on_ratecon",
  on_rate_con: "on_ratecon",
  on_dispatch: "on_ratecon",
  invoice_cutoff: "invoice_cutoff",
  on_invoice: "invoice_cutoff",
};

export type MappedRequirement = {
  trigger: RequirementTrigger;
  deadlineHours: number | null;
  timeOfDay: string;
  requirement: string;
  quotedClause: string;
  page: string;
};

export function mapRequirementRow(row: Record<string, string>): { ok: true; value: MappedRequirement } | { ok: false; reason: string } {
  const rawTrigger = String(row.trigger ?? "").trim().toLowerCase();
  const type = String(row.type ?? "").trim().toLowerCase();
  const deadline = parseOptionalNumber(row.deadline_hours);
  if (String(row.deadline_hours ?? "").trim() && deadline == null) {
    return { ok: false, reason: "deadline_hours is not a number" };
  }
  let trigger = TRIGGER_ALIASES[rawTrigger];
  let deadlineHours = deadline;
  if (!trigger && rawTrigger === "other" && type === "detention_notice" && deadline != null && deadline < 0) {
    trigger = "before_detention";
    deadlineHours = Math.abs(deadline);
  }
  if (!trigger) return { ok: false, reason: `trigger ${rawTrigger || "(blank)"} is not mapped` };
  const timeOfDay = String(row.time_of_day ?? "").trim();
  if (trigger === "daily_time" && !/^(\d{1,2}):(\d{2})$/.test(timeOfDay)) {
    return { ok: false, reason: "daily_time needs time_of_day" };
  }
  const what = String(row.what_to_send ?? "").trim();
  if (!what) return { ok: false, reason: "what_to_send is blank" };
  const where = String(row.where ?? "").trim();
  return {
    ok: true,
    value: {
      trigger,
      deadlineHours: trigger === "daily_time" ? null : deadlineHours,
      timeOfDay: trigger === "daily_time" ? timeOfDay : "",
      requirement: where ? `${what} Where: ${where}` : what,
      quotedClause: String(row.clause_quote ?? "").trim(),
      page: String(row.page ?? "").trim(),
    },
  };
}

export function parseOptionalNumber(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : null;
}
