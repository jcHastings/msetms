import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDataDir, getDb } from "./db";
import { getPaystubUploadToken } from "./env";
import { sanitizeName } from "./files";
import { extractFuelPdfText } from "./fuel-pdf";
import {
  PAYSTUB_MAX_FILES,
  PAYSTUB_MAX_PDF_BYTES,
  decidePaystub,
  matchPaystubEmployee,
  normalizePayDate,
  normalizePayMoney,
  parsePaystubText,
  previewDriverId,
  type ParsedPaystub,
  type PaystubDecision,
  type PaystubDriverCandidate,
  type PaystubPreviewRow,
  type PaystubQueueRow,
} from "./paystub-shared";

export type PaystubUploadFileResult = {
  file: string;
  status: "stored" | "needs_review" | "duplicate" | "error";
  reason?: string;
  paystubId?: number;
  existingId?: number;
  driverId?: number | null;
  employeeName?: string;
  payDate?: string;
  periodStart?: string;
  periodEnd?: string;
  gross?: string;
  net?: string;
  matchState?: string;
};

export type PaystubUploadResponse = {
  ok: boolean;
  error?: string;
  runId?: number;
  summary?: { stored: boolean; name: string; reason?: string } | null;
  files: PaystubUploadFileResult[];
};

export type PaystubOverride = {
  file?: string;
  driverId?: number | null;
  payDate?: string;
  periodStart?: string;
  periodEnd?: string;
  gross?: string;
  net?: string;
};

export class PaystubHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type StoredPaystub = {
  id: number;
  run_id: number | null;
  driver_id: number | null;
  suggested_driver_id: number | null;
  status: string;
  match_state: string;
  employee_name: string;
  pay_date: string;
  period_start: string;
  period_end: string;
  gross: string;
  net: string;
  original_name: string;
  stored_name: string;
  sha256: string;
  mime_type: string;
  review_reason: string;
  created_at: string;
  updated_at: string;
};

type PreviewManifest = {
  id: string;
  createdAt: string;
  summary: { originalName: string; storedName: string; sha256: string; mime: string } | null;
  rows: Array<{ key: string; fileName: string; storedName: string }>;
};

let tokenOverride: { value: string | undefined } | null = null;

export function setPaystubUploadTokenForTests(token: string | undefined | null): void {
  tokenOverride = token === null ? null : { value: token?.trim() ? token.trim() : undefined };
}

export function paystubUploadToken(): string | undefined {
  if (tokenOverride) return tokenOverride.value;
  const value = getPaystubUploadToken();
  return value?.trim() ? value.trim() : undefined;
}

export function paystubTokensMatch(expected: string, provided: string): boolean {
  const left = createHash("sha256").update(expected, "utf8").digest();
  const right = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? "";
}

export function authorizePaystubUploadToken(
  expected: string | undefined,
  provided: string,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  if (!expected) return { ok: false, status: 503, error: "Paystub upload is disabled." };
  if (!paystubTokensMatch(expected, provided)) return { ok: false, status: 401, error: "Unauthorized." };
  return { ok: true };
}

function paystubRoot(...parts: string[]): string {
  const dir = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "paystubs", ...parts);
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function isPdfBuffer(buffer: Buffer, name: string, mime: string): boolean {
  const header = buffer.subarray(0, 5).toString("latin1");
  if (!header.startsWith("%PDF")) return false;
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  return lowerName.endsWith(".pdf") || lowerMime.includes("pdf") || header.startsWith("%PDF");
}

function isSummaryFile(buffer: Buffer, name: string, mime: string): boolean {
  if (isPdfBuffer(buffer, name, mime)) return true;
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  return lowerName.endsWith(".csv") || lowerMime.includes("csv");
}

export function listPaystubDrivers(): PaystubDriverCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, driver_type
       FROM drivers
       WHERE active != 0
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ id: number; name: string; driver_type: string }>;
  return rows.map((driver) => ({ id: driver.id, name: driver.name, driverType: driver.driver_type }));
}

