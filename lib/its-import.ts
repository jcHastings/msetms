/**
 * ITS "All Loads shipped between …" upsert.
 * Every row is an MS Express load. The Customer column is only the bill-to.
 * This module does not send mail, SMS, WhatsApp, driver notifications, or invoices,
 * and it does not queue QuickBooks.
 */

import fs from "node:fs";
import path from "node:path";
import { recordLoadAudit, recordLoadChanges } from "./audit";
import { getDb } from "./db";
import {
  calendarDay,
  exportIsStale,
  inactiveTrailerUnit,
  ITS_IMPORT_ISSUES,
  itsImportExceptionKey,
  looksLikeCompanyName,
  matchItsDriver,
  matchItsUnit,
  normalizePersonName,
  normalizeUnitKey,
  resolveExportSnapshot,
  type ExportSnapshotSource,
  type ItsImportIssue,
  type UnitMatch,
} from "./its-import-shared";
import {
  isPlausibleLoadNumber,
  mapLoadRecord,
  recordsFromLoadSheetText,
  statusMovesBackwards,
  type ImportedStop,
  type LoadImportValues,
} from "./load-import-shared";
import {
  createCustomer,
  createDriver,
  createTrailer,
  createTruck,
  findLoadIdByNumber,
  getLoad,
  listCustomers,
  listDrivers,
  listTrailers,
  listTrucks,
} from "./queries";
import { recordsFromLoadWorkbook, xlsxDocumentTimestamps } from "./xlsx-first-sheet";
import type { LoadView } from "./types";

const DIFF_SAMPLE_LIMIT = 12;
const ISSUE_CODES = Object.keys(ITS_IMPORT_ISSUES) as ItsImportIssue[];

export type ItsImportOptions = {
  apply: boolean;
  msTrailerAlias: boolean;
  importRate: boolean;
  createInactiveUnits: boolean;
  snapshot: string | null;
  fileName?: string;
};

export type ItsFieldDiff = {
  load_number: string;
  field: string;
  from: string;
  to: string;
};

export type ItsYearCounts = {
  added: number;
  updated: number;
  unchanged: number;
  exceptions: number;
  skipped_tms_newer: number;
};

export type ItsInactivePlan = {
  name: string;
  loads: string[];
};

export type ItsReassignment = {
  load_number: string;
  kind: "driver" | "truck" | "trailer";
  from_label: string;
  to_label: string;
  its: string;
};

export type ItsFileConflict = {
  load_number: string;
  chosen_file: string;
  chosen_snapshot: string | null;
  chosen_status: string;
  others: Array<{ file: string; snapshot: string | null; status: string }>;
};

export type ItsFileSnapshot = {
  file: string;
  snapshot: string | null;
  source: ExportSnapshotSource;
};

type ImportRow = LoadImportValues & { snapshot?: string | null; duplicate_conflict?: string };

type StopFill = {
  id: number;
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
};

export type ItsImportSummary = {
  mode: "dry-run" | "apply";
  files: string[];
  added: number;
  updated: number;
  unchanged: number;
  exceptions: number;
  skipped_tms_newer: number;
  skipped_other: number;
  per_year: Record<string, ItsYearCounts>;
  diff_sample: ItsFieldDiff[];
  alias_matches: Array<{ load_number: string; its: string; tms_unit: string }>;
  skipped_tms_newer_loads: string[];
  exception_items: Array<{ load_number: string; issue: string; detail: string }>;
  inactive_created: { trucks: ItsInactivePlan[]; trailers: ItsInactivePlan[]; drivers: ItsInactivePlan[] };
  reassignments: ItsReassignment[];
  conflicts: ItsFileConflict[];
  file_snapshots: ItsFileSnapshot[];
  rate_filled: number;
  rate_filled_loads: string[];
  flags: {
    ms_trailer_alias: boolean;
    import_rate: boolean;
    create_inactive_units: boolean;
  };
  snapshots: string[];
};

type PlannedStop = {
  kind: "pickup" | "delivery";
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  window_start: string;
  window_end: string;
};

type StopRow = PlannedStop & {
  id: number;
  arrived_at: string;
  departed_at: string;
};

type Change = {
  field: string;
  column: string;
  from: string;
  to: string;
  value: string | number | null;
};

export function itsImportOptions(partial?: Partial<ItsImportOptions>): ItsImportOptions {
  return {
    apply: partial?.apply ?? false,
    msTrailerAlias: partial?.msTrailerAlias ?? true,
    importRate: partial?.importRate ?? true,
    createInactiveUnits: partial?.createInactiveUnits ?? false,
    snapshot: partial?.snapshot ?? null,
    fileName: partial?.fileName,
  };
}

export function emptyItsImportSummary(options: ItsImportOptions): ItsImportSummary {
  return {
    mode: options.apply ? "apply" : "dry-run",
    files: [],
    added: 0,
    updated: 0,
    unchanged: 0,
    exceptions: 0,
    skipped_tms_newer: 0,
    skipped_other: 0,
    per_year: {},
    diff_sample: [],
    alias_matches: [],
    skipped_tms_newer_loads: [],
    exception_items: [],
    inactive_created: { trucks: [], trailers: [], drivers: [] },
    reassignments: [],
    conflicts: [],
    file_snapshots: [],
    rate_filled: 0,
    rate_filled_loads: [],
    flags: {
      ms_trailer_alias: options.msTrailerAlias,
      import_rate: options.importRate,
      create_inactive_units: options.createInactiveUnits,
    },
    snapshots: options.snapshot ? [options.snapshot] : [],
  };
}

