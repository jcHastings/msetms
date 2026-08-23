import { cookies } from "next/headers";
import { getDispatcherUser, isDispatcherTwoFactorRequired, listDispatcherUsers } from "./settings";
import {
  canAccessAccounting,
  canAssignLoads,
  canEditSettings,
  canManageUsers,
  roleLabel,
  toPublicDispatcher,
  type PublicDispatcher,
} from "./settings-shared";

export { canAccessAccounting, canAssignLoads, canEditSettings, canManageUsers, roleLabel };

const SESSION_COOKIE = "tms_dispatcher_id";
const PENDING_COOKIE = "tms_2fa_pending";
export const DISPATCHER_SESSION_MS = 12 * 60 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;

export type Dispatcher = PublicDispatcher;

export function listDispatchers(): Dispatcher[] {
  return listDispatcherUsers(false).map(toPublicDispatcher);
}

export function getDispatcher(id: number): Dispatcher | null {
  const user = getDispatcherUser(id);
  return user ? toPublicDispatcher(user) : null;
}

export function authenticateDispatcher(dispatcherId: number, pin: string): Dispatcher {
  const user = getDispatcherUser(dispatcherId);
  if (!user || !user.active || user.pin !== pin.trim()) {
    throw new Error("Dispatcher or PIN is not recognized.");
  }
  return toPublicDispatcher(user);
}

export async function getSignedInDispatcher(): Promise<Dispatcher | null> {
  const jar = await cookies();
  const parsed = parseSessionValue(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  const dispatcher = getDispatcher(parsed.id);
  if (!dispatcher?.active) return null;
  return dispatcher;
}

export async function requireSignedInDispatcher(): Promise<Dispatcher> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) throw new Error("Sign in as a dispatcher to continue.");
  return dispatcher;
}

export async function requireSettingsEditor(): Promise<Dispatcher> {
  const dispatcher = await requireSignedInDispatcher();
  if (!canEditSettings(dispatcher.role)) {
    throw new Error("Read-only users cannot change settings.");
  }
  return dispatcher;
}

export async function requireUserAdmin(): Promise<Dispatcher> {
  const dispatcher = await requireSettingsEditor();
  if (!canManageUsers(dispatcher.role)) {
    throw new Error("Only an Administrator can manage users.");
  }
  return dispatcher;
}

export async function requireLoadAssigner(): Promise<Dispatcher> {
  const dispatcher = await requireSignedInDispatcher();
  if (!canAssignLoads(dispatcher.role)) {
    throw new Error("Accounting cannot assign loads or change dispatch.");
  }
  return dispatcher;
}

export async function setDispatcherSession(dispatcherId: number): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${dispatcherId}.${Date.now()}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DISPATCHER_SESSION_MS / 1000,
  });
  jar.delete(PENDING_COOKIE);
}

export async function clearDispatcherSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_COOKIE);
}

export async function setPendingTwoFactor(dispatcherId: number): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, String(dispatcherId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_MS / 1000,
  });
  jar.delete(SESSION_COOKIE);
}

export async function getPendingTwoFactorDispatcherId(): Promise<number | null> {
  const jar = await cookies();
  const id = Number.parseInt(jar.get(PENDING_COOKIE)?.value ?? "", 10);
  return id || null;
}

export async function clearPendingTwoFactor(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
}

export function isTwoFactorRequired(): boolean {
  return isDispatcherTwoFactorRequired();
}

export function parseSessionValue(raw: string | undefined): { id: number; issuedAt: number } | null {
  if (!raw) return null;
  const [idPart, tsPart] = raw.split(".");
  const id = Number.parseInt(idPart, 10);
  if (!id) return null;
  if (!tsPart) return { id, issuedAt: Date.now() };
  const issuedAt = Number.parseInt(tsPart, 10);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > DISPATCHER_SESSION_MS) return null;
  return { id, issuedAt };
}
