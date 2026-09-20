import { readSignedSessionToken } from "./session-token";

export const DISPATCHER_SESSION_COOKIE = "tms_dispatcher_id";
export const DISPATCHER_PENDING_COOKIE = "tms_2fa_pending";
export const DISPATCHER_SESSION_MS = 12 * 60 * 60 * 1000;

type SignedSessionPayload = { id: number; issuedAt: number };

export function parseDispatcherSessionValue(
  raw: string | undefined,
  now = Date.now(),
): { id: number; issuedAt: number } | null {
  const payload = readSignedSessionToken<SignedSessionPayload>(raw);
  if (!payload) return null;

  const id = Number.parseInt(String(payload.id ?? ""), 10);
  const issuedAt = Number.parseInt(String(payload.issuedAt ?? ""), 10);
  if (!id) return null;
  if (!Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > DISPATCHER_SESSION_MS) return null;
  return { id, issuedAt };
}