export function formatItsImportText(summary: ItsImportSummary): string {
  const lines = [
    `ITS import ${summary.mode}`,
    "files:",
  ];
  if (summary.file_snapshots.length === 0) {
    lines.push(summary.files.length ? `  ${summary.files.join(", ")}` : "  (rows)");
  }
  for (const file of summary.file_snapshots) {
    lines.push(`  ${file.file}: ${file.snapshot ?? "(none)"} (${file.source})`);
  }
  lines.push(
    `added: ${summary.added}`,
    `updated: ${summary.updated}`,
    `unchanged: ${summary.unchanged}`,
    `exceptions: ${summary.exceptions}`,
    `skipped: TMS newer: ${summary.skipped_tms_newer}`,
    `skipped: other: ${summary.skipped_other}`,
    `flags: ms-trailer-alias=${summary.flags.ms_trailer_alias ? "on" : "off"} import-rate=${summary.flags.import_rate ? "on" : "off"} create-inactive-units=${summary.flags.create_inactive_units ? "on" : "off"}`,
    "per year:",
  );
  const years = Object.keys(summary.per_year).sort();
  if (years.length === 0) lines.push("  (none)");
  for (const year of years) {
    const row = summary.per_year[year]!;
    lines.push(
      `  ${year}: added ${row.added}, updated ${row.updated}, unchanged ${row.unchanged}, exceptions ${row.exceptions}, skipped TMS newer ${row.skipped_tms_newer}`,
    );
  }
  lines.push("diff sample:");
  if (summary.diff_sample.length === 0) lines.push("  (none)");
  for (const diff of summary.diff_sample) {
    lines.push(`  ${diff.load_number} ${diff.field}: ${diff.from} → ${diff.to}`);
  }
  if (summary.alias_matches.length) {
    lines.push("trailer alias:");
    for (const alias of summary.alias_matches.slice(0, DIFF_SAMPLE_LIMIT)) {
      lines.push(`  ${alias.load_number}: ${alias.its} → ${alias.tms_unit}`);
    }
  }
  if (summary.skipped_tms_newer_loads.length) {
    lines.push(`skipped: TMS newer loads: ${summary.skipped_tms_newer_loads.join(", ")}`);
  }
  lines.push(`rate filled on TMS-newer loads: ${summary.rate_filled}`);
  if (summary.rate_filled_loads.length === 0) lines.push("  (none)");
  for (const loadNumber of summary.rate_filled_loads) lines.push(`  ${loadNumber}`);
  lines.push("reassignments:");
  if (summary.reassignments.length === 0) lines.push("  (none)");
  for (const row of summary.reassignments) {
    lines.push(`  ${row.load_number} ${row.kind}: ${row.from_label} → ${row.to_label} (ITS "${row.its}")`);
  }
  lines.push("conflicts:");
  if (summary.conflicts.length === 0) lines.push("  (none)");
  for (const conflict of summary.conflicts) {
    const others = conflict.others
      .map((other) => `${other.file} @ ${other.snapshot ?? "(none)"} (${other.status})`)
      .join("; ");
    lines.push(
      `  ${conflict.load_number}: chose ${conflict.chosen_file} @ ${conflict.chosen_snapshot ?? "(none)"} (${conflict.chosen_status}); other: ${others}`,
    );
  }
  if (summary.flags.create_inactive_units) {
    const tense = summary.mode === "dry-run" ? "that would be created" : "created";
    lines.push(...formatInactivePlans(`inactive trucks ${tense}:`, summary.inactive_created.trucks));
    lines.push(...formatInactivePlans(`inactive drivers ${tense}:`, summary.inactive_created.drivers));
    lines.push(...formatInactivePlans(`inactive trailers ${tense}:`, summary.inactive_created.trailers));
  }
  return lines.join("\n");
}

function formatInactivePlans(title: string, plans: ItsInactivePlan[]): string[] {
  const lines = [title];
  const sorted = [...plans].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
  );
  if (sorted.length === 0) {
    lines.push("  (none)");
    return lines;
  }
  for (const plan of sorted) {
    const count = plan.loads.length;
    lines.push(`  ${plan.name}: ${count} load${count === 1 ? "" : "s"}`);
  }
  return lines;
}

export function readItsExportFile(filePath: string): Array<Record<string, unknown>> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") {
    return recordsFromLoadWorkbook(new Uint8Array(fs.readFileSync(filePath)));
  }
  if (ext === ".xls") {
    throw new Error(`${path.basename(filePath)} is .xls. Save the ITS export as .xlsx or .csv.`);
  }
  return recordsFromLoadSheetText(fs.readFileSync(filePath, "utf8"));
}

export function importItsRecords(
  records: Array<Record<string, unknown>>,
  partial?: Partial<ItsImportOptions>,
): ItsImportSummary {
  const options = itsImportOptions(partial);
  const summary = emptyItsImportSummary(options);
  const seen = new Map<string, LoadImportValues | { bad: string }>();
  let anonymous = 0;
  for (const record of records) {
    const value = mapLoadRecord(record);
    if (!isPlausibleLoadNumber(value.load_number)) {
      anonymous += 1;
      const key = `row-${anonymous}`;
      seen.set(key, { bad: "Row has no Load #." });
      continue;
    }
    if (value.date_problems.length > 0) {
      seen.set(value.load_number, { bad: value.date_problems.join("; ") });
      continue;
    }
    seen.set(value.load_number, value);
  }
  const rows: LoadImportValues[] = [];
  const problems: Array<{ load_number: string; detail: string }> = [];
  for (const [key, value] of seen) {
    if ("bad" in value) problems.push({ load_number: key, detail: value.bad });
    else rows.push(value);
  }
  return importItsValues(rows, options, problems, summary);
}

