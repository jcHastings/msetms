import { getDb } from "./db";

export type LoadChatAuthorRole = "dispatcher" | "driver";

export type LoadChatMessage = {
  id: number;
  load_id: number;
  author_role: LoadChatAuthorRole;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
};

function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function listLoadChatMessages(loadId: number): LoadChatMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM load_chat_messages WHERE load_id = ? ORDER BY id ASC`,
    )
    .all(loadId) as LoadChatMessage[];
}

export function postLoadChatMessage(input: {
  loadId: number;
  authorRole: LoadChatAuthorRole;
  authorId: number;
  authorName: string;
  body: string;
  now?: Date;
}): LoadChatMessage {
  const body = String(input.body ?? "").trim();
  if (!body) throw new Error("Type a message.");
  if (body.length > 2000) throw new Error("Keep the message under 2000 characters.");
  const createdAt = nowIso(input.now);
  const result = getDb()
    .prepare(
      `INSERT INTO load_chat_messages (load_id, author_role, author_id, author_name, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.loadId, input.authorRole, input.authorId, input.authorName.trim() || input.authorRole, body, createdAt);
  return {
    id: Number(result.lastInsertRowid),
    load_id: input.loadId,
    author_role: input.authorRole,
    author_id: input.authorId,
    author_name: input.authorName.trim() || input.authorRole,
    body,
    created_at: createdAt,
  };
}