function driverCandidates(): PaystubDriverCandidate[] {
  return listPaystubDrivers();
}

function existingSha(hash: string): number | null {
  const row = getDb().prepare("SELECT id FROM paystubs WHERE sha256 = ?").get(hash) as { id: number } | undefined;
  return row?.id ?? null;
}

function existingDriverDate(driverId: number, payDate: string, exceptId?: number): number | null {
  const row = getDb()
    .prepare(
      `SELECT id FROM paystubs
       WHERE driver_id = ? AND pay_date = ? AND status = 'stored' AND id != ?
       LIMIT 1`,
    )
    .get(driverId, payDate, exceptId ?? 0) as { id: number } | undefined;
  return row?.id ?? null;
}

export async function readPaystubPdfText(buffer: Buffer): Promise<string> {
  return extractFuelPdfText(buffer);
}

function officeFields(edit: {
  employeeName?: string;
  payDate?: string;
  periodStart?: string;
  periodEnd?: string;
  gross?: string;
  net?: string;
}, parsed: ParsedPaystub): ParsedPaystub {
  return {
    employeeName: edit.employeeName?.trim() || parsed.employeeName,
    payDate: normalizePayDate(edit.payDate ?? ""),
    periodStart: normalizePayDate(edit.periodStart ?? ""),
    periodEnd: normalizePayDate(edit.periodEnd ?? ""),
    gross: normalizePayMoney(edit.gross ?? ""),
    net: normalizePayMoney(edit.net ?? ""),
  };
}

function applyApiOverride(parsed: ParsedPaystub, override?: PaystubOverride): ParsedPaystub {
  if (!override) return parsed;
  return {
    employeeName: parsed.employeeName,
    payDate: override.payDate != null && override.payDate.trim() ? normalizePayDate(override.payDate) : parsed.payDate,
    periodStart:
      override.periodStart != null && override.periodStart.trim()
        ? normalizePayDate(override.periodStart)
        : parsed.periodStart,
    periodEnd:
      override.periodEnd != null && override.periodEnd.trim() ? normalizePayDate(override.periodEnd) : parsed.periodEnd,
    gross: override.gross != null && override.gross.trim() ? normalizePayMoney(override.gross) : parsed.gross,
    net: override.net != null && override.net.trim() ? normalizePayMoney(override.net) : parsed.net,
  };
}

