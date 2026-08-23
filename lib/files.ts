import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Attachment, AttachmentKind } from "./types";

function uploadsDir(...parts: string[]): string {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads", ...parts);
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

export function saveInboxFile(file: File, buffer: Buffer): { inboxId: string; storedPath: string } {
  const inboxId = randomUUID();
  const safeName = sanitizeName(file.name || "upload.bin");
  const dir = uploadsDir("inbox", inboxId);
  const storedPath = path.join(/*turbopackIgnore: true*/ dir, safeName);
  fs.writeFileSync(/*turbopackIgnore: true*/ storedPath, buffer);
  return { inboxId, storedPath };
}

export function getInboxFile(inboxId: string): { storedPath: string; originalName: string } | null {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads", "inbox", inboxId);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return null;
  const files = fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((name) => name !== "parsed.json");
  if (files.length === 0) return null;
  return { storedPath: path.join(/*turbopackIgnore: true*/ dir, files[0]), originalName: files[0] };
}

export function writeInboxParse(inboxId: string, payload: unknown): void {
  const dir = uploadsDir("inbox", inboxId);
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, "parsed.json"), JSON.stringify(payload, null, 2));
}

export function readInboxParse<T>(inboxId: string): T | null {
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads", "inbox", inboxId, "parsed.json");
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as T;
}

export function attachInboxToLoad(
  loadId: number,
  inboxId: string,
  kind: AttachmentKind,
  uploadedBy: "dispatcher" | "driver",
): Attachment {
  const inbox = getInboxFile(inboxId);
  if (!inbox) throw new Error("Uploaded file is no longer available. Upload it again.");
  const buffer = fs.readFileSync(/*turbopackIgnore: true*/ inbox.storedPath);
  return addAttachment({
    loadId,
    kind,
    originalName: inbox.originalName,
    buffer,
    mimeType: guessMime(inbox.originalName),
    uploadedBy,
  });
}

export function addAttachment(input: {
  loadId: number;
  kind: AttachmentKind;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  uploadedBy: "dispatcher" | "driver";
}): Attachment {
  const storedName = `${randomUUID()}-${sanitizeName(input.originalName)}`;
  const dir = uploadsDir(String(input.loadId));
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, storedName), input.buffer);
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO attachments (load_id, kind, original_name, stored_name, mime_type, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.loadId,
      input.kind,
      input.originalName,
      storedName,
      input.mimeType || guessMime(input.originalName),
      input.uploadedBy,
      createdAt,
    );
  return {
    id: Number(result.lastInsertRowid),
    load_id: input.loadId,
    kind: input.kind,
    original_name: input.originalName,
    stored_name: storedName,
    mime_type: input.mimeType || guessMime(input.originalName),
    uploaded_by: input.uploadedBy,
    created_at: createdAt,
  };
}

export function listAttachments(loadId: number): Attachment[] {
  return getDb()
    .prepare("SELECT * FROM attachments WHERE load_id = ? ORDER BY created_at DESC, id DESC")
    .all(loadId) as Attachment[];
}

export function getAttachment(id: number): Attachment | null {
  return (getDb().prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Attachment | undefined) ?? null;
}

export function getAttachmentPath(attachment: Attachment): string {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "uploads",
    String(attachment.load_id),
    attachment.stored_name,
  );
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "file";
}

export function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "application/octet-stream";
}

export async function fileToBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}
