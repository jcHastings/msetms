import { cookies } from "next/headers";
import { getDriver } from "./queries";
import { createSignedSessionToken, readSignedSessionToken } from "./session-token";
import type { DriverWithTruck } from "./types";

const COOKIE = "tms_driver_id";
const DRIVER_SESSION_TYP = "driver_web";
const DRIVER_SESSION_MS = 60 * 60 * 24 * 30 * 1000;
type DriverSessionPayload = { id: number; issuedAt: number; typ: string };

async function clearDriverSessionBestEffort(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(COOKIE);
  } catch {
    // Server Components can read cookies but not mutate them.
  }
}

export async function getSignedInDriver(): Promise<DriverWithTruck | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const payload = readSignedSessionToken<DriverSessionPayload>(raw);
  if (!payload || payload.typ !== DRIVER_SESSION_TYP) {
    await clearDriverSessionBestEffort();
    return null;
  }
  const id = Number.parseInt(String(payload.id ?? ""), 10);
  const issuedAt = Number.parseInt(String(payload.issuedAt ?? ""), 10);
  if (!id || !Number.isFinite(issuedAt)) {
    await clearDriverSessionBestEffort();
    return null;
  }
  if (Date.now() - issuedAt > DRIVER_SESSION_MS) {
    await clearDriverSessionBestEffort();
    return null;
  }
  const driver = getDriver(id);
  if (!driver) {
    await clearDriverSessionBestEffort();
    return null;
  }
  return driver;
}

export async function setDriverSession(driverId: number): Promise<void> {
  const jar = await cookies();
  jar.set(
    COOKIE,
    createSignedSessionToken({
      id: driverId,
      issuedAt: Date.now(),
      typ: DRIVER_SESSION_TYP,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: DRIVER_SESSION_MS / 1000,
    },
  );
}

export async function clearDriverSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function requireDriver(): Promise<DriverWithTruck> {
  const driver = await getSignedInDriver();
  if (!driver) {
    throw new Error("Sign in with your email and password.");
  }
  return driver;
}
