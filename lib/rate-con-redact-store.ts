import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "./db";

/**
 * Driver copies live in the same `uploads/{loadId}/` directory as other load
 * documents (`addAttachment` in lib/files.ts). This app does not encrypt upload
 * bytes with a separate cipher — originals and driver copies share that store.
 */

export const RATE_CON_REDACTION_STATUSES = [
  "processing",
  "ready",
  "needs_review",
  "released",
  "office_only",
] as const;

export type RateConRedactionStatus = (typeof RATE_CON_REDACTION_STATUSES)[number];

export type RateConRedaction = {
  id: number;
  load_id: number;
  source_attachment_id: number;
  status: RateConRedactionStatus;
  reason: string;
  stored_name: string;
  mime_type: string;
  page_count: number;
  amounts_found: number;
  text_chars: number;
  verification: string;
  released_at: string;
  released_by: string;
  created_at: string;
  updated_at: string;
};

const DRIVER_VISIBLE = new Set<RateConRedactionStatus>(["ready", "released"]);

export function isDriverVisibleRedaction(status: string): boolean {
  return DRIVER_VISIBLE.has(status as RateConRedactionStatus);
}

export function labelForRedactionStatus(status: string): string {
  if (status === "processing") return "Processing";
  if (status === "ready") return "Ready for driver";
  if (status === "needs_review") return "Needs office review";
  if (status === "released") return "Released";
  if (status === "office_only") return "Office only";
  return "Processing";
}