export function importItsValues(
  rows: ImportRow[],
  partial?: Partial<ItsImportOptions>,
  problems: Array<{ load_number: string; detail: string }> = [],
  summary = emptyItsImportSummary(itsImportOptions(partial)),
): ItsImportSummary {
  const options = itsImportOptions(partial);
  summary.mode = options.apply ? "apply" : "dry-run";
  summary.flags = {
    ms_trailer_alias: options.msTrailerAlias,
    import_rate: options.importRate,
    create_inactive_units: options.createInactiveUnits,
  };
  if (options.snapshot && !summary.snapshots.includes(options.snapshot)) summary.snapshots.push(options.snapshot);

  const customers = listCustomers().map((customer) => ({ id: customer.id, name: customer.name }));
  const trucks = listTrucks().map((truck) => ({ id: truck.id, unit_number: truck.unit_number, active: truck.active }));
  const trailers = listTrailers().map((trailer) => ({ id: trailer.id, unit_number: trailer.unit_number, active: trailer.active }));
  const drivers = listDrivers().map((driver) => ({
    id: driver.id,
    name: driver.name,
    company_name: driver.company_name,
    active: driver.active,
  }));

  const plannedInactive = plannedInactiveKeys(rows, options, trucks, trailers, drivers);

  for (const problem of problems) {
    noteException(summary, problem.load_number, "unparsable_row", problem.detail, shipYear(""));
    if (options.apply) writeException(itsImportExceptionKey(problem.load_number, "unparsable_row"), "open", problem.detail);
    summary.skipped_other += 1;
  }

  for (const row of rows) {
    const year = shipYear(row.ship_date);
    const snapshot = row.snapshot ?? options.snapshot;
    if (snapshot && !summary.snapshots.includes(snapshot)) summary.snapshots.push(snapshot);
    if (row.date_problems?.length) {
      const detail = row.date_problems.join("; ");
      noteException(summary, row.load_number, "unparsable_row", detail, year);
      if (options.apply) writeException(itsImportExceptionKey(row.load_number, "unparsable_row"), "open", detail);
      summary.skipped_other += 1;
      continue;
    }
    const existingId = findLoadIdByNumber(row.load_number);
    const existing = existingId ? getLoad(existingId) : null;
    if (existing && exportIsStale(existing.updated_at, snapshot)) {
      const rate = rateFill(existing, row, options);
      if (rate) {
        if (options.apply) {
          patchLoad(existing.id, [rate]);
          recordLoadChanges(existing.id, "update", [{ field: rate.field, oldValue: rate.from, newValue: rate.to }]);
        }
        summary.rate_filled += 1;
        summary.rate_filled_loads.push(row.load_number);
        if (summary.diff_sample.length < DIFF_SAMPLE_LIMIT) {
          summary.diff_sample.push({ load_number: row.load_number, field: rate.field, from: rate.from, to: rate.to });
        }
      }
      if (row.duplicate_conflict) {
        noteException(summary, row.load_number, "duplicate-conflict", row.duplicate_conflict, year);
        if (options.apply) writeException(itsImportExceptionKey(row.load_number, "duplicate-conflict"), "open", row.duplicate_conflict);
      }
      summary.skipped_tms_newer += 1;
      summary.skipped_tms_newer_loads.push(row.load_number);
      bump(summary, year, "skipped_tms_newer");
      continue;
    }

    const issues: Array<{ issue: ItsImportIssue; detail: string }> = [];
    const truck = resolveUnit(
      "truck",
      trucks,
      row.truck_unit,
      row.load_number,
      false,
      !existing || existing.truck_id == null,
      plannedInactive.trucks,
      options,
      summary,
      issues,
    );
    const trailer = resolveUnit(
      "trailer",
      trailers,
      row.trailer_unit,
      row.load_number,
      options.msTrailerAlias,
      !existing || existing.trailer_id == null,
      plannedInactive.trailers,
      options,
      summary,
      issues,
    );
    const driver = resolveDriver(
      drivers,
      row.driver_name,
      row.load_number,
      !existing || existing.driver_id == null,
      plannedInactive.drivers,
      options,
      summary,
      issues,
    );
    if (!row.status_mapped && row.raw_status.trim()) {
      issues.push({ issue: "unmapped_status", detail: `Unmapped ITS status "${row.raw_status.trim()}".` });
    }
    if (row.stops_uncertain) {
      issues.push({
        issue: "stop_parse_uncertain",
        detail: row.stop_parse_detail || "Stop names, cities, and states do not line up.",
      });
    }
    if (row.duplicate_conflict) {
      issues.push({ issue: "duplicate-conflict", detail: row.duplicate_conflict });
    }
    if (trailer.via === "ms_alias") {
      summary.alias_matches.push({ load_number: row.load_number, its: row.trailer_unit.trim(), tms_unit: trailer.tmsUnit });
    }

    if (!existing) {
      if (options.apply) {
        const id = insertLoad(row, customers, truck, trailer, driver, options);
        replaceOwnedStops(id, plannedStops(row));
        recordLoadAudit({ loadId: id, action: "create", field: "load", newValue: row.load_number });
        syncExceptions(row.load_number, issues, true);
      }
      for (const issue of issues) noteException(summary, row.load_number, issue.issue, issue.detail, year);
      summary.added += 1;
      bump(summary, year, "added");
      continue;
    }

    const plan = planUpdate(existing, row, customers, truck, trailer, driver, options, summary);
    if (plan.changes.length === 0 && plan.stopFills.length === 0) {
      if (options.apply) syncExceptions(row.load_number, issues, true);
      for (const issue of issues) noteException(summary, row.load_number, issue.issue, issue.detail, year);
      summary.unchanged += 1;
      bump(summary, year, "unchanged");
      continue;
    }

    if (options.apply) {
      if (plan.changes.length) patchLoad(existing.id, plan.changes);
      if (plan.stopFills.length) applyStopFills(plan.stopFills);
      recordLoadChanges(
        existing.id,
        "update",
        plan.changes.map((change) => ({ field: change.field, oldValue: change.from, newValue: change.to })),
      );
      syncExceptions(row.load_number, issues, true);
    }
    for (const issue of issues) noteException(summary, row.load_number, issue.issue, issue.detail, year);
    for (const change of plan.changes) {
      if (summary.diff_sample.length >= DIFF_SAMPLE_LIMIT) break;
      summary.diff_sample.push({
        load_number: row.load_number,
        field: change.field,
        from: change.from,
        to: change.to,
      });
    }
    summary.updated += 1;
    bump(summary, year, "updated");
  }
  return summary;
}

