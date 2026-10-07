import fs from "node:fs";
import { currentAuditActor } from "./audit";
import { getDb } from "./db";
import {
  addAttachment,
  fileToBuffer,
  getAttachment,
  getAttachmentPath,
  isPdfOrImage,
  reimbursementReceiptPath,
  saveReimbursementReceiptFile,
} from "./files";
import { normalizePayWeek, shiftPayWeek } from "./pay-week";
import { getLoad } from "./queries";
import { driverAssignedToLoad } from "./relay-store";
import type { AttachmentKind } from "./types";

export const REIMBURSEMENT_CATEGORIES = [
  { value: "lumper", label: "Lumper" },
  { value: "washout", label: "Washout" },
  { value: "scale", label: "Scale" },
  { value: "parts", label: "Parts" },
  { value: "tolls", label: "Tolls" },
  { value: "other", label: "Other" },
] as const;

export type ReimbursementCategory = (typeof REIMBURSEMENT_CATEGORIES)[number]["value"];
export type ReimbursementStatus = "submitted" | "approved" | "rejected" | "paid";

export type DriverReimbursement = {
  id: number;
  driver_id: number;
  amount: number;
  category: ReimbursementCategory;
  load_id: number | null;
  note: string;
  attachment_id: number | null;
  stored_name: string;
  original_name: string;
  mime_type: string;
  status: ReimbursementStatus;
  reject_reason: string;
  settlement_week_start: string;
  paid_at: string;
  reviewed_at: string;
  reviewed_by: string;
  created_at: string;
  driver_name?: string;
  load_number?: string;
  origin?: string;
  destination?: string;
};

export class ReimbursementAccessError extends Error {
  readonly status: 403 | 404;

  constructor(status: 403 | 404, message: string) {
    super(message);
    this.name = "ReimbursementAccessError";
    this.status = status;
  }
}

const CATEGORY_TO_ATTACHMENT: Record<ReimbursementCategory, AttachmentKind> = {
  lumper: "lumper",
  washout: "other",
  scale: "scale_ticket",
  parts: "other",
  tolls: "other",
  other: "other",
};

export function labelForReimbursementCategory(value: string): string {
  return REIMBURSEMENT_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function labelForReimbursementStatus(value: string): string {
  if (value === "submitted") return "Submitted";
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "paid") return "Paid";
  return value;
}

export function parseReimbursementAmount(value: unknown): number {
  const raw = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!raw) throw new Error("Enter an amount.");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Amount must be greater than zero, with up to two decimals.");
  }
  const amount = Math.round(Number(raw) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero, with up to two decimals.");
  }
  if (amount > 100000) throw new Error("Amount is too large.");
  return amount;
}

export function parseReimbursementCategory(value: unknown): ReimbursementCategory {
  const raw = String(value ?? "").trim();
  const match = REIMBURSEMENT_CATEGORIES.find((item) => item.value === raw);
  if (!match) throw new Error("Pick a category.");
  return match.value;
}

export function parseReimbursementNote(value: unknown): string {
  const note = String(value ?? "").trim();
  if (note.length > 500) throw new Error("Note must be 500 characters or less.");
  return note;
}

export function parseRejectReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  if (reason.length < 3) throw new Error("Enter a reason for the rejection.");
  if (reason.length > 500) throw new Error("Reason must be 500 characters or less.");
  return reason;
}

function mapRow(row: DriverReimbursement): DriverReimbursement {
  return {
    ...row,
    load_id: row.load_id ?? null,
    attachment_id: row.attachment_id ?? null,
    note: row.note ?? "",
    stored_name: row.stored_name ?? "",
    original_name: row.original_name ?? "",
    mime_type: row.mime_type ?? "",
    reject_reason: row.reject_reason ?? "",
    settlement_week_start: row.settlement_week_start ?? "",
    paid_at: row.paid_at ?? "",
    reviewed_at: row.reviewed_at ?? "",
    reviewed_by: row.reviewed_by ?? "",
    driver_name: row.driver_name ?? "",
    load_number: row.load_number ?? "",
    origin: row.origin ?? "",
    destination: row.destination ?? "",
  };
}

