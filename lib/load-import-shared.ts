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
  /** True when names, cities, and states could not be paired without guessing. */
  stops_uncertain: boolean;
  stop_parse_detail: string;
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
  const raw = decodeHtmlEntities(String(value).trim());
  return raw === "-" ? "" : raw;
}

/** &#039; &amp; &quot; and the other named and numeric entities ITS leaves in cells. */
export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
      return String.fromCodePoint(code);
    }
    return named[body.toLowerCase()] ?? entity;
  });
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

const GROUPED_MONEY = /^\$?\d{1,3}(,\d{3})*(\.\d{1,2})?$/;
const PLAIN_MONEY = /^\$?\d+(\.\d{1,2})?$/;

function atMostTwoDecimalPlaces(amount: number): boolean {
  const rendered = String(amount);
  const scientific = rendered.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (scientific) {
    const digits = `${scientific[2]}${scientific[3] ?? ""}`;
    return digits.length - 1 - Number(scientific[4]) <= 2;
  }
  const dot = rendered.indexOf(".");
  return dot === -1 || rendered.length - dot - 1 <= 2;
}

export function parseBillingRate(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || !atMostTwoDecimalPlaces(value)) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!GROUPED_MONEY.test(text) && !PLAIN_MONEY.test(text)) return null;
  const amount = Number(text.replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Commas inside a company suffix stay with the company.
 * "Elite Cold Storage, LLC" is one name. "May's, Bozzuto's" is two.
 * Suffixes: LLC, L.L.C., Inc, Inc., Co, Corp, Ltd, LP, LLP, PLLC, PC, and the long forms.
 */
const COMPANY_SUFFIX =
  /^(l\.?\s*l\.?\s*c\.?|llc|inc\.?|incorporated|co\.?|corp\.?|corporation|ltd\.?|limited|l\.?\s*p\.?|lp|l\.?\s*l\.?\s*p\.?|llp|p\.?\s*l\.?\s*l\.?\s*c\.?|pllc|p\.?\s*c\.?|pc)$/i;

/**
 * Names keep a comma that belongs to a company suffix.
 * Cities, states, streets, zips, and phones split on every comma so "NY, CO" stays two states.
 */
export function splitImportList(value: string, mode: "name" | "plain" = "name"): string[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (mode === "plain") return parts;
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length > 0 && COMPANY_SUFFIX.test(part)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${part}`;
      continue;
    }
    merged.push(part);
  }
  return merged;
}

/**
 * Pair one ITS lane (shipper or consignee).
 *
 * State rule, after the suffix-aware split:
 * - No states: every stop state stays blank. Certain.
 * - State count equals the stop count (max of names and cities): pair by index. Certain.
 * - Exactly one state and more than one stop: that state is the whole lane. ITS writes a
 *   repeated state once. Certain. This is the only carry-forward.
 * - Any other state count (for example 3 cities and 2 states): do not carry the previous
 *   state into the gap. Pair the states that are present and leave the rest blank.
 *   The parse is uncertain.
 * - Names and cities of different non-zero lengths are uncertain. A name is not copied
 *   onto later stops. A missing name or city stays blank.
 */
export function parseLaneStops(
  kind: "pickup" | "delivery",
  nameText: string,
  cityText: string,
  stateText: string,
  streetText = "",
  zipText = "",
  phoneText = "",
): { stops: ImportedStop[]; uncertain: boolean; detail: string } {
  const names = splitImportList(nameText, "name");
  const cities = splitImportList(cityText, "plain");
  const states = splitImportList(stateText, "plain");
  const streets = splitImportList(streetText, "plain");
  const zips = splitImportList(zipText, "plain");
  const phones = splitImportList(phoneText, "plain");
  const stopCount = Math.max(names.length, cities.length);
  if (stopCount === 0) {
    const detail = states.length > 0 ? `${kind} has states but no names or cities.` : "";
    return { stops: [], uncertain: states.length > 0, detail };
  }
  const details: string[] = [];
  let uncertain = false;
  if (names.length > 0 && cities.length > 0 && names.length !== cities.length) {
    uncertain = true;
    details.push(`${kind} names (${names.length}) and cities (${cities.length}) do not line up`);
  }
  let pairedStates: string[];
  if (states.length === 0) {
    pairedStates = Array.from({ length: stopCount }, () => "");
  } else if (states.length === stopCount) {
    pairedStates = states;
  } else if (states.length === 1) {
    pairedStates = Array.from({ length: stopCount }, () => states[0] ?? "");
  } else {
    uncertain = true;
    details.push(
      `${kind} states (${states.length}) and cities (${cities.length}) do not line up; missing states were not carried forward`,
    );
    pairedStates = Array.from({ length: stopCount }, (_, index) => states[index] ?? "");
  }
  const stops = Array.from({ length: stopCount }, (_, index) => ({
    kind,
    name: names[index] ?? "",
    city: cities[index] ?? "",
    state: pairedStates[index] ?? "",
    street: streets[index] ?? "",
    zip: zips[index] ?? "",
    phone: phones[index] ?? "",
  }));
  return { stops, uncertain, detail: details.join("; ") };
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
    name: names[index] || "",
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
  const pickups = parseLaneStops(
    "pickup",
    get("shipper"),
    get("shipper city"),
    get("shipper st", "shipper st.", "shipper state"),
    get("shipper street", "shipper address", "shipper addr", "shipper address 1", "pickup street", "pickup address"),
    get("shipper zip", "shipper zip code", "shipper postal", "pickup zip"),
    get("shipper phone", "shipper phone #", "shipper tel", "pickup phone"),
  );
  const deliveries = parseLaneStops(
    "delivery",
    get("consignee"),
    get("consignee city"),
    get("consignee st", "consignee st.", "consignee state"),
    get("consignee street", "consignee address", "consignee addr", "consignee address 1", "delivery street", "delivery address"),
    get("consignee zip", "consignee zip code", "consignee postal", "delivery zip"),
    get("consignee phone", "consignee phone #", "consignee tel", "delivery phone"),
  );
  const stopDetails = [pickups.detail, deliveries.detail].filter(Boolean);
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
    pickups: pickups.stops,
    deliveries: deliveries.stops,
    stops_uncertain: pickups.uncertain || deliveries.uncertain,
    stop_parse_detail: stopDetails.join("; "),
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
