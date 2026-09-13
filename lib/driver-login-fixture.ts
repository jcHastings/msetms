import { hashDispatcherPassword } from "./dispatcher-password";
import type { Database } from "./sqlite";

/** Apple Dev / staging driver login. Created on migrate so existing office DBs get it. */
export const APPLE_DEV_DRIVER_EMAIL = "demo.driver@msexpress.local";
export const APPLE_DEV_DRIVER_PASSWORD = "Demo1234!";
export const APPLE_DEV_DRIVER_NAME = "Demo Driver";

export function ensureAppleDevDriverLogin(db: Database): void {
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