async function decisionForBuffer(input: {
  buffer: Buffer;
  name: string;
  mime: string;
  drivers: PaystubDriverCandidate[];
  override?: PaystubOverride;
  office?: boolean;
  officeEdit?: {
    employeeName?: string;
    payDate?: string;
    periodStart?: string;
    periodEnd?: string;
    gross?: string;
    net?: string;
    driverId?: number | null;
  };
  batchSha: Set<string>;
  batchDriverDate: Set<string>;
  exceptId?: number;
}): Promise<{ decision: PaystubDecision; hash: string }> {
  if (!input.buffer.length) {
    return {
      hash: "",
      decision: blankDecision("This file is empty."),
    };
  }
  if (input.buffer.length > PAYSTUB_MAX_PDF_BYTES) {
    return { hash: sha256(input.buffer), decision: blankDecision("PDF is larger than 15 MB.") };
  }
  if (!isPdfBuffer(input.buffer, input.name, input.mime)) {
    return { hash: sha256(input.buffer), decision: blankDecision("PDF only.") };
  }
  const hash = sha256(input.buffer);
  const inBatch = input.batchSha.has(hash);
  const duplicateFileId = inBatch ? -1 : existingSha(hash);
  let parsed: ParsedPaystub;
  try {
    parsed = parsePaystubText(await readPaystubPdfText(input.buffer));
  } catch {
    return { hash, decision: blankDecision("Could not read this PDF.") };
  }
  const fields = input.office && input.officeEdit ? officeFields(input.officeEdit, parsed) : applyApiOverride(parsed, input.override);
  const selectedDriver = input.office ? (input.officeEdit?.driverId ?? null) : driverIdFromOverride(input.override);
  const auto = matchPaystubEmployee(fields.employeeName, input.drivers);
  const blockAutoMatch = Boolean(input.office && selectedDriver == null);
  const overrideDriverId =
    selectedDriver == null ? undefined : !input.office || selectedDriver !== auto.driverId ? selectedDriver : undefined;
  const probe = decidePaystub({
    parsed: fields,
    drivers: input.drivers,
    overrideDriverId,
    blockAutoMatch,
    duplicateFileId,
  });
  const driverForDate = probe.attachDriverId ?? probe.suggestedDriverId;
  const dateKey = driverForDate && fields.payDate ? `${driverForDate}|${fields.payDate}` : "";
  const duplicatePayDateId = dateKey
    ? input.batchDriverDate.has(dateKey)
      ? -1
      : existingDriverDate(driverForDate as number, fields.payDate, input.exceptId)
    : null;
  const decision = decidePaystub({
    parsed: fields,
    drivers: input.drivers,
    overrideDriverId,
    blockAutoMatch,
    duplicateFileId,
    duplicatePayDate: Boolean(duplicatePayDateId),
    duplicatePayDateId: duplicatePayDateId && duplicatePayDateId > 0 ? duplicatePayDateId : null,
  });
  if (hash) input.batchSha.add(hash);
  if (decision.outcome === "stored" && decision.attachDriverId && decision.payDate) {
    input.batchDriverDate.add(`${decision.attachDriverId}|${decision.payDate}`);
  }
  return { decision, hash };
}

function driverIdFromOverride(override?: PaystubOverride): number | null {
  if (!override || override.driverId == null || Number.isNaN(override.driverId)) return null;
  return override.driverId;
}

function blankDecision(reason: string): PaystubDecision {
  return {
    outcome: "error",
    queue: false,
    attachDriverId: null,
    suggestedDriverId: null,
    matchState: "unmatched",
    reason,
    employeeName: "",
    payDate: "",
    periodStart: "",
    periodEnd: "",
    gross: "",
    net: "",
  };
}

function resultFromDecision(file: string, decision: PaystubDecision, paystubId?: number): PaystubUploadFileResult {
  return {
    file,
    status: decision.outcome,
    reason: decision.reason || undefined,
    paystubId,
    existingId: decision.existingId && decision.existingId > 0 ? decision.existingId : undefined,
    driverId: decision.outcome === "stored" ? decision.attachDriverId : null,
    employeeName: decision.employeeName || undefined,
    payDate: decision.payDate || undefined,
    periodStart: decision.periodStart || undefined,
    periodEnd: decision.periodEnd || undefined,
    gross: decision.gross || undefined,
    net: decision.net || undefined,
    matchState: decision.matchState,
  };
}

function insertPaystub(input: {
  runId: number;
  decision: PaystubDecision;
  originalName: string;
  storedName: string;
  hash: string;
  now: string;
}): number {
  const status = input.decision.outcome === "stored" ? "stored" : "needs_review";
  const result = getDb()
    .prepare(
      `INSERT INTO paystubs (
         run_id, driver_id, suggested_driver_id, status, match_state, employee_name,
         pay_date, period_start, period_end, gross, net, original_name, stored_name,
         sha256, mime_type, review_reason, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?)`,
    )
    .run(
      input.runId,
      status === "stored" ? input.decision.attachDriverId : null,
      input.decision.suggestedDriverId,
      status,
      input.decision.matchState,
      input.decision.employeeName,
      input.decision.payDate,
      input.decision.periodStart,
      input.decision.periodEnd,
      input.decision.gross,
      input.decision.net,
      input.originalName,
      input.storedName,
      input.hash,
      input.decision.reason,
      input.now,
      input.now,
    );
  return Number(result.lastInsertRowid);
}