type TaggedRow = ImportRow & { source_file: string };

export function runItsImportFiles(filePaths: string[], partial?: Partial<ItsImportOptions>): ItsImportSummary {
  const options = itsImportOptions(partial);
  const tagged: TaggedRow[] = [];
  const fileSnapshots: ItsFileSnapshot[] = [];
  for (const filePath of filePaths) {
    const stat = fs.statSync(filePath);
    const resolved = fileSnapshot(filePath, stat.mtimeMs, options.snapshot);
    const base = path.basename(filePath);
    fileSnapshots.push({ file: base, snapshot: resolved.snapshot, source: resolved.source });
    for (const record of readItsExportFile(filePath)) {
      const value = mapLoadRecord(record);
      tagged.push({ ...value, source_file: base, snapshot: resolved.snapshot });
    }
  }
  const collapsed = collapseTaggedRows(tagged);
  const summary = importItsValues(collapsed.rows, { ...options, snapshot: null }, collapsed.problems);
  summary.files = fileSnapshots.map((file) => file.file);
  summary.file_snapshots = fileSnapshots;
  summary.conflicts = collapsed.conflicts;
  summary.mode = options.apply ? "apply" : "dry-run";
  summary.flags = {
    ms_trailer_alias: options.msTrailerAlias,
    import_rate: options.importRate,
    create_inactive_units: options.createInactiveUnits,
  };
  return summary;
}

function fileSnapshot(filePath: string, mtimeMs: number, override: string | null): { snapshot: string | null; source: ExportSnapshotSource } {
  let docModified: string | null = null;
  let docCreated: string | null = null;
  if (path.extname(filePath).toLowerCase() === ".xlsx") {
    const stamps = xlsxDocumentTimestamps(new Uint8Array(fs.readFileSync(filePath)));
    docModified = stamps.modified;
    docCreated = stamps.created;
  }
  return resolveExportSnapshot({
    fileName: path.basename(filePath),
    fileMtimeMs: mtimeMs,
    docModified,
    docCreated,
    override,
  });
}

function collapseTaggedRows(tagged: TaggedRow[]): {
  rows: TaggedRow[];
  problems: Array<{ load_number: string; detail: string }>;
  conflicts: ItsFileConflict[];
} {
  const groups = new Map<string, TaggedRow[]>();
  const problems: Array<{ load_number: string; detail: string }> = [];
  let anonymous = 0;
  for (const row of tagged) {
    if (!isPlausibleLoadNumber(row.load_number)) {
      anonymous += 1;
      problems.push({ load_number: `row-${anonymous}`, detail: "Row has no Load #." });
      continue;
    }
    const list = groups.get(row.load_number) ?? [];
    list.push(row);
    groups.set(row.load_number, list);
  }
  const rows: TaggedRow[] = [];
  const conflicts: ItsFileConflict[] = [];
  for (const [loadNumber, list] of groups) {
    let chosen = list[0]!;
    for (const candidate of list.slice(1)) {
      if (snapshotComesLater(candidate.snapshot, chosen.snapshot)) chosen = candidate;
    }
    const files = new Set(list.map((row) => row.source_file));
    if (files.size > 1) {
      conflicts.push({
        load_number: loadNumber,
        chosen_file: chosen.source_file,
        chosen_snapshot: chosen.snapshot ?? null,
        chosen_status: chosen.raw_status || chosen.status,
        others: list
          .filter((row) => row !== chosen)
          .map((row) => ({ file: row.source_file, snapshot: row.snapshot ?? null, status: row.raw_status || row.status })),
      });
    }
    if (list.length > 1 && duplicateRowsDisagree(list)) {
      chosen.duplicate_conflict = duplicateConflictDetail(list);
    }
    if (chosen.date_problems.length > 0) {
      problems.push({ load_number: loadNumber, detail: chosen.date_problems.join("; ") });
      continue;
    }
    rows.push(chosen);
  }
  return { rows, problems, conflicts };
}

function duplicateRowsDisagree(list: TaggedRow[]): boolean {
  const ships = new Set(list.map((row) => row.ship_date));
  const counts = new Set(list.map((row) => row.pickups.length + row.deliveries.length));
  return ships.size > 1 || counts.size > 1;
}

function duplicateConflictDetail(list: TaggedRow[]): string {
  const described = list.map((row) => {
    const ship = row.ship_date || "(blank)";
    const status = row.raw_status || row.status;
    return `${row.source_file} @ ${row.snapshot ?? "(none)"} ship ${ship}, ${row.pickups.length} pickups, ${row.deliveries.length} deliveries, status ${status}`;
  });
  return `Duplicate rows disagree. ${described.join("; ")}`;
}

function snapshotComesLater(candidate: string | null | undefined, current: string | null | undefined): boolean {
  const next = candidate ? Date.parse(candidate) : Number.NaN;
  const prior = current ? Date.parse(current) : Number.NaN;
  if (Number.isNaN(next) && Number.isNaN(prior)) return true;
  if (Number.isNaN(next)) return false;
  if (Number.isNaN(prior)) return true;
  return next >= prior;
}

function effectiveSnapshot(row: LoadImportValues, options: ItsImportOptions): string | null {
  const stamped = (row as ImportRow).snapshot;
  if (stamped) return stamped;
  return options.snapshot;
}

