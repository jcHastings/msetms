import { cookies } from "next/headers";
import { getDb } from "./db";

const COOKIE = "tms_dispatcher_id";

export type Dispatcher = {
  id: number;
  name: string;
  pin: string;
  role: string;
};

export function listDispatchers(): Dispatcher[] {
  return getDb().prepare("SELECT * FROM dispatchers ORDER BY name COLLATE NOCASE").all() as Dispatcher[];
}

export function getDispatcher(id: number): Dispatcher | null {
  return (
    (getDb().prepare("SELECT * FROM dispatchers WHERE id = ?").get(id) as Dispatcher | undefined) ?? null
  );
}

export function authenticateDispatcher(dispatcherId: number, pin: string): Dispatcher {
  const dispatcher = getDispatcher(dispatcherId);
  if (!dispatcher || dispatcher.pin !== pin.trim()) {
    throw new Error("Dispatcher or PIN is not recognized.");
  }
  return dispatcher;
}

export async function getSignedInDispatcher(): Promise<Dispatcher | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? Number.parseInt(raw, 10) : NaN;
  if (!id) return null;
  return getDispatcher(id);
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