function writePdf(buffer: Buffer): string {
  const storedName = `${randomUUID()}.pdf`;
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(paystubRoot("files"), storedName), buffer);
  return storedName;
}

function createRun(uploadedBy: string, source: string, summary: PreviewManifest["summary"], now: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO paystub_runs (
         uploaded_by, source, created_at, summary_original_name, summary_stored_name, summary_sha256, summary_mime
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uploadedBy,
      source,
      now,
      summary?.originalName ?? "",
      summary?.storedName ?? "",
      summary?.sha256 ?? "",
      summary?.mime ?? "",
    );
  return Number(result.lastInsertRowid);
}

export async function ingestUploadedPaystubs(input: {
  files: Array<{ name: string; type: string; buffer: Buffer }>;
  summary: { name: string; type: string; buffer: Buffer } | null;
  overrides: PaystubOverride[];
  shorthand: PaystubOverride | null;
  uploadedBy: string;
}): Promise<PaystubUploadResponse> {
  if (input.files.length === 0) throw new PaystubHttpError(400, "Choose at least one PDF.");
  if (input.files.length > PAYSTUB_MAX_FILES) {
    throw new PaystubHttpError(400, `Upload ${PAYSTUB_MAX_FILES} PDFs or fewer at a time.`);
  }
  let summaryMeta: PreviewManifest["summary"] = null;
  if (input.summary) {
    if (input.summary.buffer.length > PAYSTUB_MAX_PDF_BYTES) {
      throw new PaystubHttpError(400, "The payroll summary is larger than 15 MB.");
    }
    if (!isSummaryFile(input.summary.buffer, input.summary.name, input.summary.type)) {
      throw new PaystubHttpError(400, "The payroll summary must be a PDF or CSV.");
    }
  }
  const drivers = driverCandidates();
  const batchSha = new Set<string>();
  const batchDriverDate = new Set<string>();
  const now = new Date().toISOString();
  const prepared: Array<{ file: { name: string; type: string; buffer: Buffer }; decision: PaystubDecision; hash: string }> = [];
  const nameCounts = new Map<string, number>();
  for (const file of input.files) {
    const seen = nameCounts.get(file.name) ?? 0;
    nameCounts.set(file.name, seen + 1);
    const named = input.overrides.filter((item) => item.file && item.file === file.name);
    const override = named[seen] ?? (named.length ? named[named.length - 1] : input.shorthand ?? undefined);
    const { decision, hash } = await decisionForBuffer({
      buffer: file.buffer,
      name: file.name,
      mime: file.type,
      drivers,
      override,
      batchSha,
      batchDriverDate,
    });
    prepared.push({ file, decision, hash });
  }
  const shouldKeep = prepared.some((item) => item.decision.outcome === "stored" || item.decision.queue);
  let runId: number | undefined;
  if (shouldKeep) {
    if (input.summary) {
      const ext = input.summary.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
      const storedName = `${randomUUID()}.${ext}`;
      fs.writeFileSync(/*turbopackIgnore: true*/ path.join(paystubRoot("summaries"), storedName), input.summary.buffer);
      summaryMeta = {
        originalName: sanitizeName(input.summary.name || `summary.${ext}`),
        storedName,
        sha256: sha256(input.summary.buffer),
        mime: ext === "csv" ? "text/csv" : "application/pdf",
      };
    }
    runId = createRun(input.uploadedBy, "api", summaryMeta, now);
  }
  const files: PaystubUploadFileResult[] = [];
  for (const item of prepared) {
    if (!runId || (!item.decision.queue && item.decision.outcome !== "stored")) {
      files.push(resultFromDecision(item.file.name, item.decision));
      continue;
    }
    try {
      const storedName = writePdf(item.file.buffer);
      const paystubId = insertPaystub({
        runId,
        decision: item.decision,
        originalName: sanitizeName(item.file.name || "paystub.pdf"),
        storedName,
        hash: item.hash,
        now,
      });
      files.push(resultFromDecision(item.file.name, item.decision, paystubId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/UNIQUE/i.test(message)) {
        files.push(
          resultFromDecision(item.file.name, {
            ...item.decision,
            outcome: "duplicate",
            queue: false,
            reason: "This file was already uploaded.",
            matchState: "duplicate_file",
          }),
        );
        continue;
      }
      throw error;
    }
  }
  return {
    ok: true,
    runId,
    summary: input.summary
      ? {
          stored: Boolean(summaryMeta),
          name: input.summary.name,
          reason: summaryMeta ? undefined : "No paystubs were saved, so the summary was not stored.",
        }
      : null,
    files,
  };
}

function sweepOldPreviews(): void {
  const dir = paystubRoot("inbox");
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
    const full = path.join(/*turbopackIgnore: true*/ dir, entry);
    try {
      const stat = fs.statSync(/*turbopackIgnore: true*/ full);
      if (stat.isDirectory() && stat.mtimeMs < cutoff) fs.rmSync(/*turbopackIgnore: true*/ full, { recursive: true, force: true });
    } catch {
      // A busy preview directory can wait until the next sweep.
    }
  }
}

