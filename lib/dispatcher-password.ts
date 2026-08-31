import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import {
  DISPATCHER_PASSWORD_HINT,
  dispatcherPasswordError,
  isQualifyingDispatcherPassword,
} from "./dispatcher-password-shared";
import { revokeTrustedDevices } from "./dispatcher-device";
import { isUsableEmail, normalizeEmail } from "./mail-shared";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_SMS_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_SMS_RESEND_MS = 45 * 1000;
export const PASSWORD_SMS_MAX_ATTEMPTS = 5;
export const PASSWORD_SMS_DIGITS = 6;

export const PASSWORD_UNSET =
  "Ask an Administrator to set a temporary password on Users. Forgot password only works if this user has an email.";
export const PASSWORD_NOT_RECOGNIZED = "Dispatcher or password is not recognized.";
export const PASSWORD_REUSED = "That password was used before. Choose a new password.";
export const PASSWORD_RESET_INVALID = "That reset link is not valid or expired.";
export const PASSWORD_SMS_NO_PHONE = "Add a phone number on this user before you can change the password.";
export const PASSWORD_SMS_INVALID = "That text code is not valid.";
export const PASSWORD_SMS_EXPIRED = "That text code expired. Send a new one.";
export const PASSWORD_SMS_RESEND_WAIT = "Wait before sending another code.";
export const PASSWORD_FORGOT_SENT = "If that email is on a user, we sent a reset link.";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

type AuthRow = {
  id: number;
  active: number;
  password_hash: string;
  email: string;
  phone: string;
};

type ResetRow = {
  id: number;
  dispatcher_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string;
};

type SmsRow = {
  id: number;
  dispatcher_id: number;
  code_hash: string;
  expires_at: string;
  sent_at: string;
  attempts: number;
  used_at: string;
};

