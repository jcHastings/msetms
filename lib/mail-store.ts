import { getDb } from "./db";
import { isLoadMailKind, type LoadMailKind, type SentMailRow } from "./mail-shared";

function now(): string {
  return new Date().toISOString();
}

export function recordSentMail(input: {
  loadId: number;
  kind: LoadMailKind;
  to: string;
  subject: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO sent_mail (load_id, kind, to_email, subject, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.loadId, input.kind, input.to, input.subject, now());
}

export function listSentMail(loadId: number): SentMailRow[] {
  return (getDb()
    .prepare(
      `SELECT id, load_id, kind, to_email, subject, created_at
       FROM sent_mail
       WHERE load_id = ?
       ORDER BY id DESC`,
    )
    .all(loadId) as Array<Record<string, unknown>>).map(asSentMail);
}

export function lastSentMail(loadId: number, kind: LoadMailKind): SentMailRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, load_id, kind, to_email, subject, created_at
       FROM sent_mail
       WHERE load_id = ? AND kind = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(loadId, kind) as Record<string, unknown> | undefined;
  return row ? asSentMail(row) : null;
}

function asSentMail(row: Record<string, unknown>): SentMailRow {
  const kind = String(row.kind ?? "");
  return {
    id: Number(row.id),
    load_id: Number(row.load_id),
    kind: isLoadMailKind(kind) ? kind : "driver_load",
    to_email: String(row.to_email ?? ""),
    subject: String(row.subject ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}