export function getReimbursement(id: number): DriverReimbursement | null {
  const row = getDb().prepare("SELECT * FROM driver_reimbursements WHERE id = ?").get(id) as
    | DriverReimbursement
    | undefined;
  return row ? mapRow(row) : null;
}

export function listDriverReimbursements(driverId: number): DriverReimbursement[] {
  return (
    getDb()
      .prepare(
        `SELECT driver_reimbursements.*, loads.load_number AS load_number, loads.origin AS origin, loads.destination AS destination
         FROM driver_reimbursements
         LEFT JOIN loads ON loads.id = driver_reimbursements.load_id
         WHERE driver_reimbursements.driver_id = ?
         ORDER BY driver_reimbursements.id DESC`,
      )
      .all(driverId) as DriverReimbursement[]
  ).map(mapRow);
}

export function listReimbursementQueue(): DriverReimbursement[] {
  return (
    getDb()
      .prepare(
        `SELECT driver_reimbursements.*, drivers.name AS driver_name,
                loads.load_number AS load_number, loads.origin AS origin, loads.destination AS destination
         FROM driver_reimbursements
         JOIN drivers ON drivers.id = driver_reimbursements.driver_id
         LEFT JOIN loads ON loads.id = driver_reimbursements.load_id
         ORDER BY CASE driver_reimbursements.status
           WHEN 'submitted' THEN 0
           WHEN 'approved' THEN 1
           WHEN 'rejected' THEN 2
           ELSE 3
         END, driver_reimbursements.id DESC`,
      )
      .all() as DriverReimbursement[]
  ).map(mapRow);
}

export function listStatementReimbursements(driverId: number, weekStart: string): DriverReimbursement[] {
  return (
    getDb()
      .prepare(
        `SELECT driver_reimbursements.*, loads.load_number AS load_number
         FROM driver_reimbursements
         LEFT JOIN loads ON loads.id = driver_reimbursements.load_id
         WHERE driver_reimbursements.driver_id = ?
           AND driver_reimbursements.settlement_week_start = ?
           AND driver_reimbursements.status IN ('approved', 'paid')
         ORDER BY driver_reimbursements.id`,
      )
      .all(driverId, weekStart) as DriverReimbursement[]
  ).map(mapRow);
}

function settlementWeekPaid(driverId: number, weekStart: string): boolean {
  const row = getDb()
    .prepare("SELECT paid_at FROM settlement_statements WHERE driver_id = ? AND week_start = ?")
    .get(driverId, weekStart) as { paid_at?: string } | undefined;
  return Boolean(String(row?.paid_at ?? "").trim());
}

/** Put an approval on the submit week, or the next week that is not already marked paid. */
export function placeReimbursementWeek(driverId: number, createdAt: string, now = new Date()): string {
  let week = normalizePayWeek(createdAt.slice(0, 10), now).from;
  for (let step = 0; step < 16; step += 1) {
    if (!settlementWeekPaid(driverId, week)) return week;
    week = shiftPayWeek(week, 1).from;
  }
  return normalizePayWeek(now.toISOString().slice(0, 10), now).from;
}

