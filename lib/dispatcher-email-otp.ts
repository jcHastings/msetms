import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { isUsableEmail, normalizeEmail } from "./mail-shared";
import { getCompanySettings, getDispatcherUser } from "./settings";

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_RESEND_MS = 45 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_DIGITS = 6;

export const EMAIL_OTP_NO_EMAIL = "Add an email on this user before they can sign in.";
export const EMAIL_OTP_INVALID = "That sign-in code is not valid.";
export const EMAIL_OTP_EXPIRED = "That sign-in code expired. Sign in again.";
export const EMAIL_OTP_RESEND_WAIT = "Wait before sending another code.";

type OtpRow = {
  id: number;
  dispatcher_id: number;
  code_hash: string;
  expires_at: string;
  sent_at: string;
  attempts: number;
  used_at: string;
};

export function hashEmailOtp(dispatcherId: number, code: string): string {
  return createHash("sha256").update(`${dispatcherId}:${normalizeEmailOtp(code)}`).digest("hex");
}

export function normalizeEmailOtp(code: string): string {
  return code.replace(/\s+/g, "").trim();
}

export function generateEmailOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(EMAIL_OTP_DIGITS, "0");
}

export function maskEmail(email: string): string {
  const trimmed = normalizeEmail(email);
  const at = trimmed.indexOf("@");
  if (at < 1) return "their email";
  return `${trimmed.slice(0, 1)}••@${trimmed.slice(at + 1)}`;
}

export function composeSignInCodeEmail(input: { code: string; officePhone?: string }): {
  subject: string;
  text: string;
} {
  const phone = input.officePhone?.trim() || getCompanySettings().dispatcher_phone || "402-302-0097";
  return {
    subject: "Your MS Express TMS sign-in code",
    text: [
      `Your MS Express TMS sign-in code is ${input.code}.`,
      "",
      "This code expires in 10 minutes. If you did not try to sign in, ignore this email.",
      "",
      `Do not reply. This mailbox is not monitored. Call the office at ${phone} if you need further assistance.`,
    ].join("\n"),
  };
}

function activeOtp(dispatcherId: number): OtpRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM dispatcher_email_otp
         WHERE dispatcher_id = ? AND used_at = ''
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(dispatcherId) as OtpRow | undefined) ?? null
  );
}

export function secondsUntilEmailOtpResend(dispatcherId: number): number {
  const row = activeOtp(dispatcherId);
  if (!row) return 0;
  const wait = EMAIL_OTP_RESEND_MS - (Date.now() - Date.parse(row.sent_at));
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export function issueEmailOtp(dispatcherId: number, opts?: { resend?: boolean }): { code: string; email: string } {
  const user = getDispatcherUser(dispatcherId);
  if (!user?.active) throw new Error("Dispatcher or PIN is not recognized.");
  const email = normalizeEmail(user.email);
  if (!isUsableEmail(email)) throw new Error(EMAIL_OTP_NO_EMAIL);
  if (opts?.resend && secondsUntilEmailOtpResend(dispatcherId) > 0) {
    throw new Error(EMAIL_OTP_RESEND_WAIT);
  }
  const db = getDb();
  db.prepare("UPDATE dispatcher_email_otp SET used_at = ? WHERE dispatcher_id = ? AND used_at = ''").run(
    new Date().toISOString(),
    dispatcherId,
  );
  const code = generateEmailOtpCode();
  const now = new Date();
  db.prepare(
    `INSERT INTO dispatcher_email_otp (dispatcher_id, code_hash, expires_at, sent_at, attempts, used_at)
     VALUES (?, ?, ?, ?, 0, '')`,
  ).run(
    dispatcherId,
    hashEmailOtp(dispatcherId, code),
    new Date(now.getTime() + EMAIL_OTP_TTL_MS).toISOString(),
    now.toISOString(),
  );
  return { code, email };
}

function hashesMatch(storedHash: string, dispatcherId: number, code: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashEmailOtp(dispatcherId, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyEmailOtp(dispatcherId: number, code: string): void {
  const token = normalizeEmailOtp(code);
  const row = activeOtp(dispatcherId);
  if (!row) throw new Error(EMAIL_OTP_EXPIRED);
  if (Date.parse(row.expires_at) <= Date.now()) {
    getDb().prepare("UPDATE dispatcher_email_otp SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    throw new Error(EMAIL_OTP_EXPIRED);
  }
  if (!/^\d{6}$/.test(token) || !hashesMatch(row.code_hash, dispatcherId, token)) {
    const attempts = row.attempts + 1;
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      getDb()
        .prepare("UPDATE dispatcher_email_otp SET attempts = ?, used_at = ? WHERE id = ?")
        .run(attempts, new Date().toISOString(), row.id);
      throw new Error(EMAIL_OTP_EXPIRED);
    }
    getDb().prepare("UPDATE dispatcher_email_otp SET attempts = ? WHERE id = ?").run(attempts, row.id);
    throw new Error(EMAIL_OTP_INVALID);
  }
  getDb().prepare("UPDATE dispatcher_email_otp SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
}
