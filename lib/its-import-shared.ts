/** Pure ITS all-loads import rules. No database, no network, no secrets. */

import { isUnassignedAsset, normalizeHeader } from "./load-import-shared";

/** The 28 columns on an ITS "All Loads shipped between …" Excel export, by name. */
export const ITS_ALL_LOADS_HEADERS = [
  "Load #",
  "Tie Sheet",
  "WSF PO",
  "SALT",
  "Transfer",
  "Avenel",
  "Salt/Spice",
  "Work Order #",
  "Status",
  "Ship Date",
  "Del Date",
  "Customer",
  "Shipper",
  "Shipper City",
  "Shipper St.",
  "Shipper PO Numbers",
  "Consignee",
  "Consignee City",
  "Consignee St.",
  "Consignee PO Numbers",
  "Truck",
  "Trailer",
  "Carrier/Driver",
  "Line Haul",
  "(currency)",
  "Total Billing Rate",
  "(currency)",
  "Equipment Type",
] as const;

export const ITS_IMPORT_EXCEPTION_PREFIX = "its-import:";

export const ITS_IMPORT_ISSUES = {
  unmatched_truck: "ITS import — unmatched truck",
  unmatched_trailer: "ITS import — unmatched trailer",
  ambiguous_trailer: "ITS import — ambiguous trailer",
  unmatched_driver: "ITS import — unmatched driver",
  ambiguous_driver: "ITS import — ambiguous driver",
  unmapped_status: "ITS import — unmapped status",
  unparsable_row: "ITS import — unparsable row",
} as const;

export type ItsImportIssue = keyof typeof ITS_IMPORT_ISSUES;

export type UnitMatch = {
  id: number | null;
  via: "blank" | "exact" | "ms_alias" | "unmatched" | "ambiguous";
  detail: string;
  tmsUnit: string;
};

export function itsImportExceptionKey(loadNumber: string, issue: string): string {
  return `${ITS_IMPORT_EXCEPTION_PREFIX}${loadNumber}:${issue}`;
}

export function itsImportLoadNumber(exceptionKey: string): string {
  const rest = exceptionKey.startsWith(ITS_IMPORT_EXCEPTION_PREFIX)
    ? exceptionKey.slice(ITS_IMPORT_EXCEPTION_PREFIX.length)
    : "";
  const splitAt = rest.lastIndexOf(":");
  return splitAt >= 0 ? rest.slice(0, splitAt) : rest;
}

export function itsImportIssueCode(exceptionKey: string): string {
  const rest = exceptionKey.startsWith(ITS_IMPORT_EXCEPTION_PREFIX)
    ? exceptionKey.slice(ITS_IMPORT_EXCEPTION_PREFIX.length)
    : exceptionKey;
  const splitAt = rest.lastIndexOf(":");
  return splitAt >= 0 ? rest.slice(splitAt + 1) : "";
}

export function itsImportIssueTitle(issue: string): string {
  if (issue in ITS_IMPORT_ISSUES) return ITS_IMPORT_ISSUES[issue as ItsImportIssue];
  return "ITS import";
}

export function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeUnitKey(value: string): string {
  return normalizeHeader(value).replace(/ /g, "");
}

/**
 * Exact unit match.
 * Trailer alias (flag, default on): ITS trailer "NNNN" matches TMS trailer "MSNNNN"
 * only when exactly one trailer normalizes to that unit. Digits-only fuzzy matching is not used.
 */
export function matchItsUnit(
  assets: Array<{ id: number; unit_number: string }>,
  raw: string,
  options?: { msAlias?: boolean },
): UnitMatch {
  if (isUnassignedAsset(raw)) return { id: null, via: "blank", detail: "", tmsUnit: "" };
  const wanted = normalizeUnitKey(raw);
  const exact = assets.filter((asset) => normalizeUnitKey(asset.unit_number) === wanted);
  if (exact.length === 1) {
    return { id: exact[0]!.id, via: "exact", detail: "", tmsUnit: exact[0]!.unit_number };
  }
  if (exact.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: exact.map((asset) => asset.unit_number).join(", "),
      tmsUnit: "",
    };
  }
  if (!options?.msAlias || !/^\d+$/.test(raw.trim())) {
    return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "" };
  }
  const aliasKey = normalizeUnitKey(`MS${raw.trim()}`);
  const alias = assets.filter((asset) => normalizeUnitKey(asset.unit_number) === aliasKey);
  if (alias.length === 1) {
    return {
      id: alias[0]!.id,
      via: "ms_alias",
      detail: `${raw.trim()} → ${alias[0]!.unit_number}`,
      tmsUnit: alias[0]!.unit_number,
    };
  }
  if (alias.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: alias.map((asset) => asset.unit_number).join(", "),
      tmsUnit: "",
    };
  }
  return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "" };
}

export function matchItsDriver(
  drivers: Array<{ id: number; name: string }>,
  raw: string,
): UnitMatch {
  if (isUnassignedAsset(raw)) return { id: null, via: "blank", detail: "", tmsUnit: "" };
  const wanted = normalizePersonName(raw);
  const matches = drivers.filter((driver) => normalizePersonName(driver.name) === wanted);
  if (matches.length === 1) {
    return { id: matches[0]!.id, via: "exact", detail: "", tmsUnit: matches[0]!.name };
  }
  if (matches.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: matches.map((driver) => driver.name).join(", "),
      tmsUnit: "",
    };
  }
  return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "" };
}

/** End of the "shipped between … and YYYY-MM-DD" day, when the file name has that range. */
export function snapshotFromExportName(fileName: string): string | null {
  const match = fileName.match(/between\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})/i);
  if (!match?.[2]) return null;
  return `${match[2]}T23:59:59.999Z`;
}

/**
 * Snapshot is the earlier of the file modified time and the end date in the file name.
 * A 9/29 export copied later still snapshots at the end of 9/29.
 */
export function resolveExportSnapshot(input: { fileName?: string; fileMtimeMs?: number | null }): string | null {
  const fromName = input.fileName ? snapshotFromExportName(input.fileName) : null;
  const mtime = input.fileMtimeMs;
  const fromMtime = mtime != null && Number.isFinite(mtime) && mtime > 0 ? new Date(mtime).toISOString() : null;
  if (fromName && fromMtime) return fromName < fromMtime ? fromName : fromMtime;
  return fromName ?? fromMtime;
}

export function exportIsStale(updatedAt: string, snapshot: string | null): boolean {
  if (!snapshot) return false;
  const updated = new Date(updatedAt).getTime();
  const cut = new Date(snapshot).getTime();
  if (Number.isNaN(updated) || Number.isNaN(cut)) return false;
  return updated > cut;
}

export function calendarDay(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? "";
}

export const ITS_IMPORT_USAGE =
  "npx tsx scripts/its-import.ts [--db <path>] [--dry-run | --apply] [--no-ms-trailer-alias] [--no-import-rate] [--create-inactive-units] <export.xlsx|csv> [more files...]";
