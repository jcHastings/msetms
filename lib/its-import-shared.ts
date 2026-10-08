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
  stop_parse_uncertain: "ITS import — stop parse uncertain",
} as const;

export type ItsImportIssue = keyof typeof ITS_IMPORT_ISSUES;

export type UnitMatch = {
  id: number | null;
  via: "blank" | "exact" | "company" | "ms_alias" | "created" | "unmatched" | "ambiguous";
  detail: string;
  tmsUnit: string;
  /** False for a newly created inactive record and for an existing inactive record. */
  active: boolean;
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
function unitActive(asset: { active?: number | boolean | null }): boolean {
  if (asset.active == null) return true;
  return asset.active !== 0 && asset.active !== false;
}

function unitResult(
  asset: { id: number; unit_number?: string; name?: string; active?: number | boolean | null },
  via: UnitMatch["via"],
  detail: string,
): UnitMatch {
  return {
    id: asset.id,
    via,
    detail,
    tmsUnit: asset.unit_number ?? asset.name ?? "",
    active: unitActive(asset),
  };
}

export function matchItsUnit(
  assets: Array<{ id: number; unit_number: string; active?: number | boolean | null }>,
  raw: string,
  options?: { msAlias?: boolean },
): UnitMatch {
  if (isUnassignedAsset(raw)) return { id: null, via: "blank", detail: "", tmsUnit: "", active: false };
  const wanted = normalizeUnitKey(raw);
  const exact = assets.filter((asset) => normalizeUnitKey(asset.unit_number) === wanted);
  if (exact.length === 1) return unitResult(exact[0]!, "exact", "");
  if (exact.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: exact.map((asset) => asset.unit_number).join(", "),
      tmsUnit: "",
      active: false,
    };
  }
  if (!options?.msAlias || !/^\d+$/.test(raw.trim())) {
    return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "", active: false };
  }
  const aliasKey = normalizeUnitKey(`MS${raw.trim()}`);
  const alias = assets.filter((asset) => normalizeUnitKey(asset.unit_number) === aliasKey);
  if (alias.length === 1) {
    return unitResult(alias[0]!, "ms_alias", `${raw.trim()} → ${alias[0]!.unit_number}`);
  }
  if (alias.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: alias.map((asset) => asset.unit_number).join(", "),
      tmsUnit: "",
      active: false,
    };
  }
  return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "", active: false };
}

export type ItsDriverRecord = {
  id: number;
  name: string;
  company_name?: string | null;
  active?: number | boolean | null;
};

/**
 * Exact normalized driver name, or exact normalized owner-operator company name.
 * "3K3B Trucking LLC" matches the driver whose company name is that string.
 */
export function matchItsDriver(drivers: ItsDriverRecord[], raw: string): UnitMatch {
  if (isUnassignedAsset(raw)) return { id: null, via: "blank", detail: "", tmsUnit: "", active: false };
  const wanted = normalizePersonName(raw);
  const byName = drivers.filter((driver) => normalizePersonName(driver.name) === wanted);
  const byCompany = drivers.filter((driver) => {
    const company = normalizePersonName(driver.company_name ?? "");
    return company.length > 0 && company === wanted && normalizePersonName(driver.name) !== wanted;
  });
  const matches = [...byName, ...byCompany.filter((driver) => !byName.some((named) => named.id === driver.id))];
  if (matches.length === 1) {
    const driver = matches[0]!;
    const via = byName.some((named) => named.id === driver.id) ? "exact" : "company";
    return unitResult({ ...driver, unit_number: driver.name }, via, via === "company" ? driver.company_name ?? "" : "");
  }
  if (matches.length > 1) {
    return {
      id: null,
      via: "ambiguous",
      detail: matches.map((driver) => driver.name).join(", "),
      tmsUnit: "",
      active: false,
    };
  }
  return { id: null, via: "unmatched", detail: raw.trim(), tmsUnit: "", active: false };
}

/** Digits-only ITS trailers are stored as MS plus those digits: 1520 becomes MS1520. */
export function inactiveTrailerUnit(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return `MS${trimmed}`;
  return trimmed;
}

/** LLC, Inc, Holdings, Trucking, Transport(s), Logistics. Dots are ignored. */
export function looksLikeCompanyName(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/\./g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const markers = new Set(["llc", "inc", "holdings", "trucking", "transport", "transports", "logistics"]);
  return tokens.some((token) => markers.has(token));
}

/** End of the "shipped between … and YYYY-MM-DD" day, when the file name has that range. */
export function snapshotFromExportName(fileName: string): string | null {
  const match = fileName.match(/between\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})/i);
  if (!match?.[2]) return null;
  return `${match[2]}T23:59:59.999Z`;
}

export type ExportSnapshotSource = "override" | "xlsx-modified" | "xlsx-created" | "mtime" | "file-name" | "none";

export function parseSnapshotInstant(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Real pull time, not the ship-date range.
 * --snapshot override, then xlsx core.xml modified, then created, then file mtime,
 * then the end date in the file name.
 */
export function resolveExportSnapshot(input: {
  fileName?: string;
  fileMtimeMs?: number | null;
  docModified?: string | null;
  docCreated?: string | null;
  override?: string | null;
}): { snapshot: string | null; source: ExportSnapshotSource } {
  const override = parseSnapshotInstant(input.override);
  if (override) return { snapshot: override, source: "override" };
  const modified = parseSnapshotInstant(input.docModified);
  if (modified) return { snapshot: modified, source: "xlsx-modified" };
  const created = parseSnapshotInstant(input.docCreated);
  if (created) return { snapshot: created, source: "xlsx-created" };
  const mtime = input.fileMtimeMs;
  if (mtime != null && Number.isFinite(mtime) && mtime > 0) {
    return { snapshot: new Date(mtime).toISOString(), source: "mtime" };
  }
  const fromName = input.fileName ? snapshotFromExportName(input.fileName) : null;
  if (fromName) return { snapshot: fromName, source: "file-name" };
  return { snapshot: null, source: "none" };
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
  "npx tsx scripts/its-import.ts [--db <path>] [--dry-run | --apply] [--snapshot <ISO>] [--no-ms-trailer-alias] [--no-import-rate] [--create-inactive-units] <export.xlsx|csv> [more files...]";
