import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { daysUntil, type ComplianceAlert } from "./compliance";
import {
  COMPANY_DOC_DIVISION,
  COMPANY_DOC_SLOTS,
  COMPANY_DOC_WARN_DAYS,
  companyDocSlot,
  companyDocSlotLabel,
  isIsoDate,
} from "./company-docs-shared";
import { getDataDir, getDb } from "./db";
import { guessMime, sanitizeName } from "./files";
import { formatDate } from "./format";

export type CompanyDocument = {
  id: number;
  division: string;
  slot: string;
  unit_type: "" | "truck" | "trailer";
  unit_id: number | null;
  original_name: string;
  stored_name: string;
  mime_type: string;
  expires_on: string;
  status: "current" | "replaced" | "retired";
  replaces_id: number | null;
  uploaded_by: string;
  created_at: string;
  ended_at: string;
  ended_by: string;
};

export type CompanyDocWithUnit = CompanyDocument & { unit_number: string };

const SELECT = `
  SELECT company_documents.*,
    COALESCE(
      CASE company_documents.unit_type
        WHEN 'truck' THEN (SELECT unit_number FROM trucks WHERE trucks.id = company_documents.unit_id)
        WHEN 'trailer' THEN (SELECT unit_number FROM trailers WHERE trailers.id = company_documents.unit_id)
      END, ''
    ) AS unit_number
  FROM company_documents`;

function companyDir(): string {
  const dir = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "company", COMPANY_DOC_DIVISION);
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

export function getCompanyDocumentPath(doc: Pick<CompanyDocument, "stored_name">): string {
  return path.join(/*turbopackIgnore: true*/ companyDir(), doc.stored_name);
}

export function getCompanyDocument(id: number): CompanyDocWithUnit | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    (getDb().prepare(`${SELECT} WHERE company_documents.id = ? AND company_documents.division = ?`).get(id, COMPANY_DOC_DIVISION) as
      | CompanyDocWithUnit
      | undefined) ?? null
  );
}

export function listCurrentCompanyDocs(slot?: string): CompanyDocWithUnit[] {
  const rows = getDb()
    .prepare(
      `${SELECT} WHERE company_documents.division = ? AND company_documents.status = 'current'
       ORDER BY company_documents.slot, company_documents.unit_type, company_documents.id DESC`,
    )
    .all(COMPANY_DOC_DIVISION) as CompanyDocWithUnit[];
  return rows.filter((row) => companyDocSlot(row.slot) && (!slot || row.slot === slot));
}

export function listCompanyDocHistory(slot: string): CompanyDocWithUnit[] {
  return getDb()
    .prepare(
      `${SELECT} WHERE company_documents.division = ? AND company_documents.slot = ?
       ORDER BY company_documents.id DESC`,
    )
    .all(COMPANY_DOC_DIVISION, slot) as CompanyDocWithUnit[];
}

export type AddCompanyDocInput = {
  slot: string;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  expiresOn: string;
  unitType?: "" | "truck" | "trailer";
  unitId?: number | null;
  /** Multi-file slots: the current file this upload replaces. */
  replacesId?: number | null;
  uploadedBy: string;
};

function validateUnit(unitType: string, unitId: number | null): void {
  if (!unitType) return;
  const table = unitType === "truck" ? "trucks" : unitType === "trailer" ? "trailers" : "";
  if (!table || !unitId) throw new Error("Pick a truck or trailer.");
  const row = getDb().prepare(`SELECT division FROM ${table} WHERE id = ?`).get(unitId) as { division?: string } | undefined;
  if (!row) throw new Error("That unit is not on file.");
  if (String(row.division ?? "MSE").toUpperCase() !== COMPANY_DOC_DIVISION) {
    throw new Error("Company docs are for MS Express units only.");
  }
}

/**
 * Adds a new current file. Single-file slots retire the prior current file to history.
 * Multi-file slots keep other files current unless `replacesId` names one.
 */
