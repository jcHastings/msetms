/** Client-safe Ascend/legacy load sheet parse. No env, db, or secrets. */

import { cleanImportedDate } from "./driver-import-shared";
import { DEFAULT_LOAD_EQUIPMENT, isLoadStatus, type LoadStatus } from "./types";

export const ASCEND_LOAD_HEADERS = [
  "Load #",
  "Tie Sheet",
  "WSF PO",
  "LAREDO",
  "SALT",
  "Transfer",
  "DAW",
  "Avenel",
  "Status",
  "Ship Date",
  "Del Date",
  "Customer",
  "Shipper",
  "Shipper City",
  "Shipper St.",
  "Consignee",
  "Consignee City",
  "Consignee St.",
  "Truck",
  "Trailer",
  "Equipment Type",
] as const;

const NOTE_COLUMNS = [
  "Tie Sheet",
  "LAREDO",
  "SALT",
  "Transfer",
  "DAW",
  "Avenel",
  "Salt/Spice",
  "Work Order #",
  "Shipper PO Numbers",
  "Consignee PO Numbers",
] as const;

/**
 * ITS Load Finder status → TMS status.
 * This table is the map. Callers look up a row; they do not re-code the cases.
 * Blank is available. Any other word that is not in this table is unmapped.
 */
export const ITS_STATUS_MAP: ReadonlyArray<{ its: string; tms: LoadStatus; note: string }> = [
  { its: "", tms: "available", note: "Blank status. A new load opens as available." },
  { its: "available", tms: "available", note: "ITS Available." },
  { its: "open", tms: "available", note: "Open with the customer, not covered." },
  { its: "booked", tms: "available", note: "Booked, not covered." },
  { its: "new", tms: "available", note: "New load." },
  { its: "pending", tms: "hold", note: "Pending stays on hold. It is not available to cover again." },
  { its: "hold", tms: "hold", note: "Hold." },
  { its: "covered", tms: "assigned", note: "Covered means a unit is assigned. It is not available." },
  { its: "assigned", tms: "assigned", note: "Assigned." },
  { its: "in yard", tms: "assigned", note: "In Yard is at the yard with a unit. It is not available." },
  { its: "dispatched", tms: "dispatched", note: "ITS Dispatched." },
  { its: "at pickup", tms: "at_pickup", note: "At pickup." },
  { its: "at pu", tms: "at_pickup", note: "At pickup." },
  { its: "pickup", tms: "at_pickup", note: "At pickup." },
  { its: "loading", tms: "loading", note: "Loading." },
  { its: "picked", tms: "picked_up", note: "Picked up." },
  { its: "picked up", tms: "picked_up", note: "Picked up." },
  { its: "loaded", tms: "picked_up", note: "Loaded / picked up." },
  { its: "on route", tms: "in_transit", note: "ITS On Route is in transit. It is not available." },
  { its: "en route", tms: "in_transit", note: "En route." },
  { its: "enroute", tms: "in_transit", note: "En route." },
  { its: "rolling", tms: "in_transit", note: "Rolling." },
  { its: "in transit", tms: "in_transit", note: "In transit." },
  { its: "at delivery", tms: "at_delivery", note: "At delivery." },
  { its: "at del", tms: "at_delivery", note: "At delivery." },
  { its: "delivery", tms: "at_delivery", note: "At delivery." },
  { its: "unloading", tms: "unloading", note: "Unloading." },
  { its: "delivered", tms: "delivered", note: "Delivered." },
  { its: "invoiced", tms: "completed", note: "ITS Invoiced is TMS completed. The import does not send an invoice." },
  { its: "invoiced paid", tms: "completed", note: "ITS Invoiced Paid is TMS completed. It does not mark QuickBooks or send mail." },
  { its: "paid", tms: "completed", note: "Paid stays completed." },
  { its: "billed", tms: "completed", note: "Billed stays completed." },
  { its: "closed", tms: "completed", note: "Closed stays completed." },
  { its: "completed", tms: "completed", note: "Completed." },
  { its: "accounting", tms: "accounting", note: "Accounting. A stale export must not pull this backwards." },
  { its: "cancelled", tms: "cancelled", note: "Cancelled." },
  { its: "canceled", tms: "cancelled", note: "Canceled spelling." },
  { its: "void", tms: "cancelled", note: "Void." },
  { its: "voided", tms: "cancelled", note: "Voided." },
];

/** Higher rank is further along. The importer never writes a lower rank over a higher one. */
export const LOAD_STATUS_RANK: Record<LoadStatus, number> = {
  available: 10,
  hold: 20,
  assigned: 30,
  dispatched: 40,
  at_pickup: 50,
  loading: 60,
  picked_up: 70,
  in_transit: 80,
  at_delivery: 90,
  unloading: 100,
  delivered: 110,
  accounting: 120,
  completed: 120,
  cancelled: 130,
};

