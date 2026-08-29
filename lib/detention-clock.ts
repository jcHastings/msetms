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
 * FCFS: early arrival waits for window start; arrival inside the window starts the clock.
 * APPT: clock starts at the appointment time, not arrival.
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