export async function previewPaystubUpload(input: {
  files: Array<{ name: string; type: string; buffer: Buffer }>;
  summary: { name: string; type: string; buffer: Buffer } | null;
}): Promise<{ previewId: string; summaryName: string; rows: PaystubPreviewRow[] }> {
  if (input.files.length === 0) throw new PaystubHttpError(400, "Choose at least one PDF.");
  if (input.files.length > PAYSTUB_MAX_FILES) {
    throw new PaystubHttpError(400, `Upload ${PAYSTUB_MAX_FILES} PDFs or fewer at a time.`);
  }
  if (input.summary) {
    if (input.summary.buffer.length > PAYSTUB_MAX_PDF_BYTES) {
      throw new PaystubHttpError(400, "The payroll summary is larger than 15 MB.");
    }
    if (!isSummaryFile(input.summary.buffer, input.summary.name, input.summary.type)) {
      throw new PaystubHttpError(400, "The payroll summary must be a PDF or CSV.");
    }
  }
  sweepOldPreviews();
  const previewId = randomUUID();
  const dir = paystubRoot("inbox", previewId);
  const drivers = driverCandidates();
  const batchSha = new Set<string>();
  const batchDriverDate = new Set<string>();
  const rows: PaystubPreviewRow[] = [];
  const manifestRows: PreviewManifest["rows"] = [];
  for (const file of input.files) {
    const { decision, hash } = await decisionForBuffer({
      buffer: file.buffer,
      name: file.name,
      mime: file.type,
      drivers,
      batchSha,
      batchDriverDate,
    });
    const storedName = `${randomUUID()}.pdf`;
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, storedName), file.buffer);
    const key = hash || randomUUID();
    manifestRows.push({ key, fileName: file.name || "paystub.pdf", storedName });
    rows.push({
      key,
      fileName: file.name || "paystub.pdf",
      employeeName: decision.employeeName,
      payDate: decision.payDate,
      periodStart: decision.periodStart,
      periodEnd: decision.periodEnd,
      gross: decision.gross,
      net: decision.net,
      matchState: decision.matchState,
      driverId: previewDriverId(decision),
      reason: decision.reason,
      locked: decision.matchState === "duplicate_file",
    });
  }
  let summary: PreviewManifest["summary"] = null;
  if (input.summary) {
    const ext = input.summary.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
    const storedName = `${randomUUID()}.${ext}`;
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, storedName), input.summary.buffer);
    summary = {
      originalName: input.summary.name || `summary.${ext}`,
      storedName,
      sha256: sha256(input.summary.buffer),
      mime: ext === "csv" ? "text/csv" : "application/pdf",
    };
  }
  const manifest: PreviewManifest = { id: previewId, createdAt: new Date().toISOString(), summary, rows: manifestRows };
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return { previewId, summaryName: summary?.originalName ?? "", rows };
}

