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

export function loadIdsWithSentMail(loadIds: number[], kind: LoadMailKind): Set<number> {
  const found = new Set<number>();
  const unique = [...new Set(loadIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (let index = 0; index < unique.length; index += 400) {
    const chunk = unique.slice(index, index + 400);
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT load_id FROM sent_mail
         WHERE kind = ? AND load_id IN (${chunk.map(() => "?").join(", ")})`,
      )
      .all(kind, ...chunk) as Array<{ load_id: number }>;
    for (const row of rows) found.add(Number(row.load_id));
  }
  return found;
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
