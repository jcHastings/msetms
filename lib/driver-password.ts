import { getDb } from "./db";
import { dispatcherPasswordError } from "./dispatcher-password-shared";
import { hashDispatcherPassword, passwordHashMatches } from "./dispatcher-password";
import { isUsableEmail, normalizeEmail } from "./mail-shared";

export const DRIVER_PASSWORD_NOT_RECOGNIZED = "Driver or password is not recognized.";

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeDriverLoginEmail(value: string | null | undefined): string {
  return normalizeEmail(value).toLowerCase();
}

export function findDriverIdByLoginEmail(email: string): number | null {
  const normalized = normalizeDriverLoginEmail(email);
  if (!normalized) return null;
  const row = getDb()
    .prepare(`SELECT id FROM drivers WHERE LOWER(TRIM(email)) = ?`)
    .get(normalized) as { id: number } | undefined;
  return row?.id ?? null;
}

export function assertUniqueDriverEmail(email: string, excludeId?: number): void {
  const normalized = normalizeDriverLoginEmail(email);
  if (!normalized) return;
  const existing = findDriverIdByLoginEmail(normalized);
  if (existing && existing !== excludeId) {
    throw new Error("That email is already on another driver.");
  }
}

export function hasDriverPassword(driverId: number): boolean {
  const row = getDb()
    .prepare(`SELECT password_hash FROM drivers WHERE id = ?`)
    .get(driverId) as { password_hash?: string } | undefined;
  return Boolean(String(row?.password_hash ?? "").trim());
}

export function setDriverPassword(driverId: number, password: string): void {
  const error = dispatcherPasswordError(password);
  if (error) throw new Error(error);
  const row = getDb()
    .prepare(`SELECT email FROM drivers WHERE id = ?`)
    .get(driverId) as { email?: string } | undefined;
  if (!row) throw new Error("Driver not found.");
  if (!isUsableEmail(row.email)) {
    throw new Error("Add an email before setting a driver login password.");
  }
  getDb()
    .prepare(`UPDATE drivers SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hashDispatcherPassword(password), nowIso(), driverId);
}

export function verifyDriverPassword(driverId: number, password: string): boolean {
  const row = getDb()
    .prepare(`SELECT password_hash FROM drivers WHERE id = ?`)
    .get(driverId) as { password_hash?: string } | undefined;
  return passwordHashMatches(password, String(row?.password_hash ?? ""));
}

export function parseDriverLoginPassword(value: unknown, required: boolean): string {
  const password = String(value ?? "");
  if (!password.trim()) {
    if (required) throw new Error("Enter a password.");
    return "";
  }
  const error = dispatcherPasswordError(password);
  if (error) throw new Error(error);
  return password;
}
