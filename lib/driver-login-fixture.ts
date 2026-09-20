import { hashDispatcherPassword } from "./dispatcher-password";
import type { Database } from "./sqlite";

/** Apple Dev / staging driver login. Never inserted unless explicitly opted in. */
export const APPLE_DEV_DRIVER_EMAIL = "demo.driver@msexpress.local";
export const APPLE_DEV_DRIVER_PASSWORD = "Demo1234!";
export const APPLE_DEV_DRIVER_NAME = "Demo Driver";
export const APPLE_DEV_DRIVER_FIXTURE_ENV = "APPLE_DEV_DRIVER_FIXTURE";

/** Allowlist only. Default off. `TMS_SKIP_SEED` must not create this row. */
export function appleDevDriverFixtureEnabled(): boolean {
  const raw = String(process.env.APPLE_DEV_DRIVER_FIXTURE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Inserts or repairs the Apple Dev login row.
 * `getDb()` calls this only when `appleDevDriverFixtureEnabled()` is true.
 * Tests may pass `{ force: true }` to create the row without flipping process env.
 */
export function ensureAppleDevDriverLogin(db: Database, options?: { force?: boolean }): void {
  if (!options?.force && !appleDevDriverFixtureEnabled()) return;
  const now = new Date().toISOString();
  const row = db
    .prepare(`SELECT id, password_hash FROM drivers WHERE LOWER(TRIM(email)) = ?`)
    .get(APPLE_DEV_DRIVER_EMAIL) as { id: number; password_hash: string } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO drivers (
        name, phone, email, license, pin, password_hash, truck_id, status, active, created_at, updated_at
      ) VALUES (?, '', ?, '', '', ?, NULL, 'available', 1, ?, ?)`,
    ).run(APPLE_DEV_DRIVER_NAME, APPLE_DEV_DRIVER_EMAIL, hashDispatcherPassword(APPLE_DEV_DRIVER_PASSWORD), now, now);
    return;
  }
  if (!String(row.password_hash ?? "").trim()) {
    db.prepare(`UPDATE drivers SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
      hashDispatcherPassword(APPLE_DEV_DRIVER_PASSWORD),
      now,
      row.id,
    );
  }
}
