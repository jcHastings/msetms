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
  ITS_IMPORT_ISSUES,
  itsImportExceptionKey,
  matchItsDriver,
  matchItsUnit,
  resolveExportSnapshot,
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
import { recordsFromLoadWorkbook } from "./xlsx-first-sheet";
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
  inactive_created: { trucks: string[]; trailers: string[]; drivers: string[] };
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
    `files: ${summary.files.length ? summary.files.join(", ") : "(rows)"}`,
    `added: ${summary.added}`,
    `updated: ${summary.updated}`,
    `unchanged: ${summary.unchanged}`,
    `exceptions: ${summary.exceptions}`,
    `skipped: TMS newer: ${summary.skipped_tms_newer}`,
    `skipped: other: ${summary.skipped_other}`,
    `flags: ms-trailer-alias=${summary.flags.ms_trailer_alias ? "on" : "off"} import-rate=${summary.flags.import_rate ? "on" : "off"} create-inactive-units=${summary.flags.create_inactive_units ? "on" : "off"}`,
    "per year:",
  ];
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
    lines.push(`skipped: TMS newer loads: ${summary.skipped_tms_newer_loads.slice(0, 20).join(", ")}`);
  }
  return lines.join("\n");
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
  rows: LoadImportValues[],
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
  const trucks = listTrucks().map((truck) => ({ id: truck.id, unit_number: truck.unit_number }));
  const trailers = listTrailers().map((trailer) => ({ id: trailer.id, unit_number: trailer.unit_number }));
  const drivers = listDrivers().map((driver) => ({ id: driver.id, name: driver.name }));

  for (const problem of problems) {
    noteException(summary, problem.load_number, "unparsable_row", problem.detail, shipYear(""));
    if (options.apply) writeException(itsImportExceptionKey(problem.load_number, "unparsable_row"), "open", problem.detail);
    summary.skipped_other += 1;
  }

  for (const row of rows) {
    const year = shipYear(row.ship_date);
    if (row.date_problems?.length) {
      const detail = row.date_problems.join("; ");
      noteException(summary, row.load_number, "unparsable_row", detail, year);
      if (options.apply) writeException(itsImportExceptionKey(row.load_number, "unparsable_row"), "open", detail);
      summary.skipped_other += 1;
      continue;
    }
    const existingId = findLoadIdByNumber(row.load_number);
    const existing = existingId ? getLoad(existingId) : null;
    if (existing && exportIsStale(existing.updated_at, options.snapshot)) {
      summary.skipped_tms_newer += 1;
      summary.skipped_tms_newer_loads.push(row.load_number);
      bump(summary, year, "skipped_tms_newer");
      continue;
    }

    const issues: Array<{ issue: ItsImportIssue; detail: string }> = [];
      const truck = resolveUnit("truck", trucks, row.truck_unit, false, options, summary, issues);
    const trailer = resolveUnit("trailer", trailers, row.trailer_unit, options.msTrailerAlias, options, summary, issues);
    const driver = resolveDriver(drivers, row.driver_name, options, summary, issues);
    if (!row.status_mapped && row.raw_status.trim()) {
      issues.push({ issue: "unmapped_status", detail: `Unmapped ITS status "${row.raw_status.trim()}".` });
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

    const plan = planUpdate(existing, row, customers, truck, trailer, driver, options);
    if (plan.changes.length === 0 && !plan.stopSync) {
      if (options.apply) syncExceptions(row.load_number, issues, true);
      for (const issue of issues) noteException(summary, row.load_number, issue.issue, issue.detail, year);
      summary.unchanged += 1;
      bump(summary, year, "unchanged");
      continue;
    }

    if (options.apply) {
      if (plan.changes.length) patchLoad(existing.id, plan.changes);
      if (plan.stopSync) syncStops(existing.id, readStops(existing.id), plannedStops(row));
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

export function runItsImportFiles(filePaths: string[], partial?: Partial<ItsImportOptions>): ItsImportSummary {
  const options = itsImportOptions(partial);
  const summary = emptyItsImportSummary({ ...options, snapshot: null });
  summary.files = filePaths.map((filePath) => path.basename(filePath));
  for (const filePath of filePaths) {
    const stat = fs.statSync(filePath);
    const snapshot = options.snapshot ?? resolveSnapshot(filePath, stat.mtimeMs);
    const part = importItsRecords(readItsExportFile(filePath), { ...options, snapshot, fileName: path.basename(filePath) });
    mergeSummary(summary, part);
  }
  summary.mode = options.apply ? "apply" : "dry-run";
  summary.flags = {
    ms_trailer_alias: options.msTrailerAlias,
    import_rate: options.importRate,
    create_inactive_units: options.createInactiveUnits,
  };
  return summary;
}

function resolveSnapshot(filePath: string, mtimeMs: number): string | null {
  return resolveExportSnapshot({ fileName: path.basename(filePath), fileMtimeMs: mtimeMs });
}

function mergeSummary(target: ItsImportSummary, part: ItsImportSummary): void {
  target.added += part.added;
  target.updated += part.updated;
  target.unchanged += part.unchanged;
  target.exceptions += part.exceptions;
  target.skipped_tms_newer += part.skipped_tms_newer;
  target.skipped_other += part.skipped_other;
  target.skipped_tms_newer_loads.push(...part.skipped_tms_newer_loads);
  target.exception_items.push(...part.exception_items);
  target.alias_matches.push(...part.alias_matches);
  target.inactive_created.trucks.push(...part.inactive_created.trucks);
  target.inactive_created.trailers.push(...part.inactive_created.trailers);
  target.inactive_created.drivers.push(...part.inactive_created.drivers);
  for (const snapshot of part.snapshots) {
    if (!target.snapshots.includes(snapshot)) target.snapshots.push(snapshot);
  }
  for (const [year, counts] of Object.entries(part.per_year)) {
    const bucket = yearBucket(target, year);
    bucket.added += counts.added;
    bucket.updated += counts.updated;
    bucket.unchanged += counts.unchanged;
    bucket.exceptions += counts.exceptions;
    bucket.skipped_tms_newer += counts.skipped_tms_newer;
  }
  for (const diff of part.diff_sample) {
    if (target.diff_sample.length >= DIFF_SAMPLE_LIMIT) break;
    target.diff_sample.push(diff);
  }
}

function resolveUnit(
  kind: "truck" | "trailer",
  assets: Array<{ id: number; unit_number: string }>,
  raw: string,
  msAlias: boolean,
  options: ItsImportOptions,
  summary: ItsImportSummary,
  issues: Array<{ issue: ItsImportIssue; detail: string }>,
): UnitMatch {
  let match = matchItsUnit(assets, raw, { msAlias });
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim()) {
    const unitNumber = raw.trim();
    if (options.apply) {
      const created = kind === "truck" ? createInactiveTruck(unitNumber) : createInactiveTrailer(unitNumber);
      assets.push(created);
      match = { id: created.id, via: "exact", detail: "", tmsUnit: created.unit_number };
    }
    if (kind === "truck") summary.inactive_created.trucks.push(unitNumber);
    else summary.inactive_created.trailers.push(unitNumber);
    return match;
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
  drivers: Array<{ id: number; name: string }>,
  raw: string,
  options: ItsImportOptions,
  summary: ItsImportSummary,
  issues: Array<{ issue: ItsImportIssue; detail: string }>,
): UnitMatch {
  let match = matchItsDriver(drivers, raw);
  if (match.via === "unmatched" && options.createInactiveUnits && raw.trim()) {
    const name = raw.trim();
    if (options.apply) {
      const created = createInactiveDriver(name);
      drivers.push(created);
      match = { id: created.id, via: "exact", detail: "", tmsUnit: created.name };
    }
    summary.inactive_created.drivers.push(name);
    return match;
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
): { changes: Change[]; stopSync: boolean } {
  const changes: Change[] = [];
  const customerId = row.customer_name.trim() ? ensureCustomer(row.customer_name, customers) : current.customer_id;
  if (customerId !== current.customer_id) {
    changes.push(change("customer_id", "customer", current.customer_id, customerId));
  }
  const stops = plannedStops(row);
  const existingStops = readStops(current.id);
  const stopSync = stopsDiffer(existingStops, stops);
  if (stopSync) {
    const origin = laneFrom(row.pickups) || current.origin;
    const destination = laneFrom(row.deliveries) || current.destination;
    if (origin !== current.origin) changes.push(change("origin", "origin", current.origin, origin));
    if (destination !== current.destination) changes.push(change("destination", "destination", current.destination, destination));
  }
  if (row.ship_date && calendarDay(current.pickup_start) !== row.ship_date) {
    const [start, end] = windowForDate(row.ship_date);
    changes.push(change("pickup_start", "pickup_start", current.pickup_start, start));
    changes.push(change("pickup_end", "pickup_end", current.pickup_end, end));
  }
  const deliveryDay = row.del_date || row.ship_date;
  if (deliveryDay && calendarDay(current.delivery_start) !== deliveryDay) {
    const [start, end] = windowForDate(deliveryDay);
    changes.push(change("delivery_start", "delivery_start", current.delivery_start, start));
    changes.push(change("delivery_end", "delivery_end", current.delivery_end, end));
  }
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
  if ((truck.via === "exact" || truck.via === "ms_alias") && truck.id != null && truck.id !== current.truck_id) {
    changes.push(change("truck_id", "truck", current.truck_id, truck.id));
  }
  if ((trailer.via === "exact" || trailer.via === "ms_alias") && trailer.id != null && trailer.id !== current.trailer_id) {
    changes.push(change("trailer_id", "trailer", current.trailer_id, trailer.id));
    if ((current.trailer_number ?? "") !== trailer.tmsUnit) {
      changes.push(change("trailer_number", "trailer_number", current.trailer_number ?? "", trailer.tmsUnit));
    }
  }
  if ((driver.via === "exact" || driver.via === "ms_alias") && driver.id != null && driver.id !== current.driver_id) {
    changes.push(change("driver_id", "driver", current.driver_id, driver.id));
  }
  if (options.importRate && row.billing_rate != null && (current.rate == null || Number.isNaN(Number(current.rate)))) {
    changes.push(change("rate", "rate", current.rate, row.billing_rate));
  }
  return { changes, stopSync };
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
  const stamp = options.snapshot && !Number.isNaN(new Date(options.snapshot).getTime()) ? options.snapshot : new Date().toISOString();
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

function stopsDiffer(existing: StopRow[], planned: PlannedStop[]): boolean {
  for (const kind of ["pickup", "delivery"] as const) {
    const current = existing.filter((stop) => stop.kind === kind);
    const next = planned.filter((stop) => stop.kind === kind);
    if (current.length !== next.length) return true;
    for (let index = 0; index < next.length; index += 1) {
      const prior = current[index];
      const stop = next[index];
      if (!prior || !stop) return true;
      if (text(prior.name) !== text(stop.name)) return true;
      if (text(prior.city) !== text(stop.city)) return true;
      if (text(prior.state) !== text(stop.state)) return true;
      if (stop.street.trim() && text(prior.street) !== text(stop.street)) return true;
      if (stop.zip.trim() && text(prior.zip) !== text(stop.zip)) return true;
      if (calendarDay(prior.window_start) !== calendarDay(stop.window_start)) return true;
    }
  }
  return false;
}

function syncStops(loadId: number, existing: StopRow[], planned: PlannedStop[]): void {
  for (const kind of ["pickup", "delivery"] as const) {
    const current = existing.filter((stop) => stop.kind === kind);
    const next = planned.filter((stop) => stop.kind === kind);
    next.forEach((stop, index) => {
      const prior = current[index];
      if (!prior) {
        insertStop(loadId, stop);
        return;
      }
      const dateChanged = calendarDay(prior.window_start) !== calendarDay(stop.window_start);
      getDb()
        .prepare(
          `UPDATE load_stops
           SET name = ?, street = ?, city = ?, state = ?, zip = ?, phone = ?, window_start = ?, window_end = ?
           WHERE id = ?`,
        )
        .run(
          stop.name || prior.name,
          stop.street.trim() || prior.street,
          stop.city,
          stop.state,
          stop.zip.trim() || prior.zip,
          stop.phone.trim() || prior.phone,
          dateChanged ? stop.window_start : prior.window_start,
          dateChanged ? stop.window_end : prior.window_end,
          prior.id,
        );
    });
  }
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

function createInactiveDriver(name: string): { id: number; name: string } {
  const id = createDriver({
    name,
    phone: "",
    license: "",
    pin: "",
    truck_id: null,
    status: "off_duty",
    active: 0,
    notes: "Created inactive by ITS import so history can link. Not dispatched.",
    driver_type: "company_driver",
    division: "MSE",
  });
  return { id, name };
}

function writeException(key: string, status: "open" | "resolved", reason: string): void {
  getDb()
    .prepare(
      `INSERT INTO exception_states (exception_key, status, reason, until, updated_at)
       VALUES (?, ?, ?, '', ?)
       ON CONFLICT(exception_key) DO UPDATE SET
         status = excluded.status,
         reason = excluded.reason,
         until = excluded.until,
         updated_at = excluded.updated_at`,
    )
    .run(key, status, reason.trim(), new Date().toISOString());
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
    if (row && row.status !== "resolved") writeException(key, "resolved", "Cleared by a later ITS import.");
  }
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
