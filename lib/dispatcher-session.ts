import { cookies } from "next/headers";
import { DEVICE_COOKIE, DEVICE_TTL_MS } from "./dispatcher-device";
import {
  PASSWORD_NOT_RECOGNIZED,
  PASSWORD_UNSET,
  findActiveDispatcherByEmail,
  verifyDispatcherPassword,
} from "./dispatcher-password";
import { getDispatcherUser, isDispatcherTwoFactorRequired, listDispatcherUsers } from "./settings";
import {
  canAccessAccounting,
  canAssignLoads,
  canConnectQuickbooks,
  canDeleteDocuments,
  canDeleteFleet,
  canDeleteLocations,
  canEditFleet,
  canEditLoads,
  canEditLocations,
  canEditSettings,
  canExportCsv,
  canImportLocations,
  canLogCheckCall,
  canManageUsers,
  canSeeNavHref,
  canSendSms,
  canUploadFuel,
  canViewAudit,
  canViewIfta,
  canViewLoadFinancials,
  canViewReports,
  roleLabel,
  toPublicDispatcher,
  type PublicDispatcher,
} from "./settings-shared";

export {
  canAccessAccounting,
  canAssignLoads,
  canConnectQuickbooks,
  canDeleteDocuments,
  canDeleteFleet,
  canDeleteLocations,
  canEditFleet,
  canEditLoads,
  canEditLocations,
  canEditSettings,
  canExportCsv,
  canImportLocations,
  canLogCheckCall,
  canManageUsers,
  canSeeNavHref,
  canSendSms,
  canUploadFuel,
  canViewAudit,
  canViewIfta,
  canViewLoadFinancials,
  canViewReports,
  roleLabel,
};

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

export function authenticateDispatcher(dispatcherId: number, password: string): Dispatcher {
  const user = getDispatcherUser(dispatcherId);
  if (!user || !user.active) {
    throw new Error(PASSWORD_NOT_RECOGNIZED);
  }
  if (!user.has_password) {
    throw new Error(PASSWORD_UNSET);
  }
  if (!verifyDispatcherPassword(dispatcherId, password)) {
    throw new Error(PASSWORD_NOT_RECOGNIZED);
  }
  return toPublicDispatcher(user);
}

export function authenticateDispatcherByEmail(email: string, password: string): Dispatcher {
  const row = findActiveDispatcherByEmail(email);
  if (!row) throw new Error(PASSWORD_NOT_RECOGNIZED);
  return authenticateDispatcher(row.id, password);
}

const SCRIPT_ACTOR: Dispatcher = {
  id: 0,
  name: "script",
  role: "admin",
  email: "",
  phone: "",
  active: 1,
  permission_group: "all",
  totp_enrolled: false,
  has_password: false,
  must_change_password: false,
};

async function sessionCookieValue(): Promise<string | undefined | "no-request"> {
  try {
    const jar = await cookies();
    return jar.get(SESSION_COOKIE)?.value;
  } catch {
    return "no-request";
  }
}

export async function getSignedInDispatcher(): Promise<Dispatcher | null> {
  const raw = await sessionCookieValue();
  if (raw === "no-request" || !raw) return null;
  const parsed = parseSessionValue(raw);
  if (!parsed) return null;
  const dispatcher = getDispatcher(parsed.id);
  if (!dispatcher?.active) return null;
  return dispatcher;
}

export async function requireSignedInDispatcher(): Promise<Dispatcher> {
  const raw = await sessionCookieValue();
  if (raw === "no-request") return SCRIPT_ACTOR;
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) throw new Error("Sign in as a dispatcher to continue.");
  return dispatcher;
}

export async function requireCapability(
  allowed: (role: string) => boolean,
  message = "You do not have access to this.",
): Promise<Dispatcher> {
  const dispatcher = await requireSignedInDispatcher();
  if (!allowed(dispatcher.role)) {
    throw new Error(message);
  }
  return dispatcher;
}

export async function getPageAccess(allowed: (role: string) => boolean): Promise<Dispatcher | null> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !allowed(dispatcher.role)) return null;
  return dispatcher;
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return new Response(message, { status: 401 });
}

export async function requireSettingsEditor(): Promise<Dispatcher> {
  return requireCapability(canEditSettings, "Only an Administrator can change settings.");
}

export async function requireUserAdmin(): Promise<Dispatcher> {
  return requireCapability(canManageUsers, "Only an Administrator can manage users.");
}

export async function requireLoadAssigner(): Promise<Dispatcher> {
  return requireCapability(canAssignLoads, "Standard dispatch owns day-to-day assignment.");
}

export async function requireLoadEditor(): Promise<Dispatcher> {
  return requireCapability(canEditLoads, "You cannot create or change loads.");
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

export async function readTrustedDeviceCookie(): Promise<string> {
  try {
    const jar = await cookies();
    return jar.get(DEVICE_COOKIE)?.value ?? "";
  } catch {
    return "";
  }
}

export async function writeTrustedDeviceCookie(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TTL_MS / 1000,
  });
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
