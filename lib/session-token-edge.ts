import { bytesToBase64Url, parseSignedSessionPayload, parseSignedSessionToken } from "./session-token-core";

const encoder = new TextEncoder();

function getSessionSecretForMiddleware(): string | undefined {
  const secret = (process.env.SESSION_SECRET ?? "").trim();
  if (secret) return secret;
  if ((process.env.NODE_ENV ?? "").toLowerCase() !== "production") {
    return "dev-session-secret-change-me";
  }
  return undefined;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signWithWebCrypto(unsigned: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function readSignedSessionTokenAtEdge<T>(raw: string | undefined): Promise<T | null> {
  const parts = parseSignedSessionToken(raw);
  if (!parts) return null;

  const secret = getSessionSecretForMiddleware();
  if (!secret) return null;

  const expectedSignature = await signWithWebCrypto(parts.unsigned, secret);
  if (!timingSafeEqualString(parts.signature, expectedSignature)) return null;

  return parseSignedSessionPayload<T>(parts.payloadPart);
}
