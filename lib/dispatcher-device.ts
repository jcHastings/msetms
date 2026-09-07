import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export const DEVICE_COOKIE = "tms_device";
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_CAP = 10;

type DeviceRow = {
  id: number;
  dispatcher_id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function parseDeviceCookie(raw: string | null | undefined): { dispatcherId: number; token: string } | null {
  const value = String(raw ?? "").trim();
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const dispatcherId = Number.parseInt(value.slice(0, dot), 10);
  const token = value.slice(dot + 1).trim();
  if (!dispatcherId || !token) return null;
  return { dispatcherId, token };
}

export function isRememberDeviceRequested(formData: FormData): boolean {
  const value = String(formData.get("remember_device") ?? "").trim().toLowerCase();
  return value === "1" || value === "on" || value === "true";
}

function hashesMatch(storedHash: string, token: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashDeviceToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function pruneExpiredTrustedDevices(dispatcherId?: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  if (dispatcherId) {
    db.prepare("DELETE FROM dispatcher_trusted_devices WHERE dispatcher_id = ? AND expires_at <= ?").run(
      dispatcherId,
      now,
    );
    return;
  }
  db.prepare("DELETE FROM dispatcher_trusted_devices WHERE expires_at <= ?").run(now);
}

function capTrustedDevices(dispatcherId: number): void {
  const rows = getDb()
    .prepare(
      `SELECT id FROM dispatcher_trusted_devices
       WHERE dispatcher_id = ?
       ORDER BY id DESC`,
    )
    .all(dispatcherId) as Array<{ id: number }>;
  const extra = rows.slice(DEVICE_CAP);
  if (!extra.length) return;
  getDb()
    .prepare(`DELETE FROM dispatcher_trusted_devices WHERE id IN (${extra.map(() => "?").join(",")})`)
    .run(...extra.map((row) => row.id));
}

export function createTrustedDevice(dispatcherId: number): { cookie: string; expiresAt: string } {
  pruneExpiredTrustedDevices(dispatcherId);
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO dispatcher_trusted_devices (dispatcher_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(dispatcherId, hashDeviceToken(token), expiresAt, now.toISOString());
  capTrustedDevices(dispatcherId);
  return { cookie: `${dispatcherId}.${token}`, expiresAt };
}

export function findTrustedDevice(
  raw: string | null | undefined,
  dispatcherId: number,
): DeviceRow | null {
  const parsed = parseDeviceCookie(raw);
  if (!parsed || parsed.dispatcherId !== dispatcherId) return null;
  pruneExpiredTrustedDevices(dispatcherId);
  const rows = getDb()
    .prepare(
      `SELECT * FROM dispatcher_trusted_devices
       WHERE dispatcher_id = ? AND expires_at > ?
       ORDER BY id DESC`,
    )
    .all(dispatcherId, new Date().toISOString()) as DeviceRow[];
  return rows.find((row) => hashesMatch(row.token_hash, parsed.token)) ?? null;
}

export function touchTrustedDevice(id: number): string {
  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS).toISOString();
  getDb().prepare("UPDATE dispatcher_trusted_devices SET expires_at = ? WHERE id = ?").run(expiresAt, id);
  return expiresAt;
}

export function rememberTrustedDevice(dispatcherId: number, existingCookie?: string | null): string {
  const existing = findTrustedDevice(existingCookie, dispatcherId);
  if (existing && existingCookie) {
    touchTrustedDevice(existing.id);
    return existingCookie.trim();
  }
  return createTrustedDevice(dispatcherId).cookie;
}

export function revokeTrustedDevices(dispatcherId: number): void {
  getDb().prepare("DELETE FROM dispatcher_trusted_devices WHERE dispatcher_id = ?").run(dispatcherId);
}

export function countTrustedDevices(dispatcherId: number): number {
  pruneExpiredTrustedDevices(dispatcherId);
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM dispatcher_trusted_devices WHERE dispatcher_id = ?")
    .get(dispatcherId) as { n: number };
  return Number(row.n);
}
