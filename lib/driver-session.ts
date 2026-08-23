import { cookies } from "next/headers";
import { getDriver } from "./queries";
import type { DriverWithTruck } from "./types";

const COOKIE = "tms_driver_id";

export async function getSignedInDriver(): Promise<DriverWithTruck | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? Number.parseInt(raw, 10) : NaN;
  if (!id) return null;
  return getDriver(id);
}

export async function setDriverSession(driverId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, String(driverId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearDriverSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function requireDriver(): Promise<DriverWithTruck> {
  const driver = await getSignedInDriver();
  if (!driver) {
    throw new Error("Sign in with your PIN.");
  }
  return driver;
}
