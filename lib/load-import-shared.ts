/** Client-safe Ascend/legacy load sheet parse. No env, db, or secrets. */

import { cleanImportedDate } from "./driver-import-shared";
import { DEFAULT_LOAD_EQUIPMENT, isLoadStatus, LOAD_STATUSES, type LoadStatus } from "./types";

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

const NOTE_COLUMNS = ["Tie Sheet", "LAREDO", "SALT", "Transfer", "DAW", "Avenel"] as const;

export type ImportedStop = {
  kind: "pickup" | "delivery";
  name: string;
  city: string;
  state: string;
};

export type LoadImportValues = {
  load_number: string;
  status: LoadStatus;
  ship_date: string;
  del_date: string;
  customer_name: string;
  wsf_po: string;
  truck_unit: string;
  trailer_unit: string;
  equipment: string;
  notes: string;
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
  skipped?: number;
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
  const key = normalizeHeader(value).replace(/ /g, "_");
  if (isLoadStatus(key)) return key;
  if (key === "invoiced" || key === "billed" || key === "paid" || key === "closed") return "completed";
  if (key === "canceled" || key === "void" || key === "voided") return "cancelled";
  if (key === "open" || key === "booked" || key === "new") return "available";
  if (key === "at_pu" || key === "at pu" || key === "pickup") return "at_pickup";
  if (key === "at_del" || key === "at del" || key === "delivery") return "at_delivery";
  if (key === "rolling" || key === "en_route" || key === "enroute") return "in_transit";
  if (key === "picked" || key === "loaded") return "picked_up";
  const spaced = normalizeHeader(value);
  const match = LOAD_STATUSES.find((status) => status.replace(/_/g, " ") === spaced);
  return match ?? "available";
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
): ImportedStop[] {
  const count = Math.max(names.length, cities.length, states.length);
  if (count === 0) return [];
  return Array.from({ length: count }, (_, index) => ({
    kind,
    name: names[index] || names[0] || "",
    city: cities[index] || "",
    state: states[index] || "",
  }));
}

export function formatImportedLane(stops: ImportedStop[]): string {
  const first = stops[0];
  if (!first) return "";
  return [first.city, first.state].filter(Boolean).join(", ") || first.name;
}

export function matchAssetUnit(
  assets: Array<{ id: number; unit_number: string }>,
  raw: string,
): number | null {
  if (isUnassignedAsset(raw)) return null;
  const wanted = normalizeHeader(raw);
  const exact = assets.find((asset) => normalizeHeader(asset.unit_number) === wanted);
  if (exact) return exact.id;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const matches = assets.filter((asset) => asset.unit_number.replace(/\D/g, "") === digits);
  if (matches.length === 1) return matches[0].id;
  const stripped = matches.find(
    (asset) => normalizeHeader(asset.unit_number.replace(/^ms/i, "")) === normalizeHeader(raw.replace(/^ms/i, "")),
  );
  return stripped?.id ?? matches[0]?.id ?? null;
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
    if (!mapped.load_number) continue;
    seen.set(mapped.load_number, mapped);
  }
  return [...seen.values()];
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
  );
  const deliveries = zipImportedStops(
    "delivery",
    splitImportList(get("consignee")),
    splitImportList(get("consignee city")),
    splitImportList(get("consignee st", "consignee st.", "consignee state")),
  );
  const notes = NOTE_COLUMNS.map((column) => {
    const value = get(column);
    return value ? `${column}: ${value}` : "";
  })
    .filter(Boolean)
    .join("\n");
  return {
    load_number: get("load", "load #", "load number"),
    status: mapImportedLoadStatus(get("status")),
    ship_date: cleanImportedDate(pickRaw(record, ["ship date", "shipdate"])),
    del_date: cleanImportedDate(pickRaw(record, ["del date", "delivery date", "deldate"])),
    customer_name: get("customer"),
    wsf_po: get("wsf po", "po", "customer reference"),
    truck_unit: isUnassignedAsset(get("truck")) ? "" : get("truck"),
    trailer_unit: isUnassignedAsset(get("trailer")) ? "" : get("trailer"),
    equipment: mapImportedEquipment(get("equipment type", "equipment")),
    notes,
    pickups,
    deliveries,
  };
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
