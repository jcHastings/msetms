/** Pure "detention starting soon" rules. No database, no mail. */

import { asDetentionDate, detentionClockStart } from "./detention-clock";
import { resolveDetentionFree, type DetentionFreeSource } from "./detention-request";

/** The desk alert shows this long before the notice is due. */
export const DETENTION_NOTICE_ALERT_LEAD_MS = 20 * 60 * 1000;

export const DETENTION_NOTICE_STATUSES = ["sent", "dismissed"] as const;
export type DetentionNoticeStatus = (typeof DETENTION_NOTICE_STATUSES)[number];

export type DetentionNoticeInput = {
  scheduleType?: string | null;
  arrivedAt?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  rateConFreeMinutes?: number | null;
  contractFreeMinutes?: number | null;
  /** Customer notice lead time in minutes. 0 = notify when detention starts. */
  leadMinutes?: number | null;
};

export type DetentionNoticeSchedule = {
  startAt: string;
  dueAt: string;
  alertAt: string;
  freeMinutes: number;
  freeSource: DetentionFreeSource;
  leadMinutes: number;
};

export function normalizeNoticeLead(value: unknown): number {
  const minutes = Math.round(Number(value ?? 0));
  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  return Math.min(minutes, 24 * 60);
}

/**
 * Detention starts at the clock start (arrival, or the appointment when the truck is early)
 * plus free time: rate con, then the customer contract, then 2 hours.
 * Notice is due `leadMinutes` before that. The desk alert opens 20 minutes before the notice is due.
 */
export function detentionNoticeSchedule(input: DetentionNoticeInput): DetentionNoticeSchedule | null {
  const clock = detentionClockStart({
    scheduleType: input.scheduleType,
    arrivedAt: input.arrivedAt,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });
  if (!clock) return null;
  const { freeMinutes, freeSource } = resolveDetentionFree(input.rateConFreeMinutes, input.contractFreeMinutes);
  const leadMinutes = normalizeNoticeLead(input.leadMinutes);
  const start = clock.getTime() + freeMinutes * 60_000;
  const due = start - leadMinutes * 60_000;
  return {
    startAt: new Date(start).toISOString(),
    dueAt: new Date(due).toISOString(),
    alertAt: new Date(due - DETENTION_NOTICE_ALERT_LEAD_MS).toISOString(),
    freeMinutes,
    freeSource,
    leadMinutes,
  };
}

/** Show the desk alert while the truck is still at the stop and no notice was sent or dismissed. */
export function detentionNoticeAlertOpen(input: {
  schedule: DetentionNoticeSchedule | null;
  now: Date;
  loadStatus: string;
  stopKind: string;
  pickupsEnabled: boolean;
  arrivedAt?: string | null;
  departedAt?: string | null;
  emptiedAt?: string | null;
  handled: boolean;
}): boolean {
  if (!input.schedule || input.handled) return false;
  const status = String(input.loadStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "delivered" || status === "invoiced" || status === "paid") return false;
  const kind = String(input.stopKind ?? "").trim().toLowerCase();
  if (kind !== "delivery" && !(kind === "pickup" && input.pickupsEnabled)) return false;
  if (!asDetentionDate(input.arrivedAt)) return false;
  if (asDetentionDate(input.departedAt) || asDetentionDate(input.emptiedAt)) return false;
  const alertAt = Date.parse(input.schedule.alertAt);
  const startAt = Date.parse(input.schedule.startAt);
  const now = input.now.getTime();
  return now >= alertAt && now < startAt;
}

export function noticeClock(iso: string, timeZone: string): string {
  const date = asDetentionDate(iso);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const period = pick("dayPeriod").toUpperCase();
  return `${pick("hour")}:${pick("minute")} ${period} ${pick("timeZoneName")}`.replace(/\s+/g, " ").trim();
}

export type DetentionNoticeEmailInput = {
  loadNumber: string;
  po: string;
  stopName: string;
  city: string;
  state: string;
  startAt: string;
  timeZone: string;
  signature: string;
};

/** Short notice. No dollar amount. */
export function composeDetentionNoticeEmail(input: DetentionNoticeEmailInput): { subject: string; text: string } {
  const loadNumber = input.loadNumber.trim() || "unknown";
  const po = input.po.trim();
  const when = noticeClock(input.startAt, input.timeZone);
  const place = [input.stopName.trim(), [input.city.trim(), input.state.trim()].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const subject = po ? `Detention notice: Load ${loadNumber} / PO ${po}` : `Detention notice: Load ${loadNumber}`;
  const text = [
    `Our truck is still at ${place || "the stop"} on load ${loadNumber}${po ? ` (PO ${po})` : ""}.`,
    `Detention will begin at ${when}.`,
    "",
    "Please let us know if the facility can speed this up.",
    "",
    input.signature,
  ].join("\n");
  return { subject, text };
}