function rowFrom(record: Record<string, unknown> | undefined): RateConRedaction | null {
  if (!record) return null;
  const status = String(record.status ?? "");
  return {
    id: Number(record.id),
    load_id: Number(record.load_id),
    source_attachment_id: Number(record.source_attachment_id),
    status: (RATE_CON_REDACTION_STATUSES as readonly string[]).includes(status)
      ? (status as RateConRedactionStatus)
      : "needs_review",
    reason: String(record.reason ?? ""),
    stored_name: String(record.stored_name ?? ""),
    mime_type: String(record.mime_type ?? "application/pdf"),
    page_count: Number(record.page_count ?? 0),
    amounts_found: Number(record.amounts_found ?? 0),
    text_chars: Number(record.text_chars ?? 0),
    verification: String(record.verification ?? ""),
    released_at: String(record.released_at ?? ""),
    released_by: String(record.released_by ?? ""),
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

export function getRateConRedaction(id: number): RateConRedaction | null {
  return rowFrom(getDb().prepare("SELECT * FROM rate_con_redactions WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}

export function getRateConRedactionBySource(sourceAttachmentId: number): RateConRedaction | null {
  return rowFrom(
    getDb()
      .prepare("SELECT * FROM rate_con_redactions WHERE source_attachment_id = ?")
      .get(sourceAttachmentId) as Record<string, unknown> | undefined,
  );
}

export function listRateConRedactions(loadId: number): RateConRedaction[] {
  const rows = getDb()
    .prepare("SELECT * FROM rate_con_redactions WHERE load_id = ? ORDER BY id DESC")
    .all(loadId) as Record<string, unknown>[];
  return rows.map((row) => rowFrom(row)).filter((row): row is RateConRedaction => row != null);
}

export function listDriverRateConRedactions(loadId: number): RateConRedaction[] {
  return listRateConRedactions(loadId).filter((row) => isDriverVisibleRedaction(row.status) && row.stored_name);
}

export function loadNeedsRateConReview(loadId: number): boolean {
  const row = getDb()
    .prepare(
      "SELECT id FROM rate_con_redactions WHERE load_id = ? AND status = 'needs_review' LIMIT 1",
    )
    .get(loadId) as { id: number } | undefined;
  return Boolean(row);
}

function uploadsDir(loadId: number): string {
  const dir = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", String(loadId));
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

export function redactionFilePath(loadId: number, storedName: string): string | null {
  const safe = path.basename(storedName);
  if (!safe || safe !== storedName || safe.includes("..")) return null;
  const root = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", String(loadId));
  const full = path.join(root, safe);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}

export function redactionPageName(storedName: string, page: number): string {
  const base = path.basename(storedName).replace(/\.pdf$/i, "");
  return `${base}-p${page}.png`;
}

function unlinkQuiet(file: string | null): void {
  if (!file) return;
  if (fs.existsSync(/*turbopackIgnore: true*/ file)) {
    fs.unlinkSync(/*turbopackIgnore: true*/ file);
  }
}

function removeStoredFiles(row: RateConRedaction): void {
  if (!row.stored_name) return;
  unlinkQuiet(redactionFilePath(row.load_id, row.stored_name));
  for (let page = 1; page <= Math.max(row.page_count, 12); page += 1) {
    unlinkQuiet(redactionFilePath(row.load_id, redactionPageName(row.stored_name, page)));
  }
}

export function markRateConRedactionProcessing(input: {
  loadId: number;
  sourceAttachmentId: number;
}): RateConRedaction {
  const now = new Date().toISOString();
  const existing = getRateConRedactionBySource(input.sourceAttachmentId);
  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO rate_con_redactions (
          load_id, source_attachment_id, status, reason, stored_name, mime_type,
          page_count, amounts_found, text_chars, verification, released_at, released_by,
          created_at, updated_at
        ) VALUES (?, ?, 'processing', '', '', 'application/pdf', 0, 0, 0, '', '', '', ?, ?)`,
      )
      .run(input.loadId, input.sourceAttachmentId, now, now);
  } else {
    getDb()
      .prepare(
        `UPDATE rate_con_redactions
         SET status = 'processing', reason = '', released_at = '', released_by = '', updated_at = ?
         WHERE id = ?`,
      )
      .run(now, existing.id);
  }
  const row = getRateConRedactionBySource(input.sourceAttachmentId);
  if (!row) throw new Error("Could not start the driver rate confirmation.");
  return row;
}

export function saveRateConRedactionFile(input: {
  loadId: number;
  sourceAttachmentId: number;
  status: RateConRedactionStatus;
  reason: string;
  verification: string;
  pdf: Buffer | null;
  pagePngs: Buffer[];
  amountsFound: number;
  textChars: number;
  previous: RateConRedaction | null;
}): RateConRedaction {
  const now = new Date().toISOString();
  if (input.previous?.stored_name) removeStoredFiles(input.previous);
  let storedName = "";
  if (input.pdf) {
    storedName = `${randomUUID()}-driver-rate-con.pdf`;
    const dir = uploadsDir(input.loadId);
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, storedName), input.pdf);
    input.pagePngs.forEach((png, index) => {
      const name = redactionPageName(storedName, index + 1);
      fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, name), png);
    });
  }
  const existing = getRateConRedactionBySource(input.sourceAttachmentId);
  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO rate_con_redactions (
          load_id, source_attachment_id, status, reason, stored_name, mime_type,
          page_count, amounts_found, text_chars, verification, released_at, released_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?, '', '', ?, ?)`,
      )
      .run(
        input.loadId,
        input.sourceAttachmentId,
        input.status,
        input.reason,
        storedName,
        input.pagePngs.length,
        input.amountsFound,
        input.textChars,
        input.verification,
        now,
        now,
      );
  } else {
    getDb()
      .prepare(
        `UPDATE rate_con_redactions
         SET status = ?, reason = ?, stored_name = ?, mime_type = 'application/pdf',
             page_count = ?, amounts_found = ?, text_chars = ?, verification = ?,
             released_at = '', released_by = '', updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.reason,
        storedName,
        input.pagePngs.length,
        input.amountsFound,
        input.textChars,
        input.verification,
        now,
        existing.id,
      );
  }
  const row = getRateConRedactionBySource(input.sourceAttachmentId);
  if (!row) throw new Error("Could not store the driver rate confirmation.");
  return row;
}

export function setRateConRedactionStatus(
  id: number,
  status: Extract<RateConRedactionStatus, "released" | "office_only">,
  actorName: string,
): RateConRedaction {
  const existing = getRateConRedaction(id);
  if (!existing) throw new Error("Driver rate confirmation not found.");
  if (!existing.stored_name) throw new Error("There is no driver copy to release. Re-run it first.");
  const now = new Date().toISOString();
  if (status === "released") {
    getDb()
      .prepare(
        `UPDATE rate_con_redactions
         SET status = 'released', released_at = ?, released_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, actorName, now, id);
  } else {
    getDb()
      .prepare(
        `UPDATE rate_con_redactions
         SET status = 'office_only', released_at = '', released_by = '', updated_at = ?
         WHERE id = ?`,
      )
      .run(now, id);
  }
  const row = getRateConRedaction(id);
  if (!row) throw new Error("Driver rate confirmation not found.");
  return row;
}

export function readRateConRedactionPdf(row: RateConRedaction): Buffer | null {
  const file = redactionFilePath(row.load_id, row.stored_name);
  if (!file || !fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  return fs.readFileSync(/*turbopackIgnore: true*/ file);
}

export function readRateConRedactionPage(row: RateConRedaction, page: number): Buffer | null {
  if (!row.stored_name || page < 1) return null;
  const file = redactionFilePath(row.load_id, redactionPageName(row.stored_name, page));
  if (!file || !fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  return fs.readFileSync(/*turbopackIgnore: true*/ file);
}

export function deleteRedactionsForSource(sourceAttachmentId: number): void {
  const row = getRateConRedactionBySource(sourceAttachmentId);
  if (!row) return;
  removeStoredFiles(row);
  getDb().prepare("DELETE FROM rate_con_redactions WHERE source_attachment_id = ?").run(sourceAttachmentId);
}

export function listRateConAttachmentIds(): Array<{ id: number; load_id: number; original_name: string }> {
  return getDb()
    .prepare(
      `SELECT id, load_id, original_name FROM attachments WHERE kind = 'rate_con' ORDER BY id`,
    )
    .all() as Array<{ id: number; load_id: number; original_name: string }>;
}
