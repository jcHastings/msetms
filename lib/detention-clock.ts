import { isAppointmentSchedule, isFcfsSchedule } from "./format";

export const DETENTION_FREE_MS = 2 * 60 * 60 * 1000;

export type DetentionSchedule = "fcfs" | "appointment" | "";

export function asDetentionDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveDetentionSchedule(
  scheduleType?: string | null,
  windowStart?: string | null,
  windowEnd?: string | null,
): DetentionSchedule {
  if (isAppointmentSchedule(scheduleType)) return "appointment";
  if (isFcfsSchedule(scheduleType)) return "fcfs";
  if (String(windowEnd ?? "").trim()) return "fcfs";
  if (String(windowStart ?? "").trim()) return "appointment";
  return "";
}

/**
 * FCFS before window start: clock = windowStart (mark = windowStart + 2h).
 * FCFS during the window: clock = arrivedAt (mark = arrivedAt + 2h).
 * APPT: clock = appointment time, not arrival (mark = appointment + 2h).
 * Exact minutes from the real timestamps. No fixed clock hours.
 */
export function detentionClockStart(input: {
  scheduleType?: string | null;
  arrivedAt?: string | Date | null;
  windowStart?: string | Date | null;
  windowEnd?: string | Date | null;
}): Date | null {
  const schedule = resolveDetentionSchedule(
    input.scheduleType,
    input.windowStart instanceof Date ? input.windowStart.toISOString() : input.windowStart,
    input.windowEnd instanceof Date ? input.windowEnd.toISOString() : input.windowEnd,
  );
  const arrived = asDetentionDate(input.arrivedAt);
  const windowStart = asDetentionDate(input.windowStart);
  if (schedule === "appointment") return windowStart;
  if (schedule !== "fcfs" || !arrived) return null;
  if (windowStart && arrived.getTime() < windowStart.getTime()) return windowStart;
  return arrived;
}

export function detentionTwoHourMark(input: {
  scheduleType?: string | null;
  arrivedAt?: string | Date | null;
  windowStart?: string | Date | null;
  windowEnd?: string | Date | null;
}): Date | null {
  const start = detentionClockStart(input);
  if (!start) return null;
  return new Date(start.getTime() + DETENTION_FREE_MS);
}

function clockLabel(value: Date, timeZone: string): string {
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => bits.find((item) => item.type === type)?.value ?? "";
  const hour = part("hour");
  const minute = part("minute");
  const period = part("dayPeriod").toUpperCase() || "PM";
  if (!hour || !minute) return "";
  return `${hour}:${minute} ${period}`;
}

function dwellLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/** Past tense once the truck has a departed_at. Never "still at". */
export function detentionVisitPhrase(input: {
  role: string;
  arrivedAt?: string | Date | null;
  departedAt?: string | Date | null;
  timeZone?: string;
}): string | null {
  const arrived = asDetentionDate(input.arrivedAt);
  const departed = asDetentionDate(input.departedAt);
  if (!arrived || !departed) return null;
  const minutes = Math.round((departed.getTime() - arrived.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const role = input.role.trim() || "stop";
  const left = clockLabel(departed, input.timeZone || "America/New_York");
  if (!left) return null;
  return `Was at ${role} ${dwellLabel(minutes)} (left ${left})`;
}

export function detentionStillInsideAtMark(input: {
  arrivedAt?: string | Date | null;
  departedAt?: string | Date | null;
  twoHourMark: Date;
  now?: Date;
}): boolean {
  const arrived = asDetentionDate(input.arrivedAt);
  if (!arrived) return false;
  const now = input.now ?? new Date();
  if (now.getTime() < input.twoHourMark.getTime()) return false;
  const departed = asDetentionDate(input.departedAt);
  if (departed && departed.getTime() <= input.twoHourMark.getTime()) return false;
  return true;
}
