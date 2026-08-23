import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { DISPATCHER_COOKIE } from "./dispatch-paths";
import { verifyPassword } from "./password";

export type DispatcherAccount = {
  id: number;
  username: string;
};

const SESSION_MS = 1000 * 60 * 60 * 24 * 7;

function nowIso(): string {
  return new Date().toISOString();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cookieSecure(): boolean {
  if (process.env.TMS_COOKIE_SECURE === "1") return true;
  if (process.env.TMS_COOKIE_SECURE === "0") return false;
  return false;
}

export function dispatcherCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM dispatchers").get() as { count: number };
  return Number(row.count);
}

export function getDispatcherByUsername(username: string): { id: number; username: string; password_hash: string } | null {
  return (
    (getDb()
      .prepare("SELECT id, username, password_hash FROM dispatchers WHERE username = ?")
      .get(username.trim().toLowerCase()) as
      | { id: number; username: string; password_hash: string }
      | undefined) ?? null
  );
}

export function authenticateDispatcher(username: string, password: string): DispatcherAccount | null {
  const row = getDispatcherByUsername(username);
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

export function createDispatcherSession(dispatcherId: number): string {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MS).toISOString();
  getDb()
    .prepare(
      "INSERT INTO dispatcher_sessions (dispatcher_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(dispatcherId, tokenHash(token), expires, nowIso());
  getDb().prepare("DELETE FROM dispatcher_sessions WHERE expires_at < ?").run(nowIso());
  return token;
}

export function dispatcherFromToken(token: string | undefined): DispatcherAccount | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT dispatchers.id AS id, dispatchers.username AS username
       FROM dispatcher_sessions
       JOIN dispatchers ON dispatchers.id = dispatcher_sessions.dispatcher_id
       WHERE dispatcher_sessions.token_hash = ? AND dispatcher_sessions.expires_at > ?`,
    )
    .get(tokenHash(token), nowIso()) as DispatcherAccount | undefined;
  return row ?? null;
}

export function revokeDispatcherSession(token: string | undefined): void {
  if (!token) return;
  getDb().prepare("DELETE FROM dispatcher_sessions WHERE token_hash = ?").run(tokenHash(token));
}

export async function getSignedInDispatcher(): Promise<DispatcherAccount | null> {
  const jar = await cookies();
  return dispatcherFromToken(jar.get(DISPATCHER_COOKIE)?.value);
}

export async function setDispatcherSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(DISPATCHER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function clearDispatcherSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(DISPATCHER_COOKIE)?.value;
  revokeDispatcherSession(token);
  jar.delete(DISPATCHER_COOKIE);
}

export async function requireDispatcher(): Promise<DispatcherAccount> {
  const user = await getSignedInDispatcher();
  if (!user) throw new Error("Sign in to dispatch.");
  return user;
}

export async function requireDispatcherPage(): Promise<DispatcherAccount> {
  const user = await getSignedInDispatcher();
  if (!user) redirect("/login");
  return user;
}