export async function submitDriverReimbursement(input: {
  driverId: number;
  driverName: string;
  amount: unknown;
  category: unknown;
  loadId?: number | null;
  note?: unknown;
  file: File;
}): Promise<number> {
  const amount = parseReimbursementAmount(input.amount);
  const category = parseReimbursementCategory(input.category);
  const note = parseReimbursementNote(input.note);
  const loadId = input.loadId && input.loadId > 0 ? input.loadId : null;
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new Error("A receipt photo is required.");
  }
  if (!isPdfOrImage(input.file)) throw new Error("Receipt must be a photo or PDF.");
  if (loadId) {
    const load = getLoad(loadId);
    if (!load || !driverAssignedToLoad(load.id, input.driverId, load.driver_id)) {
      throw new Error("That load is not yours.");
    }
  }
  const buffer = await fileToBuffer(input.file);
  const saved = saveReimbursementReceiptFile({
    originalName: input.file.name || "receipt.jpg",
    buffer,
    mimeType: input.file.type,
  });
  let attachmentId: number | null = null;
  if (loadId) {
    const attachment = addAttachment({
      loadId,
      kind: CATEGORY_TO_ATTACHMENT[category],
      originalName: saved.originalName,
      buffer,
      mimeType: saved.mimeType,
      uploadedBy: input.driverName || "driver",
    });
    attachmentId = attachment.id;
  }
  const result = getDb()
    .prepare(
      `INSERT INTO driver_reimbursements (
        driver_id, amount, category, load_id, note, attachment_id, stored_name, original_name, mime_type,
        status, reject_reason, settlement_week_start, paid_at, reviewed_at, reviewed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', '', '', '', '', '', ?)`,
    )
    .run(
      input.driverId,
      amount,
      category,
      loadId,
      note,
      attachmentId,
      saved.storedName,
      saved.originalName,
      saved.mimeType,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function approveReimbursement(id: number, now = new Date()): DriverReimbursement {
  const row = getReimbursement(id);
  if (!row) throw new Error("Reimbursement not found.");
  if (row.status !== "submitted") throw new Error("Only a submitted reimbursement can be approved.");
  const week = placeReimbursementWeek(row.driver_id, row.created_at, now);
  const reviewedAt = now.toISOString();
  getDb()
    .prepare(
      `UPDATE driver_reimbursements
       SET status = 'approved', settlement_week_start = ?, reviewed_at = ?, reviewed_by = ?, reject_reason = ''
       WHERE id = ?`,
    )
    .run(week, reviewedAt, currentAuditActor().name, id);
  const next = getReimbursement(id);
  if (!next) throw new Error("Reimbursement not found.");
  return next;
}

export function rejectReimbursement(id: number, reason: unknown, now = new Date()): DriverReimbursement {
  const row = getReimbursement(id);
  if (!row) throw new Error("Reimbursement not found.");
  if (row.status !== "submitted") throw new Error("Only a submitted reimbursement can be rejected.");
  const rejectReason = parseRejectReason(reason);
  getDb()
    .prepare(
      `UPDATE driver_reimbursements
       SET status = 'rejected', reject_reason = ?, reviewed_at = ?, reviewed_by = ?, settlement_week_start = ''
       WHERE id = ?`,
    )
    .run(rejectReason, now.toISOString(), currentAuditActor().name, id);
  const next = getReimbursement(id);
  if (!next) throw new Error("Reimbursement not found.");
  return next;
}

/** Record-only. Flips this week's approved reimbursements to paid. Does not move money. */
export function markWeekReimbursementsPaid(driverId: number, weekStart: string, paidAt = new Date().toISOString()): number {
  const result = getDb()
    .prepare(
      `UPDATE driver_reimbursements
       SET status = 'paid', paid_at = ?, settlement_week_start = ?
       WHERE driver_id = ? AND settlement_week_start = ? AND status = 'approved'`,
    )
    .run(paidAt, weekStart, driverId, weekStart);
  return Number(result.changes ?? 0);
}

export function reimbursementDriverForAttachment(attachmentId: number): number | null {
  const row = getDb()
    .prepare("SELECT driver_id FROM driver_reimbursements WHERE attachment_id = ?")
    .get(attachmentId) as { driver_id: number } | undefined;
  return row ? row.driver_id : null;
}

export function readReimbursementReceipt(
  id: number,
  reader: { office: boolean; driverId: number | null },
): { buffer: Buffer; mimeType: string; filename: string } {
  const row = getReimbursement(id);
  if (!row) throw new ReimbursementAccessError(404, "Receipt not found.");
  if (!reader.office && reader.driverId !== row.driver_id) {
    throw new ReimbursementAccessError(403, "You cannot open this receipt.");
  }
  if (row.stored_name) {
    const stored = reimbursementReceiptPath(row.stored_name);
    if (fs.existsSync(stored)) {
      return {
        buffer: fs.readFileSync(stored),
        mimeType: row.mime_type || "application/octet-stream",
        filename: row.original_name || "receipt",
      };
    }
  }
  if (row.attachment_id) {
    const attachment = getAttachment(row.attachment_id);
    if (attachment) {
      const stored = getAttachmentPath(attachment);
      if (fs.existsSync(stored)) {
        return {
          buffer: fs.readFileSync(stored),
          mimeType: attachment.mime_type,
          filename: attachment.original_name,
        };
      }
    }
  }
  throw new ReimbursementAccessError(404, "Receipt file is missing.");
}
