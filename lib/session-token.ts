import crypto from "crypto";
import { getSessionSecret } from "./env";
import { parseSignedSessionPayload, parseSignedSessionToken, SESSION_TOKEN_VERSION } from "./session-token-core";

function sign(unsigned: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createSignedSessionToken(payload: Record<string, unknown>): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is required for session cookies.");
  }
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const unsigned = `${SESSION_TOKEN_VERSION}.${payloadPart}`;
  const signature = sign(unsigned, secret);
  return `${unsigned}.${signature}`;
}

export function readSignedSessionToken<T>(raw: string | undefined): T | null {
  const parts = parseSignedSessionToken(raw);
  if (!parts) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const expectedSignature = sign(parts.unsigned, secret);
  if (!safeEqual(parts.signature, expectedSignature)) return null;
  return parseSignedSessionPayload<T>(parts.payloadPart);
}