export function itsStatusMapMarkdown(): string {
  const lines = ["| ITS status | TMS status | Note |", "| --- | --- | --- |"];
  for (const row of ITS_STATUS_MAP) {
    lines.push(`| ${row.its || "(blank)"} | ${row.tms} | ${row.note} |`);
  }
  lines.push("| (anything else) | unmapped | Exception Inbox. A new load is created on hold. An existing load keeps its status. |");
  return lines.join("\n");
}

export function lookupItsStatus(value: string): LoadStatus | null {
  const spaced = normalizeHeader(value);
  const underscored = spaced.replace(/ /g, "_");
  const hit = ITS_STATUS_MAP.find((row) => row.its === spaced || row.its.replace(/ /g, "_") === underscored);
  if (hit) return hit.tms;
  if (isLoadStatus(underscored)) return underscored;
  if (isLoadStatus(spaced)) return spaced;
  return null;
}

export function statusMovesBackwards(current: string, next: string): boolean {
  if (!current || current === next) return false;
  if (current === "cancelled" || current === "accounting") return next !== current;
  if (next === "cancelled" && statusRank(current) >= statusRank("delivered")) return true;
  return statusRank(next) < statusRank(current);
}

function statusRank(status: string): number {
  if (isLoadStatus(status)) return LOAD_STATUS_RANK[status];
  return Number.POSITIVE_INFINITY;
}

export type ImportedStop = {
  kind: "pickup" | "delivery";
  name: string;
  city: string;
  state: string;
  street?: string;
  zip?: string;
  phone?: string;
};

export type LoadImportValues = {
  load_number: string;
  status: LoadStatus;
  raw_status: string;
  status_mapped: boolean;
  ship_date: string;
  del_date: string;
  customer_name: string;
  wsf_po: string;
  truck_unit: string;
  trailer_unit: string;
  driver_name: string;
  billing_rate: number | null;
  equipment: string;
  equipment_specified: boolean;
  notes: string;
  date_problems: string[];
  pickups: ImportedStop[];
  deliveries: ImportedStop[];
};

export type LoadImportPreviewRow = LoadImportValues & {
  selectKey: string;
  matchLoadId: number | null;
  action: "create" | "update";
  origin: string;
  destination: string;
};

export type LoadImportPreviewState = {
  ok: boolean;
  error?: string;
  rows?: LoadImportPreviewRow[];
  count?: number;
  sampleNumbers?: string[];
  created?: number;
  updated?: number;
  unchanged?: number;
  skipped?: number;
  sourceName?: string;
  exportSnapshot?: string | null;
  message?: string;
};

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function asImportText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const raw = String(value).trim();
  return raw === "-" ? "" : raw;
}

export function isUnassignedAsset(value: string): boolean {
  const key = normalizeHeader(value);
  return !key || key === "assign later" || key === "unassigned" || key === "n a" || key === "na";
}

export function mapImportedEquipment(value: string): string {
  const key = normalizeHeader(value);
  if (!key) return DEFAULT_LOAD_EQUIPMENT;
  if (key.includes("reefer")) return "reefer_53";
  if (key.includes("dry") || key.includes("van")) return "dry_van_53";
  if (key.includes("flat")) return "flatbed";
  if (key.includes("box")) return "box";
  if (key.includes("power")) return "power_only";
  return DEFAULT_LOAD_EQUIPMENT;
}

export function mapImportedLoadStatus(value: string): LoadStatus {
  return lookupItsStatus(value) ?? "available";
}

export function parseBillingRate(value: unknown): number | null {
  const text = asImportText(value).replace(/[$,]/g, "").trim();
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function splitImportList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function zipImportedStops(
  kind: "pickup" | "delivery",
  names: string[],
  cities: string[],
  states: string[],
  streets: string[] = [],
  zips: string[] = [],
  phones: string[] = [],
): ImportedStop[] {
  const count = Math.max(names.length, cities.length, states.length, streets.length, zips.length, phones.length);
  if (count === 0) return [];
  return Array.from({ length: count }, (_, index) => ({
    kind,
    name: names[index] || names[0] || "",
    city: cities[index] || "",
    state: states[index] || "",
    street: streets[index] || "",
    zip: zips[index] || "",
    phone: phones[index] || "",
  }));
}

export function formatImportedLane(stops: ImportedStop[]): string {
  const first = stops[0];
  if (!first) return "";
  return [first.city, first.state].filter(Boolean).join(", ") || first.name;
}

/** Exact unit match only. Digits-only fuzzy matching is not used. The MS trailer alias lives in the ITS importer. */
export function matchAssetUnit(
  assets: Array<{ id: number; unit_number: string }>,
  raw: string,
): number | null {
  if (isUnassignedAsset(raw)) return null;
  const wanted = normalizeHeader(raw).replace(/ /g, "");
  const matches = assets.filter((asset) => normalizeHeader(asset.unit_number).replace(/ /g, "") === wanted);
  return matches.length === 1 ? matches[0]!.id : null;
}

export function recordsFromLoadSheetText(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  if (!headers.some((header) => normalizeHeader(header) === "load")) return [];
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header.trim()) row[header.trim()] = values[index] ?? "";
    });
    return row;
  });
}