function readManifest(previewId: string): { dir: string; manifest: PreviewManifest } | null {
  if (!/^[0-9a-f-]{36}$/i.test(previewId)) return null;
  const dir = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "paystubs", "inbox", previewId);
  const file = path.join(/*turbopackIgnore: true*/ dir, "manifest.json");
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  const manifest = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as PreviewManifest;
  return { dir, manifest };
}

export type OfficePaystubEdit = {
  key: string;
  driverId: number | null;
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  skip: boolean;
};

export async function commitPaystubPreview(input: {
  previewId: string;
  rows: OfficePaystubEdit[];
  uploadedBy: string;
}): Promise<{ ok: true; runId?: number; saved: number; results: PaystubUploadFileResult[] }> {
  const loaded = readManifest(input.previewId);
  if (!loaded) throw new PaystubHttpError(400, "That upload expired. Drop the PDFs again.");
  const drivers = driverCandidates();
  const batchSha = new Set<string>();
  const batchDriverDate = new Set<string>();
  const now = new Date().toISOString();
  const results: PaystubUploadFileResult[] = [];
  const pending: Array<{ edit: OfficePaystubEdit; decision: PaystubDecision; hash: string; buffer: Buffer }> = [];
  for (const edit of input.rows) {
    const row = loaded.manifest.rows.find((item) => item.key === edit.key);
    if (!row) {
      results.push({ file: edit.key, status: "error", reason: "That file is no longer in this upload." });
      continue;
    }
    if (edit.skip) {
      results.push({ file: row.fileName, status: "needs_review", reason: "Skipped." });
      continue;
    }
    const buffer = fs.readFileSync(/*turbopackIgnore: true*/ path.join(loaded.dir, row.storedName));
    const { decision, hash } = await decisionForBuffer({
      buffer,
      name: row.fileName,
      mime: "application/pdf",
      drivers,
      office: true,
      officeEdit: edit,
      batchSha,
      batchDriverDate,
    });
    if (decision.outcome !== "stored") {
      results.push(resultFromDecision(row.fileName, decision));
      continue;
    }
    pending.push({ edit, decision, hash, buffer });
  }
  let runId: number | undefined;
  if (pending.length) {
    let summary = loaded.manifest.summary;
    if (summary) {
      const from = path.join(/*turbopackIgnore: true*/ loaded.dir, summary.storedName);
      const dest = path.join(paystubRoot("summaries"), summary.storedName);
      fs.copyFileSync(/*turbopackIgnore: true*/ from, /*turbopackIgnore: true*/ dest);
    }
    runId = createRun(input.uploadedBy, "office", summary, now);
    for (const item of pending) {
      const storedName = writePdf(item.buffer);
      const paystubId = insertPaystub({
        runId,
        decision: item.decision,
        originalName: sanitizeName(item.edit.key ? loaded.manifest.rows.find((row) => row.key === item.edit.key)?.fileName || "paystub.pdf" : "paystub.pdf"),
        storedName,
        hash: item.hash,
        now,
      });
      results.push(resultFromDecision(loaded.manifest.rows.find((row) => row.key === item.edit.key)?.fileName || "paystub.pdf", item.decision, paystubId));
    }
  }
  const savedKeys = new Set(pending.map((item) => item.edit.key));
  const skipped = new Set(input.rows.filter((row) => row.skip).map((row) => row.key));
  loaded.manifest.rows = loaded.manifest.rows.filter((row) => !savedKeys.has(row.key) && !skipped.has(row.key));
  if (loaded.manifest.rows.length === 0) {
    fs.rmSync(/*turbopackIgnore: true*/ loaded.dir, { recursive: true, force: true });
  } else {
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(loaded.dir, "manifest.json"), JSON.stringify(loaded.manifest));
  }
  return { ok: true, runId, saved: pending.length, results };
}

