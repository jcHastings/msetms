export const SESSION_TOKEN_VERSION = "v1";

export type SignedSessionTokenParts = {
  unsigned: string;
  payloadPart: string;
  signature: string;
};

function decodeBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function parseSignedSessionToken(raw: string | undefined): SignedSessionTokenParts | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;

  const [version, payloadPart, signature] = parts;
  if (version !== SESSION_TOKEN_VERSION || !payloadPart || !signature) return null;

  return { unsigned: `${version}.${payloadPart}`, payloadPart, signature };
}

export function parseSignedSessionPayload<T>(payloadPart: string): T | null {
  try {
    return JSON.parse(decodeBase64Url(payloadPart)) as T;
  } catch {
    return null;
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