export function addCompanyDocument(input: AddCompanyDocInput): CompanyDocument {
  const slot = companyDocSlot(input.slot);
  if (!slot) throw new Error("Pick a company document slot.");
  const expiresOn = input.expiresOn.trim();
  if (!isIsoDate(expiresOn)) throw new Error("Enter the expiry date.");
  if (!input.buffer.length) throw new Error("Choose a file to upload.");
  let unitType: "" | "truck" | "trailer" = slot.unitTaggable ? (input.unitType ?? "") : "";
  let unitId = unitType ? (input.unitId ?? null) : null;
  const db = getDb();
  let replacesId: number | null = null;
  if (input.replacesId) {
    const prior = getCompanyDocument(input.replacesId);
    if (!prior || prior.slot !== slot.value || prior.status !== "current") {
      throw new Error("The file you are replacing is no longer current.");
    }
    replacesId = prior.id;
    // A replacement keeps the unit tag of the file it replaces.
    unitType = prior.unit_type;
    unitId = prior.unit_id;
  }
  validateUnit(unitType, unitId);
  const storedName = `${randomUUID()}-${sanitizeName(input.originalName || "company-doc")}`;
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(companyDir(), storedName), input.buffer);
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    if (replacesId) {
      db.prepare(
        "UPDATE company_documents SET status = 'replaced', ended_at = ?, ended_by = ? WHERE id = ? AND status = 'current'",
      ).run(now, input.uploadedBy, replacesId);
    } else if (!slot.multiple) {
      const prior = db
        .prepare(
          "SELECT id FROM company_documents WHERE division = ? AND slot = ? AND status = 'current' ORDER BY id DESC LIMIT 1",
        )
        .get(COMPANY_DOC_DIVISION, slot.value) as { id: number } | undefined;
      if (prior) {
        replacesId = prior.id;
        db.prepare(
          "UPDATE company_documents SET status = 'replaced', ended_at = ?, ended_by = ? WHERE division = ? AND slot = ? AND status = 'current'",
        ).run(now, input.uploadedBy, COMPANY_DOC_DIVISION, slot.value);
      }
    }
    const result = db
      .prepare(
        `INSERT INTO company_documents (
          division, slot, unit_type, unit_id, original_name, stored_name, mime_type, expires_on,
          status, replaces_id, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?)`,
      )
      .run(
        COMPANY_DOC_DIVISION,
        slot.value,
        unitType,
        unitId,
        input.originalName,
        storedName,
        input.mimeType || guessMime(input.originalName),
        expiresOn,
        replacesId,
        input.uploadedBy,
        now,
      );
    return Number(result.lastInsertRowid);
  });
  const id = run();
  return getCompanyDocument(id)!;
}

/** Takes a file out of the current set. It stays in history. */
export function retireCompanyDocument(id: number, by: string): void {
  const doc = getCompanyDocument(id);
  if (!doc || doc.status !== "current") throw new Error("That file is no longer current.");
  getDb()
    .prepare("UPDATE company_documents SET status = 'retired', ended_at = ?, ended_by = ? WHERE id = ?")
    .run(new Date().toISOString(), by, id);
}

export function companyDocDisplayName(doc: Pick<CompanyDocWithUnit, "slot" | "unit_type" | "unit_number">): string {
  const label = companyDocSlotLabel(doc.slot);
  if (doc.unit_type === "truck") return `${label} · Truck ${doc.unit_number}`;
  if (doc.unit_type === "trailer") return `${label} · Trailer ${doc.unit_number}`;
  return label;
}

/** Office warnings: missing required slots, expired files, and files inside the warning window. */
export function companyDocAlerts(now = new Date(), warnDays = COMPANY_DOC_WARN_DAYS): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const current = listCurrentCompanyDocs();
  for (const slot of COMPANY_DOC_SLOTS) {
    const files = current.filter((doc) => doc.slot === slot.value);
    if (slot.required && !files.length) {
      alerts.push({
        severity: "expired",
        kind: "company_doc",
        subject: "MS Express",
        label: slot.label,
        expiresOn: "",
        days: -1,
        message: `MS Express: ${slot.label} is missing. Upload it in Compliance → Company docs.`,
        href: "/compliance/company-docs",
      });
    }
    for (const doc of files) {
      const days = daysUntil(doc.expires_on, now);
      if (days == null) continue;
      const subject = companyDocDisplayName(doc);
      if (days < 0) {
        alerts.push({
          severity: "expired",
          kind: "company_doc",
          subject,
          label: slot.label,
          expiresOn: doc.expires_on,
          days,
          message: `${subject} expired ${formatDate(`${doc.expires_on}T12:00:00`)}.`,
          href: "/compliance/company-docs",
        });
      } else if (days <= warnDays) {
        alerts.push({
          severity: "expiring",
          kind: "company_doc",
          subject,
          label: slot.label,
          expiresOn: doc.expires_on,
          days,
          message: `${subject} expires in ${days} day${days === 1 ? "" : "s"} (${formatDate(`${doc.expires_on}T12:00:00`)}).`,
          href: "/compliance/company-docs",
        });
      }
    }
  }
  return alerts;
}
