import { cookies } from "next/headers";
import { getDispatcherUser, listDispatcherUsers } from "./settings";
import {
  canEditSettings,
  canManageUsers,
  roleLabel,
  type DispatcherUser,
} from "./settings-shared";

export { canEditSettings, canManageUsers, roleLabel };

const COOKIE = "tms_dispatcher_id";

export type Dispatcher = DispatcherUser;

export { canEditSettings, canManageUsers, roleLabel };

export function listDispatchers(): Dispatcher[] {
  return listDispatcherUsers(false);
}

export function getDispatcher(id: number): Dispatcher | null {
  return getDispatcherUser(id);
}

export function authenticateDispatcher(dispatcherId: number, pin: string): Dispatcher {
  const dispatcher = getDispatcher(dispatcherId);
  if (!dispatcher || !dispatcher.active || dispatcher.pin !== pin.trim()) {
    throw new Error("Dispatcher or PIN is not recognized.");
  }
  return dispatcher;
}

export async function getSignedInDispatcher(): Promise<Dispatcher | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? Number.parseInt(raw, 10) : NaN;
  if (!id) return null;
  const dispatcher = getDispatcher(id);
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
    throw new Error("Only an admin or manager can manage users.");
  }
  return dispatcher;
}

export async function setDispatcherSession(dispatcherId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, String(dispatcherId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearDispatcherSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
