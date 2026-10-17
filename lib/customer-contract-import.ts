/**
 * Plan and apply a customer-contract import.
 * Dry-run builds the report and writes nothing. --apply is the only write path.
 * Paths come from the caller. This module does not read .env.
 */

import fs from "node:fs";
import path from "node:path";
import {
  csvRecords,
  customerSlug,
  isContractSource,
  mapRequirementRow,
  matchCustomerByName,
  missingCsvHeaders,
  parseOptionalNumber,
  requirementCsvHeaders,
  termsCsvHeaders,
  type ContractSource,
  type CustomerName,
} from "./customer-contract-shared";
import {
  addCustomerContract,
  findCustomerRequirement,
  saveCustomerDetentionTerms,
  saveCustomerRequirement,
} from "./customer-contracts";
import { listCustomerAliasRefs } from "./customer-alias";
import { getDb } from "./db";

export type ImportReportLine = {
  file: "terms" | "requirements" | "pdfs";
  row: number;
  customer: string;
  action: "upsert" | "insert" | "update" | "attach" | "unmatched" | "skipped" | "missing";
  detail: string;
};

export type ImportReport = {
  apply: boolean;
  lines: ImportReportLine[];
  unmatched: string[];
};

export function formatImportReport(report: ImportReport): string {
  const counts = new Map<string, number>();
  for (const line of report.lines) {
    const key = `${line.file} ${line.action}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const summary = [...counts.entries()].map(([key, count]) => `${count} ${key}`).join(", ") || "nothing to do";
  const body = report.lines
    .map((line) => `${line.file} row ${line.row}: ${line.action} — ${line.customer || "(no name)"} — ${line.detail}`)
    .join("\n");
  const unmatched = report.unmatched.length
    ? `Unmatched customers:\n${report.unmatched.map((name) => `- ${name}`).join("\n")}`
    : "Unmatched customers: none";
  const mode = report.apply ? "Applied." : "Dry run. Nothing written.";
  return [mode, summary, unmatched, body].filter(Boolean).join("\n");
}

export function importCustomerContracts(input: {
  termsPath: string;
  requirementsPath: string;
  pdfDir: string;
  apply: boolean;
}): ImportReport {
  const termsText = readText(input.termsPath, "terms CSV");
  const requirementsText = readText(input.requirementsPath, "requirements CSV");
  const termsMissing = missingCsvHeaders(termsText, termsCsvHeaders());
  const requirementsMissing = missingCsvHeaders(requirementsText, requirementCsvHeaders());
  if (termsMissing.length) throw new Error(`Terms CSV is missing columns: ${termsMissing.join(", ")}`);
  if (requirementsMissing.length) {
    throw new Error(`Requirements CSV is missing columns: ${requirementsMissing.join(", ")}`);
  }
  if (!fs.existsSync(input.pdfDir) || !fs.statSync(input.pdfDir).isDirectory()) {
    throw new Error(`PDF folder was not found: ${input.pdfDir}`);
  }
  const customers = listCustomerNames();
  const aliases = listCustomerAliasRefs();
  const lines: ImportReportLine[] = [];
  const unmatched = new Set<string>();
  const plannedTerms = csvRecords(termsText).map((row, index) => planTerm(row, index + 2, customers, aliases));
  const plannedRequirements = csvRecords(requirementsText).map((row, index) =>
    planRequirement(row, index + 2, customers, aliases),
  );

  for (const item of plannedTerms) {
    if (item.kind === "bad") {
      lines.push({ file: "terms", row: item.row, customer: item.customer, action: "skipped", detail: item.detail });
      continue;
    }
    if (!item.customerId) {
      unmatched.add(item.customer);
      lines.push({ file: "terms", row: item.row, customer: item.customer, action: "unmatched", detail: "no customer with this name" });
    } else {
      lines.push({
        file: "terms",
        row: item.row,
        customer: item.customer,
        action: "upsert",
        detail: "detention terms",
      });
    }
    if (item.pdfFile) {
      const pdfPath = path.join(input.pdfDir, path.basename(item.pdfFile));
      if (!item.customerId) {
        lines.push({ file: "pdfs", row: item.row, customer: item.customer, action: "unmatched", detail: item.pdfFile });
      } else if (!fs.existsSync(pdfPath)) {
        lines.push({ file: "pdfs", row: item.row, customer: item.customer, action: "missing", detail: item.pdfFile });
      } else if (!item.source) {
        lines.push({ file: "pdfs", row: item.row, customer: item.customer, action: "skipped", detail: "source is required to attach a PDF" });
      } else {
        lines.push({
          file: "pdfs",
          row: item.row,
          customer: item.customer,
          action: "attach",
          detail: `${item.pdfFile} · ${item.source} · signed ${item.signedOn || "unset"}`,
        });
      }
    }
  }
  for (const item of plannedRequirements) {
    if (!item.customerId && item.customer) unmatched.add(item.customer);
    lines.push({
      file: "requirements",
      row: item.row,
      customer: item.customer,
      action: item.action,
      detail: item.detail,
    });
  }

  const report: ImportReport = { apply: input.apply, lines, unmatched: [...unmatched].sort() };
  if (!input.apply) return report;

  const write = getDb().transaction(() => {
    for (const item of plannedTerms) {
      if (item.kind !== "ok" || !item.customerId) continue;
      saveCustomerDetentionTerms(item.customerId, item.terms);
      if (!item.pdfFile || !item.source) continue;
      const pdfPath = path.join(input.pdfDir, path.basename(item.pdfFile));
      if (!fs.existsSync(pdfPath)) continue;
      const originalName = path.basename(item.pdfFile);
      const existing = getDb()
        .prepare(
          `SELECT id FROM customer_contracts
           WHERE customer_id = ? AND original_name = ? AND signed_on = ? AND source = ?`,
        )
        .get(item.customerId, originalName, item.signedOn, item.source);
      if (existing) continue;
      addCustomerContract({
        customerId: item.customerId,
        originalName,
        buffer: fs.readFileSync(pdfPath),
        mimeType: "application/pdf",
        signedOn: item.signedOn,
        source: item.source,
      });
    }
    for (const item of plannedRequirements) {
      if (!item.customerId || !item.mapped) continue;
      const existing = findCustomerRequirement(item.customerId, item.mapped);
      saveCustomerRequirement(item.customerId, { ...item.mapped, id: existing?.id });
    }
  });
  write();
  return report;
}

type PlannedTerm =
  | { kind: "bad"; row: number; customer: string; detail: string }
  | {
      kind: "ok";
      row: number;
      customer: string;
      customerId: number | null;
      pdfFile: string;
      source: ContractSource | null;
      signedOn: string;
      terms: {
        ratePerHour: number | null;
        freeHours: number | null;
        billingIncrementMinutes: number | null;
        capPerDay: number | null;
        capPerStop: number | null;
        noticeLeadMinutes: number | null;
        conditions: string;
      };
    };

function planTerm(
  row: Record<string, string>,
  rowNumber: number,
  customers: CustomerName[],
  aliases: Array<{ customerId: number; name: string; normalized: string }> = [],
): PlannedTerm {
  const customer = String(row.customer_name ?? "").trim();
  const numbers = {
    rate_per_hour: row.rate_per_hour,
    free_hours: row.free_hours,
    billing_increment_minutes: row.billing_increment_minutes,
    cap_per_day: row.cap_per_day,
    cap_per_stop: row.cap_per_stop,
    notice_lead_minutes: row.notice_lead_minutes,
  };
  for (const [key, value] of Object.entries(numbers)) {
    if (String(value ?? "").trim() && parseOptionalNumber(value) == null) {
      return { kind: "bad", row: rowNumber, customer, detail: `${key} is not a number` };
    }
  }
  const sourceRaw = String(row.source ?? "").trim().toLowerCase();
  if (sourceRaw && !isContractSource(sourceRaw)) {
    return { kind: "bad", row: rowNumber, customer, detail: `source ${sourceRaw} is not Highway, MyCarrierPackets, RMIS, Assure, or other` };
  }
  const signedOn = String(row.signed_on ?? "").trim();
  if (signedOn && !/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) {
    return { kind: "bad", row: rowNumber, customer, detail: "signed_on uses YYYY-MM-DD" };
  }
  const match = customer ? matchCustomerByName(customer, customers, aliases) : null;
  return {
    kind: "ok",
    row: rowNumber,
    customer: customer || "(blank)",
    customerId: match?.id ?? null,
    pdfFile: String(row.pdf_file ?? "").trim(),
    source: isContractSource(sourceRaw) ? sourceRaw : null,
    signedOn,
    terms: {
      ratePerHour: parseOptionalNumber(row.rate_per_hour),
      freeHours: parseOptionalNumber(row.free_hours),
      billingIncrementMinutes: parseOptionalNumber(row.billing_increment_minutes),
      capPerDay: parseOptionalNumber(row.cap_per_day),
      capPerStop: parseOptionalNumber(row.cap_per_stop),
      noticeLeadMinutes: parseOptionalNumber(row.notice_lead_minutes),
      conditions: String(row.conditions ?? "").trim(),
    },
  };
}

function planRequirement(
  row: Record<string, string>,
  rowNumber: number,
  customers: CustomerName[],
  aliases: Array<{ customerId: number; name: string; normalized: string }> = [],
) {
  const customer = String(row.customer_slug ?? "").trim();
  const match = customer ? matchCustomerByName(customer, customers, aliases) : null;
  const mapped = mapRequirementRow(row);
  if (!customer) {
    return { row: rowNumber, customer: "(blank)", customerId: null, action: "skipped" as const, detail: "customer_slug is blank", mapped: null };
  }
  if (!match) {
    return { row: rowNumber, customer, customerId: null, action: "unmatched" as const, detail: "no customer with this name", mapped: null };
  }
  if (!mapped.ok) {
    return { row: rowNumber, customer, customerId: match.id, action: "skipped" as const, detail: mapped.reason, mapped: null };
  }
  const existing = findCustomerRequirement(match.id, mapped.value);
  return {
    row: rowNumber,
    customer,
    customerId: match.id,
    action: existing ? ("update" as const) : ("insert" as const),
    detail: `${mapped.value.trigger}: ${mapped.value.requirement}`,
    mapped: mapped.value,
  };
}

function listCustomerNames(): CustomerName[] {
  return getDb()
    .prepare("SELECT id, name FROM customers WHERE archived_at IS NULL ORDER BY id")
    .all() as CustomerName[];
}

function readText(filePath: string, label: string): string {
  if (!fs.existsSync(filePath)) throw new Error(`${label} was not found: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

export function customerSlugFor(name: string): string {
  return customerSlug(name);
}