export function hashDispatcherPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function passwordHashMatches(password: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 6) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  try {
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (!salt.length || !expected.length) return false;
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function getDispatcherAuth(id: number): AuthRow | null {
  return (
    (getDb()
      .prepare("SELECT id, active, password_hash, email, phone FROM dispatchers WHERE id = ?")
      .get(id) as AuthRow | undefined) ?? null
  );
}

export function findActiveDispatcherByEmail(email: string): AuthRow | null {
  const normalized = normalizeEmail(email);
  if (!isUsableEmail(normalized)) return null;
  return (
    (getDb()
      .prepare(
        `SELECT id, active, password_hash, email, phone FROM dispatchers
         WHERE active = 1 AND lower(trim(email)) = lower(?)
         LIMIT 1`,
      )
      .get(normalized) as AuthRow | undefined) ?? null
  );
}

export function dispatcherHasPassword(id: number): boolean {
  const row = getDispatcherAuth(id);
  return Boolean(row?.password_hash);
}

export function verifyDispatcherPassword(id: number, password: string): boolean {
  const row = getDispatcherAuth(id);
  if (!row?.active || !row.password_hash) return false;
  return passwordHashMatches(password, row.password_hash);
}

export function passwordWasUsed(dispatcherId: number, password: string): boolean {
  const current = getDispatcherAuth(dispatcherId)?.password_hash ?? "";
  if (current && passwordHashMatches(password, current)) return true;
  const history = getDb()
    .prepare("SELECT password_hash FROM dispatcher_password_history WHERE dispatcher_id = ?")
    .all(dispatcherId) as Array<{ password_hash: string }>;
  return history.some((row) => passwordHashMatches(password, row.password_hash));
}

export function setDispatcherPassword(
  dispatcherId: number,
  password: string,
  opts?: { requireChange?: boolean },
): void {
  const policy = dispatcherPasswordError(password);
  if (policy) throw new Error(policy);
  if (!isQualifyingDispatcherPassword(password)) throw new Error(DISPATCHER_PASSWORD_HINT);
  if (passwordWasUsed(dispatcherId, password)) throw new Error(PASSWORD_REUSED);
  const db = getDb();
  const current = getDispatcherAuth(dispatcherId);
  if (!current) throw new Error("User was not found.");
  if (current.password_hash) {
    db.prepare(
      `INSERT INTO dispatcher_password_history (dispatcher_id, password_hash, created_at)
       VALUES (?, ?, ?)`,
    ).run(dispatcherId, current.password_hash, new Date().toISOString());
  }
  db.prepare("UPDATE dispatchers SET password_hash = ?, must_change_password = ? WHERE id = ?").run(
    hashDispatcherPassword(password),
    opts?.requireChange ? 1 : 0,
    dispatcherId,
  );
  revokeTrustedDevices(dispatcherId);
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function createPasswordResetToken(dispatcherId: number): string {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE dispatcher_password_reset SET used_at = ? WHERE dispatcher_id = ? AND used_at = ''").run(
    now,
    dispatcherId,
  );
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO dispatcher_password_reset (dispatcher_id, token_hash, expires_at, used_at)
     VALUES (?, ?, ?, '')`,
  ).run(dispatcherId, hashResetToken(token), new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString());
  return token;
}

export function resetPasswordWithToken(token: string, password: string): void {
  const raw = token.trim();
  if (!raw) throw new Error(PASSWORD_RESET_INVALID);
  const row =
    (getDb()
      .prepare("SELECT * FROM dispatcher_password_reset WHERE token_hash = ? AND used_at = ''")
      .get(hashResetToken(raw)) as ResetRow | undefined) ?? null;
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    throw new Error(PASSWORD_RESET_INVALID);
  }
  setDispatcherPassword(row.dispatcher_id, password);
  getDb()
    .prepare("UPDATE dispatcher_password_reset SET used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);
}

function officePhone(): string {
  const row = getDb().prepare("SELECT dispatcher_phone FROM company_profile WHERE id = 1").get() as
    | { dispatcher_phone?: string }
    | undefined;
  return row?.dispatcher_phone?.trim() || "402-302-0097";
}

export function composePasswordResetEmail(input: { resetUrl: string; officePhone?: string }): {
  subject: string;
  text: string;
} {
  const phone = input.officePhone?.trim() || officePhone();
  return {
    subject: "Reset your MS Express TMS password",
    text: [
      "Use this link to set a new MS Express TMS password:",
      "",
      input.resetUrl,
      "",
      "This link expires in 1 hour. If you did not ask to reset your password, ignore this email.",
      "",
      `Do not reply. This mailbox is not monitored. Call the office at ${phone} if you need further assistance.`,
    ].join("\n"),
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "their phone";
  return `•••-•••-${digits.slice(-4)}`;
}

function hashSmsOtp(dispatcherId: number, code: string): string {
  return createHash("sha256").update(`${dispatcherId}:${normalizeSmsOtp(code)}`).digest("hex");
}

export function normalizeSmsOtp(code: string): string {
  return code.replace(/\s+/g, "").trim();
}

export function generatePasswordSmsCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(PASSWORD_SMS_DIGITS, "0");
}

function activeSms(dispatcherId: number): SmsRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM dispatcher_password_sms
         WHERE dispatcher_id = ? AND used_at = ''
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(dispatcherId) as SmsRow | undefined) ?? null
  );
}

export function secondsUntilPasswordSmsResend(dispatcherId: number): number {
  const row = activeSms(dispatcherId);
  if (!row) return 0;
  const wait = PASSWORD_SMS_RESEND_MS - (Date.now() - Date.parse(row.sent_at));
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export function issuePasswordSmsOtp(
  dispatcherId: number,
  opts?: { resend?: boolean },
): { code: string; phone: string } {
  const user = getDispatcherAuth(dispatcherId);
  if (!user?.active) throw new Error(PASSWORD_NOT_RECOGNIZED);
  const phone = user.phone.trim();
  if (!phone) throw new Error(PASSWORD_SMS_NO_PHONE);
  if (opts?.resend && secondsUntilPasswordSmsResend(dispatcherId) > 0) {
    throw new Error(PASSWORD_SMS_RESEND_WAIT);
  }
  const db = getDb();
  db.prepare("UPDATE dispatcher_password_sms SET used_at = ? WHERE dispatcher_id = ? AND used_at = ''").run(
    new Date().toISOString(),
    dispatcherId,
  );
  const code = generatePasswordSmsCode();
  const now = new Date();
  db.prepare(
    `INSERT INTO dispatcher_password_sms (dispatcher_id, code_hash, expires_at, sent_at, attempts, used_at)
     VALUES (?, ?, ?, ?, 0, '')`,
  ).run(
    dispatcherId,
    hashSmsOtp(dispatcherId, code),
    new Date(now.getTime() + PASSWORD_SMS_TTL_MS).toISOString(),
    now.toISOString(),
  );
  return { code, phone };
}

function smsHashesMatch(storedHash: string, dispatcherId: number, code: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashSmsOtp(dispatcherId, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyPasswordSmsOtp(dispatcherId: number, code: string): void {
  const token = normalizeSmsOtp(code);
  const row = activeSms(dispatcherId);
  if (!row) throw new Error(PASSWORD_SMS_EXPIRED);
  if (Date.parse(row.expires_at) <= Date.now()) {
    getDb().prepare("UPDATE dispatcher_password_sms SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    throw new Error(PASSWORD_SMS_EXPIRED);
  }
  if (!/^\d{6}$/.test(token) || !smsHashesMatch(row.code_hash, dispatcherId, token)) {
    const attempts = row.attempts + 1;
    if (attempts >= PASSWORD_SMS_MAX_ATTEMPTS) {
      getDb()
        .prepare("UPDATE dispatcher_password_sms SET attempts = ?, used_at = ? WHERE id = ?")
        .run(attempts, new Date().toISOString(), row.id);
      throw new Error(PASSWORD_SMS_EXPIRED);
    }
    getDb().prepare("UPDATE dispatcher_password_sms SET attempts = ? WHERE id = ?").run(attempts, row.id);
    throw new Error(PASSWORD_SMS_INVALID);
  }
  getDb().prepare("UPDATE dispatcher_password_sms SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
}

export function composePasswordChangeSms(input: { code: string; officePhone?: string }): string {
  const phone = input.officePhone?.trim() || officePhone();
  return `Your MS Express TMS password-change code is ${input.code}. It expires in 10 minutes. Call the office at ${phone} if you did not ask for this.`;
}