export function listPaystubReviewQueue(): PaystubQueueRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, original_name, employee_name, pay_date, period_start, period_end, gross, net,
              match_state, suggested_driver_id, review_reason
       FROM paystubs
       WHERE status = 'needs_review'
       ORDER BY created_at DESC, id DESC`,
    )
    .all() as Array<{
    id: number;
    original_name: string;
    employee_name: string;
    pay_date: string;
    period_start: string;
    period_end: string;
    gross: string;
    net: string;
    match_state: string;
    suggested_driver_id: number | null;
    review_reason: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    fileName: row.original_name,
    employeeName: row.employee_name,
    payDate: row.pay_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    gross: row.gross,
    net: row.net,
    matchState: row.match_state,
    suggestedDriverId: row.suggested_driver_id,
    reason: row.review_reason,
  }));
}

export async function commitPaystubQueue(input: {
  rows: Array<OfficePaystubEdit & { id: number }>;
  uploadedBy: string;
}): Promise<{ ok: true; saved: number; results: PaystubUploadFileResult[] }> {
  const drivers = driverCandidates();
  const batchSha = new Set<string>();
  const batchDriverDate = new Set<string>();
  const now = new Date().toISOString();
  const results: PaystubUploadFileResult[] = [];
  let saved = 0;
  for (const edit of input.rows) {
    const current = getDb().prepare("SELECT * FROM paystubs WHERE id = ?").get(edit.id) as StoredPaystub | undefined;
    if (!current || current.status !== "needs_review") {
      results.push({ file: edit.employeeName || String(edit.id), status: "error", reason: "That paystub is not in the review queue." });
      continue;
    }
    const filePath = paystubFilePath(current.stored_name);
    if (edit.skip) {
      getDb().prepare("DELETE FROM paystubs WHERE id = ? AND status = 'needs_review'").run(edit.id);
      if (filePath && fs.existsSync(/*turbopackIgnore: true*/ filePath)) fs.rmSync(/*turbopackIgnore: true*/ filePath);
      results.push({ file: current.original_name, status: "needs_review", reason: "Skipped." });
      continue;
    }
    if (!filePath) {
      results.push({ file: current.original_name, status: "error", reason: "The PDF file is missing." });
      continue;
    }
    const buffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);
    const { decision } = await decisionForBuffer({
      buffer,
      name: current.original_name,
      mime: "application/pdf",
      drivers,
      office: true,
      officeEdit: edit,
      batchSha,
      batchDriverDate,
      exceptId: current.id,
    });
    if (decision.outcome === "stored" && decision.attachDriverId) {
      getDb()
        .prepare(
          `UPDATE paystubs
           SET driver_id = ?, suggested_driver_id = ?, status = 'stored', match_state = ?, employee_name = ?,
               pay_date = ?, period_start = ?, period_end = ?, gross = ?, net = ?, review_reason = '', updated_at = ?
           WHERE id = ?`,
        )
        .run(
          decision.attachDriverId,
          decision.suggestedDriverId,
          decision.matchState,
          decision.employeeName,
          decision.payDate,
          decision.periodStart,
          decision.periodEnd,
          decision.gross,
          decision.net,
          now,
          current.id,
        );
      saved += 1;
      results.push(resultFromDecision(current.original_name, decision, current.id));
      continue;
    }
    getDb()
      .prepare(
        `UPDATE paystubs
         SET driver_id = NULL, suggested_driver_id = ?, match_state = ?, employee_name = ?,
             pay_date = ?, period_start = ?, period_end = ?, gross = ?, net = ?, review_reason = ?, updated_at = ?
         WHERE id = ? AND status = 'needs_review'`,
      )
      .run(
        decision.suggestedDriverId,
        decision.matchState,
        decision.employeeName,
        decision.payDate,
        decision.periodStart,
        decision.periodEnd,
        decision.gross,
        decision.net,
        decision.reason,
        now,
        current.id,
      );
    results.push(resultFromDecision(current.original_name, decision, current.id));
  }
  return { ok: true, saved, results };
}

export function listDriverPaystubs(driverId: number): StoredPaystub[] {
  return getDb()
    .prepare(
      `SELECT * FROM paystubs
       WHERE driver_id = ? AND status = 'stored'
       ORDER BY pay_date DESC, id DESC`,
    )
    .all(driverId) as StoredPaystub[];
}

export function getPaystubRow(id: number): StoredPaystub | null {
  return (getDb().prepare("SELECT * FROM paystubs WHERE id = ?").get(id) as StoredPaystub | undefined) ?? null;
}

export function paystubFilePath(storedName: string): string | null {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(storedName)) return null;
  return path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "paystubs", "files", storedName);
}

export function readPaystubPdf(storedName: string): Buffer | null {
  const file = paystubFilePath(storedName);
  if (!file || !fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  return fs.readFileSync(/*turbopackIgnore: true*/ file);
}

export function companyDriversForPaystubPicker(): Array<{ id: number; name: string }> {
  return driverCandidates()
    .filter((driver) => driver.driverType !== "owner_operator")
    .map((driver) => ({ id: driver.id, name: driver.name }));
}

export function parsePaystubOverrides(raw: string): PaystubOverride[] {
  if (!raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PaystubHttpError(400, "overrides must be a JSON array.");
  }
  if (!Array.isArray(parsed)) throw new PaystubHttpError(400, "overrides must be a JSON array.");
  return parsed.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const driverRaw = row.driver_id ?? row.driverId;
    const driverId = driverRaw == null || driverRaw === "" ? undefined : Number(driverRaw);
    return {
      file: row.file != null ? String(row.file) : undefined,
      driverId: driverId == null || Number.isNaN(driverId) ? undefined : driverId,
      payDate: row.pay_date != null ? String(row.pay_date) : row.payDate != null ? String(row.payDate) : undefined,
      periodStart:
        row.period_start != null ? String(row.period_start) : row.periodStart != null ? String(row.periodStart) : undefined,
      periodEnd: row.period_end != null ? String(row.period_end) : row.periodEnd != null ? String(row.periodEnd) : undefined,
      gross: row.gross != null ? String(row.gross) : undefined,
      net: row.net != null ? String(row.net) : undefined,
    };
  });
}

export function shorthandOverride(form: FormData): PaystubOverride | null {
  const driverRaw = String(form.get("driver_id") ?? form.get("driverId") ?? "").trim();
  const payDate = String(form.get("pay_date") ?? form.get("payDate") ?? "").trim();
  const periodStart = String(form.get("period_start") ?? form.get("periodStart") ?? "").trim();
  const periodEnd = String(form.get("period_end") ?? form.get("periodEnd") ?? "").trim();
  const gross = String(form.get("gross") ?? "").trim();
  const net = String(form.get("net") ?? "").trim();
  if (!driverRaw && !payDate && !periodStart && !periodEnd && !gross && !net) return null;
  return {
    driverId: driverRaw ? Number(driverRaw) : undefined,
    payDate: payDate || undefined,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
    gross: gross || undefined,
    net: net || undefined,
  };
}

export async function filesFromForm(form: FormData): Promise<{
  files: Array<{ name: string; type: string; buffer: Buffer }>;
  summary: { name: string; type: string; buffer: Buffer } | null;
}> {
  const files: Array<{ name: string; type: string; buffer: Buffer }> = [];
  for (const field of ["file", "files", "pdf", "pdfs"]) {
    for (const value of form.getAll(field)) {
      if (!(value instanceof File) || !value.name) continue;
      files.push({ name: value.name, type: value.type || "", buffer: Buffer.from(await value.arrayBuffer()) });
    }
  }
  const summaryValue = form.get("summary");
  const summary =
    summaryValue instanceof File && summaryValue.name
      ? { name: summaryValue.name, type: summaryValue.type || "", buffer: Buffer.from(await summaryValue.arrayBuffer()) }
      : null;
  return { files, summary };
}
