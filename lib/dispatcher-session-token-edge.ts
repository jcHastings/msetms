import { DISPATCHER_SESSION_MS } from "./dispatcher-session-constants";
import { DISPATCHER_SESSION_TYP } from "./dispatcher-session-types";
import { readSignedSessionTokenAtEdge } from "./session-token-edge";

type SignedSessionPayload = { id: number; issuedAt: number; typ: string };

export async function parseDispatcherSessionValueAtEdge(
  raw: string | undefined,
  now = Date.now(),
): Promise<{ id: number; issuedAt: number } | null> {
  const payload = await readSignedSessionTokenAtEdge<SignedSessionPayload>(raw);
  if (!payload) return null;
  if (payload.typ !== DISPATCHER_SESSION_TYP) return null;

  const id = Number.parseInt(String(payload.id ?? ""), 10);
  const issuedAt = Number.parseInt(String(payload.issuedAt ?? ""), 10);
  if (!id) return null;
  if (!Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > DISPATCHER_SESSION_MS) return null;
  return { id, issuedAt };
}