function plannedInactiveKeys(
  rows: ImportRow[],
  options: ItsImportOptions,
  trucks: Array<{ id: number; unit_number: string; active?: number | boolean | null }>,
  trailers: Array<{ id: number; unit_number: string; active?: number | boolean | null }>,
  drivers: Array<{ id: number; name: string; company_name?: string | null; active?: number | boolean | null }>,
): { trucks: Set<string>; trailers: Set<string>; drivers: Set<string> } {
  const planned = { trucks: new Set<string>(), trailers: new Set<string>(), drivers: new Set<string>() };
  const trailerOnOpenLoad = new Set<string>();
  if (!options.createInactiveUnits) return planned;
  for (const row of rows) {
    if (row.date_problems?.length) continue;
    const snapshot = row.snapshot ?? options.snapshot;
    const existingId = findLoadIdByNumber(row.load_number);
    const existing = existingId ? getLoad(existingId) : null;
    if (existing && exportIsStale(existing.updated_at, snapshot)) continue;
    if ((!existing || existing.truck_id == null) && row.truck_unit.trim()) {
      if (matchItsUnit(trucks, row.truck_unit).via === "unmatched") planned.trucks.add(normalizeUnitKey(row.truck_unit.trim()));
    }
    if ((!existing || existing.trailer_id == null) && row.trailer_unit.trim()) {
      if (matchItsUnit(trailers, row.trailer_unit, { msAlias: options.msTrailerAlias }).via === "unmatched") {
        const key = normalizeUnitKey(inactiveTrailerUnit(row.trailer_unit));
        if (!existing || existing.status !== "completed") trailerOnOpenLoad.add(key);
      }
    }
    if ((!existing || existing.driver_id == null) && row.driver_name.trim()) {
      if (matchItsDriver(drivers, row.driver_name).via === "unmatched") planned.drivers.add(normalizePersonName(row.driver_name));
    }
  }
  for (const key of trailerOnOpenLoad) planned.trailers.add(key);
  return planned;
}

function resolveUnit(
  kind: "truck" | "trailer",
  assets: Array<{ id: number; unit_number: string; active?: number | boolean | null }>,
  raw: string,
  loadNumber: string,
  msAlias: boolean,
  link: boolean,
  planned: Set<string>,
  options: ItsImportOptions,
  summary: ItsImportSummary,
  issues: Array<{ issue: ItsImportIssue; detail: string }>,
): UnitMatch {
  let match = matchItsUnit(assets, raw, { msAlias });
  if (link && options.createInactiveUnits && raw.trim() && (match.via === "exact" || match.via === "ms_alias")) {
    const plans = kind === "truck" ? summary.inactive_created.trucks : summary.inactive_created.trailers;
    attachInactiveLoad(plans, match.tmsUnit, loadNumber, normalizeUnitKey);
  }
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim() && link) {
    const display = kind === "trailer" ? inactiveTrailerUnit(raw) : raw.trim();
    const plans = kind === "truck" ? summary.inactive_created.trucks : summary.inactive_created.trailers;
    if (kind === "trailer" && !planned.has(normalizeUnitKey(display))) {
      issues.push({
        issue: "unmatched_trailer",
        detail: `No TMS trailer matches "${raw.trim()}". It only appears on existing completed loads, so no inactive trailer was created.`,
      });
      return match;
    }
    noteInactivePlan(plans, display, loadNumber, normalizeUnitKey);
    if (options.apply) {
      const created = kind === "truck" ? createInactiveTruck(raw.trim()) : createInactiveTrailer(display);
      assets.push({ ...created, active: 0 });
      match = { id: created.id, via: "created", detail: "", tmsUnit: created.unit_number, active: false };
    } else {
      match = { id: null, via: "created", detail: "", tmsUnit: display, active: false };
    }
    return match;
  }
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim() && !link) {
    const display = kind === "trailer" ? inactiveTrailerUnit(raw) : raw.trim();
    if (planned.has(normalizeUnitKey(display))) {
      return { id: null, via: "created", detail: "", tmsUnit: display, active: false };
    }
  }
  if (match.via === "unmatched") {
    issues.push({
      issue: kind === "truck" ? "unmatched_truck" : "unmatched_trailer",
      detail: `No TMS ${kind} matches "${raw.trim()}".`,
    });
  } else if (match.via === "ambiguous") {
    issues.push({
      issue: kind === "truck" ? "unmatched_truck" : "ambiguous_trailer",
      detail: `More than one TMS ${kind} matches "${raw.trim()}": ${match.detail}.`,
    });
  }
  return match;
}

function resolveDriver(
  drivers: Array<{ id: number; name: string; company_name?: string | null; active?: number | boolean | null }>,
  raw: string,
  loadNumber: string,
  link: boolean,
  planned: Set<string>,
  options: ItsImportOptions,
  summary: ItsImportSummary,
  issues: Array<{ issue: ItsImportIssue; detail: string }>,
): UnitMatch {
  let match = matchItsDriver(drivers, raw);
  if (link && options.createInactiveUnits && raw.trim() && (match.via === "exact" || match.via === "company")) {
    attachInactiveLoad(summary.inactive_created.drivers, match.tmsUnit, loadNumber, normalizePersonName);
  }
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim() && link) {
    const name = raw.trim();
    noteInactivePlan(summary.inactive_created.drivers, name, loadNumber, normalizePersonName);
    if (options.apply) {
      const created = createInactiveDriver(name);
      drivers.push({ id: created.id, name: created.name, company_name: created.company_name, active: 0 });
      match = { id: created.id, via: "created", detail: "", tmsUnit: created.name, active: false };
    } else {
      match = { id: null, via: "created", detail: "", tmsUnit: name, active: false };
    }
    return match;
  }
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim() && !link && planned.has(normalizePersonName(raw))) {
    return { id: null, via: "created", detail: "", tmsUnit: raw.trim(), active: false };
  }
  if (match.via === "unmatched") {
    issues.push({ issue: "unmatched_driver", detail: `No TMS driver matches "${raw.trim()}".` });
  } else if (match.via === "ambiguous") {
    issues.push({ issue: "ambiguous_driver", detail: `More than one TMS driver matches "${raw.trim()}": ${match.detail}.` });
  }
  return match;
}

