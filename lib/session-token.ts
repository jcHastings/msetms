import crypto from "node:crypto";
import { getSessionSecret } from "./env";

const SESSION_TOKEN_VERSION = "v1";

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
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [version, payloadPart, signature] = parts;
  if (version !== SESSION_TOKEN_VERSION || !payloadPart || !signature) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const expectedSignature = sign(`${version}.${payloadPart}`, secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    return JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
