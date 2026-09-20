import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export const TOTP_ISSUER = "MS Express TMS";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
const RECOVERY_COUNT = 10;

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpAuthUri(accountName: string, secret: string): string {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: accountName.trim() || "dispatcher",
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const token = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(token) || !secret) return false;
  const delta = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: "dispatcher",
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).validate({ token, window: 1 });
  return delta !== null;
}

export function generateTotpCode(secret: string, timestamp = Date.now()): string {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: "dispatcher",
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp });
}

export async function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 196, margin: 1, errorCorrectionLevel: "M" });
}

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_COUNT) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return [...codes];
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function recoveryHashesMatch(storedHash: string, code: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashRecoveryCode(code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeTotpCode(code: string): string {
  return code.replace(/\s+/g, "").trim();
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}