function planUpdate(
  current: LoadView,
  row: LoadImportValues,
  customers: Array<{ id: number; name: string }>,
  truck: UnitMatch,
  trailer: UnitMatch,
  driver: UnitMatch,
  options: ItsImportOptions,
  summary: ItsImportSummary,
): { changes: Change[]; stopFills: StopFill[] } {
  const changes: Change[] = [];
  const customerId = row.customer_name.trim() ? ensureCustomer(row.customer_name, customers) : current.customer_id;
  if (customerId !== current.customer_id) {
    changes.push(change("customer_id", "customer", current.customer_id, customerId));
  }
  const stopFills = row.stops_uncertain ? [] : blankStopFills(readStops(current.id), plannedStops(row));
  fillBlankWindow(changes, current.pickup_start, current.pickup_end, row.ship_date, "pickup_start", "pickup_end");
  fillBlankWindow(changes, current.delivery_start, current.delivery_end, row.del_date || row.ship_date, "delivery_start", "delivery_end");
  if (row.notes && row.notes !== (current.notes ?? "")) {
    changes.push(change("notes", "notes", current.notes ?? "", row.notes));
  }
  if (row.wsf_po) {
    if ((current.reference_number ?? "") !== row.wsf_po) {
      changes.push(change("reference_number", "reference_number", current.reference_number ?? "", row.wsf_po));
    }
    if ((current.po_number ?? "") !== row.wsf_po) {
      changes.push(change("po_number", "po_number", current.po_number ?? "", row.wsf_po));
    }
    if ((current.customer_reference ?? "") !== row.wsf_po) {
      changes.push(change("customer_reference", "customer_reference", current.customer_reference ?? "", row.wsf_po));
    }
  }
  if (row.equipment_specified !== false && row.equipment && row.equipment !== (current.equipment ?? "")) {
    changes.push(change("equipment", "equipment", current.equipment ?? "", row.equipment));
  }
  const nextStatus = nextImportStatus(current.status, row);
  if (nextStatus && nextStatus !== current.status) {
    changes.push(change("status", "status", current.status, nextStatus));
  }
  noteSlot(summary, current, row, "truck", current.truck_id, current.truck_unit || "", truck, changes);
  noteSlot(summary, current, row, "trailer", current.trailer_id, current.trailer_unit || current.trailer_number || "", trailer, changes);
  noteSlot(summary, current, row, "driver", current.driver_id, current.driver_name || "", driver, changes);
  const rate = rateFill(current, row, options);
  if (rate) changes.push(rate);
  return { changes, stopFills };
}

function noteSlot(
  summary: ItsImportSummary,
  current: LoadView,
  row: LoadImportValues,
  kind: "truck" | "trailer" | "driver",
  currentId: number | null,
  fromLabel: string,
  match: UnitMatch,
  changes: Change[],
): void {
  const decision = decideSlot(currentId, match);
  if (decision.reassign) {
    summary.reassignments.push({
      load_number: current.load_number,
      kind,
      from_label: fromLabel || String(currentId),
      to_label: match.tmsUnit,
      its: kind === "driver" ? row.driver_name : kind === "truck" ? row.truck_unit : row.trailer_unit,
    });
  }
  if (decision.id === currentId) return;
  const column = kind === "truck" ? "truck_id" : kind === "trailer" ? "trailer_id" : "driver_id";
  changes.push(change(column, kind, currentId, decision.id));
}

function decideSlot(currentId: number | null, match: UnitMatch): { id: number | null; reassign: boolean } {
  if (match.via === "blank") return { id: currentId, reassign: false };
  if (match.via === "created") {
    if (currentId == null) return { id: match.id, reassign: false };
    return { id: currentId, reassign: false };
  }
  const linked = match.id != null && (match.via === "exact" || match.via === "company" || match.via === "ms_alias");
  if (!linked) return { id: currentId, reassign: false };
  if (currentId == null) return { id: match.id, reassign: false };
  if (match.id === currentId) return { id: currentId, reassign: false };
  if (!match.active) return { id: currentId, reassign: false };
  return { id: match.id, reassign: true };
}

function fillBlankWindow(
  changes: Change[],
  currentStart: string,
  currentEnd: string,
  day: string,
  startColumn: "pickup_start" | "delivery_start",
  endColumn: "pickup_end" | "delivery_end",
): void {
  if (!day) return;
  const [start, end] = windowForDate(day);
  if (!text(currentStart)) changes.push(change(startColumn, startColumn, currentStart, start));
  if (!text(currentEnd)) changes.push(change(endColumn, endColumn, currentEnd, end));
}

function rateFill(current: { rate: number | null }, row: LoadImportValues, options: ItsImportOptions): Change | null {
  if (!options.importRate || row.billing_rate == null) return null;
  if (current.rate != null && !Number.isNaN(Number(current.rate))) return null;
  return change("rate", "rate", current.rate, row.billing_rate);
}

function nextImportStatus(current: string, row: LoadImportValues): string | null {
  if (!row.status_mapped) return null;
  if (statusMovesBackwards(current, row.status)) return null;
  return row.status;
}

