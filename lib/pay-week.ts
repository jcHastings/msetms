import { defaultPayPeriod } from "./accounting";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Monday–Sunday week, same bounds as Driver Pay’s default period. */
export function payWeekContaining(input: string | Date): { from: string; to: string } {
  if (input instanceof Date) return defaultPayPeriod(input);
  const raw = String(input ?? "").trim().slice(0, 10);
  if (!DAY.test(raw)) return defaultPayPeriod(new Date());
  return defaultPayPeriod(new Date(`${raw}T12:00:00`));
}

export function normalizePayWeek(input?: string | null, now = new Date()): { from: string; to: string } {
  const raw = String(input ?? "").trim().slice(0, 10);
  if (DAY.test(raw)) return payWeekContaining(raw);
  return defaultPayPeriod(now);
}

export function shiftPayWeek(from: string, deltaWeeks: number): { from: string; to: string } {
  const date = new Date(`${from}T12:00:00`);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return defaultPayPeriod(date);
}

export function inPayWeek(iso: string, from: string, to: string): boolean {
  const day = String(iso ?? "").slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