export function loadValuesFromRecords(records: Array<Record<string, unknown>>): LoadImportValues[] {
  const seen = new Map<string, LoadImportValues>();
  for (const record of records) {
    const mapped = mapLoadRecord(record);
    if (!isPlausibleLoadNumber(mapped.load_number)) continue;
    seen.set(mapped.load_number, mapped);
  }
  return [...seen.values()];
}

export function isPlausibleLoadNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const key = normalizeHeader(trimmed);
  if (key === "load" || key === "load number" || key === "load no") return false;
  if (/\bpage\b/i.test(trimmed) || /\s/.test(trimmed)) return false;
  return /[0-9]/.test(trimmed);
}

export function buildLoadImportPreview(
  rows: LoadImportValues[],
  loads: Array<{ id: number; load_number: string }>,
): LoadImportPreviewRow[] {
  return rows.map((row) => {
    const match = loads.find((load) => load.load_number === row.load_number);
    return {
      ...row,
      selectKey: row.load_number,
      matchLoadId: match?.id ?? null,
      action: match ? "update" : "create",
      origin: formatImportedLane(row.pickups),
      destination: formatImportedLane(row.deliveries),
    };
  });
}

export function mapLoadRecord(record: Record<string, unknown>): LoadImportValues {
  const get = (...aliases: string[]) => asImportText(pickRaw(record, aliases));
  const pickups = zipImportedStops(
    "pickup",
    splitImportList(get("shipper")),
    splitImportList(get("shipper city")),
    splitImportList(get("shipper st", "shipper st.", "shipper state")),
    splitImportList(get("shipper street", "shipper address", "shipper addr", "shipper address 1", "pickup street", "pickup address")),
    splitImportList(get("shipper zip", "shipper zip code", "shipper postal", "pickup zip")),
    splitImportList(get("shipper phone", "shipper phone #", "shipper tel", "pickup phone")),
  );
  const deliveries = zipImportedStops(
    "delivery",
    splitImportList(get("consignee")),
    splitImportList(get("consignee city")),
    splitImportList(get("consignee st", "consignee st.", "consignee state")),
    splitImportList(get("consignee street", "consignee address", "consignee addr", "consignee address 1", "delivery street", "delivery address")),
    splitImportList(get("consignee zip", "consignee zip code", "consignee postal", "delivery zip")),
    splitImportList(get("consignee phone", "consignee phone #", "consignee tel", "delivery phone")),
  );
  const notes = NOTE_COLUMNS.map((column) => {
    const value = get(column);
    return value ? `${column}: ${value}` : "";
  })
    .filter(Boolean)
    .join("\n");
  const rawStatus = get("status");
  const mappedStatus = lookupItsStatus(rawStatus);
  const equipmentText = get("equipment type", "equipment");
  const driverText = get("carrier driver", "carrier/driver", "driver");
  const dateProblems = [
    dateProblem(record, ["ship date", "shipdate"], "Ship Date"),
    dateProblem(record, ["del date", "delivery date", "deldate"], "Del Date"),
  ].filter((item): item is string => Boolean(item));
  return {
    load_number: get("load", "load #", "load number"),
    status: mappedStatus ?? "hold",
    raw_status: rawStatus,
    status_mapped: mappedStatus != null,
    ship_date: cleanImportedDate(pickRaw(record, ["ship date", "shipdate"])),
    del_date: cleanImportedDate(pickRaw(record, ["del date", "delivery date", "deldate"])),
    customer_name: get("customer"),
    wsf_po: get("wsf po", "po", "customer reference"),
    truck_unit: isUnassignedAsset(get("truck")) ? "" : get("truck"),
    trailer_unit: isUnassignedAsset(get("trailer")) ? "" : get("trailer"),
    driver_name: isUnassignedAsset(driverText) ? "" : driverText,
    billing_rate: parseBillingRate(pickRaw(record, ["total billing rate"])),
    equipment: mapImportedEquipment(equipmentText),
    equipment_specified: Boolean(equipmentText),
    notes,
    date_problems: dateProblems,
    pickups,
    deliveries,
  };
}

function dateProblem(record: Record<string, unknown>, aliases: string[], label: string): string | null {
  const raw = pickRaw(record, aliases);
  const text = asImportText(raw);
  if (!text) return null;
  if (!cleanImportedDate(raw)) return `${label} "${text}"`;
  return null;
}

function pickRaw(record: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map((alias) => normalizeHeader(alias)));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeHeader(key))) return value;
  }
  return "";
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char in counts) counts[char] += 1;
  }
  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0] ?? [","])[0];
}

function splitCsvLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}