function insertLoad(
  row: LoadImportValues,
  customers: Array<{ id: number; name: string }>,
  truck: UnitMatch,
  trailer: UnitMatch,
  driver: UnitMatch,
  options: ItsImportOptions,
): number {
  const customerId = ensureCustomer(row.customer_name, customers);
  const shipDay = row.ship_date || "1970-01-01";
  const delDay = row.del_date || shipDay;
  const [pickupStart, pickupEnd] = windowForDate(shipDay);
  const [deliveryStart, deliveryEnd] = windowForDate(delDay);
  const stampSource = effectiveSnapshot(row, options);
  const stamp = stampSource && !Number.isNaN(new Date(stampSource).getTime()) ? stampSource : new Date().toISOString();
  const truckId = truck.id;
  const trailerId = trailer.id;
  const driverId = driver.id;
  const rate = options.importRate ? row.billing_rate : null;
  const result = getDb()
    .prepare(
      `INSERT INTO loads (
        load_number, customer_id, origin, destination,
        pickup_start, pickup_end, delivery_start, delivery_end,
        commodity, rate, notes, status, truck_id, driver_id,
        reference_number, po_number, customer_reference, trailer_number, trailer_id, equipment,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.load_number,
      customerId,
      laneFrom(row.pickups) || "TBD",
      laneFrom(row.deliveries) || "TBD",
      pickupStart,
      pickupEnd,
      deliveryStart,
      deliveryEnd,
      rate,
      row.notes,
      row.status_mapped ? row.status : "hold",
      truckId,
      driverId,
      row.wsf_po,
      row.wsf_po,
      row.wsf_po,
      trailer.tmsUnit,
      trailerId,
      row.equipment,
      stamp,
      stamp,
    );
  return Number(result.lastInsertRowid);
}

const PATCH_COLUMNS = new Set([
  "customer_id",
  "origin",
  "destination",
  "pickup_start",
  "pickup_end",
  "delivery_start",
  "delivery_end",
  "notes",
  "reference_number",
  "po_number",
  "customer_reference",
  "trailer_number",
  "trailer_id",
  "status",
  "truck_id",
  "driver_id",
  "equipment",
  "rate",
]);

function patchLoad(loadId: number, changes: Change[]): void {
  const usable = changes.filter((change) => PATCH_COLUMNS.has(change.column));
  if (!usable.length) return;
  const assignments = usable.map((change) => `${change.column} = ?`).join(", ");
  getDb()
    .prepare(`UPDATE loads SET ${assignments} WHERE id = ?`)
    .run(...usable.map((change) => change.value), loadId);
}

const STOP_FILL_FIELDS = ["name", "street", "city", "state", "zip", "phone"] as const;

function blankStopFills(existing: StopRow[], planned: PlannedStop[]): StopFill[] {
  const fills: StopFill[] = [];
  for (const kind of ["pickup", "delivery"] as const) {
    const current = existing.filter((stop) => stop.kind === kind);
    const next = planned.filter((stop) => stop.kind === kind);
    const count = Math.min(current.length, next.length);
    for (let index = 0; index < count; index += 1) {
      const prior = current[index];
      const stop = next[index];
      if (!prior || !stop) continue;
      const fill: StopFill = { id: prior.id };
      let any = false;
      for (const field of STOP_FILL_FIELDS) {
        if (!text(prior[field]) && text(stop[field])) {
          fill[field] = text(stop[field]);
          any = true;
        }
      }
      if (any) fills.push(fill);
    }
  }
  return fills;
}

function applyStopFills(fills: StopFill[]): void {
  for (const fill of fills) {
    const fields = STOP_FILL_FIELDS.filter((field) => fill[field] != null);
    if (!fields.length) continue;
    getDb()
      .prepare(`UPDATE load_stops SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE id = ?`)
      .run(...fields.map((field) => fill[field]), fill.id);
  }
}

function readStops(loadId: number): StopRow[] {
  return getDb()
    .prepare(
      `SELECT id, kind, name, street, city, state, zip, phone, window_start, window_end, arrived_at, departed_at
       FROM load_stops WHERE load_id = ? ORDER BY sequence, id`,
    )
    .all(loadId) as StopRow[];
}

function plannedStops(row: LoadImportValues): PlannedStop[] {
  const shipDay = row.ship_date || "1970-01-01";
  const delDay = row.del_date || shipDay;
  const [pickupStart, pickupEnd] = windowForDate(shipDay);
  const [deliveryStart, deliveryEnd] = windowForDate(delDay);
  const pickups = row.pickups.length ? row.pickups : [{ kind: "pickup" as const, name: "Pickup", city: "", state: "" }];
  const deliveries = row.deliveries.length
    ? row.deliveries
    : [{ kind: "delivery" as const, name: "Delivery", city: "", state: "" }];
  return [
    ...pickups.map((stop) => stopPlan(stop, pickupStart, pickupEnd)),
    ...deliveries.map((stop) => stopPlan(stop, deliveryStart, deliveryEnd)),
  ];
}

function stopPlan(stop: ImportedStop, windowStart: string, windowEnd: string): PlannedStop {
  return {
    kind: stop.kind,
    name: stop.name || [stop.city, stop.state].filter(Boolean).join(", ") || (stop.kind === "pickup" ? "Pickup" : "Delivery"),
    street: stop.street ?? "",
    city: stop.city,
    state: stop.state,
    zip: stop.zip ?? "",
    phone: stop.phone ?? "",
    window_start: windowStart,
    window_end: windowEnd,
  };
}

function replaceOwnedStops(loadId: number, planned: PlannedStop[]): void {
  for (const stop of planned) insertStop(loadId, stop);
}

function insertStop(loadId: number, stop: PlannedStop): void {
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS seq FROM load_stops WHERE load_id = ?")
    .get(loadId) as { seq: number };
  getDb()
    .prepare(
      `INSERT INTO load_stops (
        load_id, sequence, kind, name, street, city, state, zip, phone, window_start, window_end, arrived_at, departed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
    )
    .run(
      loadId,
      max.seq + 1,
      stop.kind,
      stop.name,
      stop.street,
      stop.city,
      stop.state,
      stop.zip,
      stop.phone,
      stop.window_start,
      stop.window_end,
    );
}

function ensureCustomer(name: string, customers: Array<{ id: number; name: string }>): number {
  const wanted = name.trim();
  if (!wanted) {
    if (customers[0]) return customers[0].id;
    const id = createCustomer({ name: "Imported customer", billing_notes: "", contacts: [] });
    customers.push({ id, name: "Imported customer" });
    return id;
  }
  const match = customers.find((customer) => customer.name.trim().toLowerCase() === wanted.toLowerCase());
  if (match) return match.id;
  const id = createCustomer({ name: wanted, billing_notes: "", contacts: [] });
  customers.push({ id, name: wanted });
  return id;
}

function createInactiveTruck(unitNumber: string): { id: number; unit_number: string } {
  const id = createTruck({
    unit_number: unitNumber,
    type: "sleeper",
    capacity_lbs: 0,
    status: "out_of_service",
    active: 0,
    notes: "Created inactive by ITS import so history can link. Not dispatched.",
    division: "MSE",
  });
  return { id, unit_number: unitNumber };
}

function createInactiveTrailer(unitNumber: string): { id: number; unit_number: string } {
  const id = createTrailer({
    unit_number: unitNumber,
    type: "reefer",
    status: "out_of_service",
    active: 0,
    notes: "Created inactive by ITS import so history can link. Not dispatched.",
    division: "MSE",
  });
  return { id, unit_number: unitNumber };
}

function createInactiveDriver(name: string): { id: number; name: string; company_name: string } {
  const company = looksLikeCompanyName(name);
  const id = createDriver({
    name,
    phone: "",
    license: "",
    pin: "",
    truck_id: null,
    status: "off_duty",
    active: 0,
    notes: "Created inactive by ITS import so history can link. Not dispatched.",
    driver_type: company ? "owner_operator" : "company_driver",
    company_name: company ? name : "",
    division: "MSE",
  });
  return { id, name, company_name: company ? name : "" };
}

function writeException(key: string, status: "open" | "resolved", reason: string): void {
  const nextReason = reason.trim();
  const existing = getDb()
    .prepare("SELECT status, reason, updated_at FROM exception_states WHERE exception_key = ?")
    .get(key) as { status: string; reason: string; updated_at: string } | undefined;
  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO exception_states (exception_key, status, reason, until, updated_at)
         VALUES (?, ?, ?, '', ?)`,
      )
      .run(key, status, nextReason, new Date().toISOString());
    return;
  }
  if (existing.status === "resolved" || existing.status === "snoozed" || existing.status === "ack") return;
  if (existing.status === status && existing.reason === nextReason) return;
  if (status === "open" && existing.status === "open") {
    getDb().prepare("UPDATE exception_states SET reason = ? WHERE exception_key = ?").run(nextReason, key);
    return;
  }
  getDb()
    .prepare("UPDATE exception_states SET status = ?, reason = ?, until = '', updated_at = ? WHERE exception_key = ?")
    .run(status, nextReason, new Date().toISOString(), key);
}

function syncExceptions(loadNumber: string, issues: Array<{ issue: ItsImportIssue; detail: string }>, apply: boolean): void {
  if (!apply) return;
  const present = new Set(issues.map((issue) => issue.issue));
  for (const issue of issues) {
    writeException(itsImportExceptionKey(loadNumber, issue.issue), "open", issue.detail);
  }
  for (const code of ISSUE_CODES) {
    if (present.has(code)) continue;
    const key = itsImportExceptionKey(loadNumber, code);
    const row = getDb().prepare("SELECT status FROM exception_states WHERE exception_key = ?").get(key) as
      | { status: string }
      | undefined;
    if (row && row.status !== "resolved" && row.status !== "snoozed" && row.status !== "ack") {
      writeException(key, "resolved", "Cleared by a later ITS import.");
    }
  }
}

function attachInactiveLoad(
  plans: ItsInactivePlan[],
  name: string,
  loadNumber: string,
  normalize: (value: string) => string,
): void {
  const key = normalize(name);
  const found = plans.find((plan) => normalize(plan.name) === key);
  if (!found || found.loads.includes(loadNumber)) return;
  found.loads.push(loadNumber);
}

function noteInactivePlan(
  plans: ItsInactivePlan[],
  name: string,
  loadNumber: string,
  normalize: (value: string) => string,
): void {
  const key = normalize(name);
  const found = plans.find((plan) => normalize(plan.name) === key);
  if (!found) {
    plans.push({ name, loads: [loadNumber] });
    return;
  }
  if (!found.loads.includes(loadNumber)) found.loads.push(loadNumber);
}

function noteException(
  summary: ItsImportSummary,
  loadNumber: string,
  issue: string,
  detail: string,
  year: string,
): void {
  summary.exceptions += 1;
  summary.exception_items.push({ load_number: loadNumber, issue, detail });
  bump(summary, year, "exceptions");
}

function bump(summary: ItsImportSummary, year: string, key: keyof ItsYearCounts): void {
  yearBucket(summary, year)[key] += 1;
}

function yearBucket(summary: ItsImportSummary, year: string): ItsYearCounts {
  const existing = summary.per_year[year];
  if (existing) return existing;
  const created: ItsYearCounts = { added: 0, updated: 0, unchanged: 0, exceptions: 0, skipped_tms_newer: 0 };
  summary.per_year[year] = created;
  return created;
}

function shipYear(shipDate: string): string {
  return /^\d{4}/.test(shipDate) ? shipDate.slice(0, 4) : "unknown";
}

function windowForDate(day: string): [string, string] {
  return [`${day}T08:00:00`, `${day}T17:00:00`];
}

function laneFrom(stops: ImportedStop[]): string {
  const first = stops[0];
  if (!first) return "";
  return [first.city, first.state].filter(Boolean).join(", ") || first.name;
}

function change(column: string, field: string, from: unknown, to: string | number | null): Change {
  return { column, field, from: from == null ? "" : String(from), to: to == null ? "" : String(to), value: to };
}

function text(value: string | null | undefined): string {
  return String(value ?? "").trim();
}
