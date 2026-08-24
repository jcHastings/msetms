/** Client-safe Ascend driver roster parse. No env, db, or secrets. */

import type { DriverKind } from "./types";

export type DriverImportValues = {
  name: string;
  phone: string;
  alt_phone: string;
  cell_phone: string;
  pager: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postal_zip: string;
  country: string;
  date_of_birth: string;
  date_of_hire: string;
  license_number: string;
  license_expires: string;
  medical_issued: string;
  medical_expires: string;
  drug_test_last: string;
  drug_test_next: string;
  notes: string;
  termination_date: string;
  driver_type: DriverKind;
  active: number;
};

export type DriverImportPreviewRow = DriverImportValues & {
  selectKey: string;
  matchDriverId: number | null;
  action: "create" | "update";
};

export type DriverImportPreviewState = {
  ok: boolean;
  error?: string;
  rows?: DriverImportPreviewRow[];
  created?: number;
  updated?: number;
  skipped?: number;
  message?: string;
};

const DATE_FIELDS = [
  "date_of_birth",
  "date_of_hire",
  "license_expires",
  "medical_issued",
  "medical_expires",
  "drug_test_last",
  "drug_test_next",
  "termination_date",
] as const;

const COLUMN_ALIASES: Record<keyof Omit<DriverImportValues, "driver_type" | "active">, string[]> = {
  name: ["name"],
  phone: ["telephone", "phone", "tel"],
  alt_phone: ["alternate telephone", "alt tel", "alt tel#", "alt - tel#", "alternate phone"],
  cell_phone: ["cell", "cell phone", "cellphone", "mobile"],
  pager: ["pager", "pager#"],
  email: ["e mail", "email", "email address"],
  address: ["address"],
  city: ["city"],
  state: ["province", "state", "prov"],
  postal_zip: ["postal zip code", "postal zip", "zip", "zip code", "postal code"],
  country: ["country"],
  date_of_birth: ["dob", "date of birth"],
  date_of_hire: ["doh", "date of hire"],
  license_number: ["license number", "license no", "license"],
  license_expires: ["license expiry", "exp date", "license expires"],
  medical_issued: ["medical date", "last medical"],
  medical_expires: ["next medical"],
  drug_test_last: ["drug test", "last drug test"],
  drug_test_next: ["next drug test"],
  notes: ["notes", "internal notes"],
  termination_date: ["termination date"],
};

export const ASCEND_DRIVER_FIXTURE_NAMES = [
  "Christopher Howell",
  "German Avila",
  "Jose Luis Torres",
  "Kelvin Whaley",
  "Lukas Olson",
  "Pike Osborne",
  "Steve Eller",
  "Yoel Feder",
] as const;

export function normalizeDriverName(value: string): string {
  return value.trim().toLowerCase();
}

export function parseDriverRosterText(text: string): DriverImportValues[] {
  const rows = recordsFromDelimitedText(text);
  return driverValuesFromRecords(rows);
}

export function driverValuesFromRecords(records: Array<Record<string, unknown>>): DriverImportValues[] {
  const seen = new Set<string>();
  const out: DriverImportValues[] = [];
  for (const record of records) {
    const mapped = mapDriverRecord(record);
    const key = normalizeDriverName(mapped.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
  }
  return out;
}

export function buildDriverImportPreview(
  rows: DriverImportValues[],
  drivers: Array<{ id: number; name: string }>,
): DriverImportPreviewRow[] {
  return rows.map((row) => {
    const match = drivers.find((driver) => normalizeDriverName(driver.name) === normalizeDriverName(row.name));
    return {
      ...row,
      selectKey: row.name,
      matchDriverId: match?.id ?? null,
      action: match ? "update" : "create",
    };
  });
}

export function mapDriverRecord(record: Record<string, unknown>): DriverImportValues {
  const get = (aliases: string[]) => pickDriverHeader(record, aliases);
  const values: DriverImportValues = {
    name: get(COLUMN_ALIASES.name),
    phone: get(COLUMN_ALIASES.phone),
    alt_phone: get(COLUMN_ALIASES.alt_phone),
    cell_phone: get(COLUMN_ALIASES.cell_phone),
    pager: get(COLUMN_ALIASES.pager),
    email: get(COLUMN_ALIASES.email),
    address: get(COLUMN_ALIASES.address),
    city: get(COLUMN_ALIASES.city),
    state: get(COLUMN_ALIASES.state),
    postal_zip: get(COLUMN_ALIASES.postal_zip),
    country: get(COLUMN_ALIASES.country) || "USA",
    date_of_birth: "",
    date_of_hire: "",
    license_number: licenseNumberText(pickDriverRaw(record, COLUMN_ALIASES.license_number)),
    license_expires: "",
    medical_issued: "",
    medical_expires: "",
    drug_test_last: "",
    drug_test_next: "",
    notes: get(COLUMN_ALIASES.notes),
    termination_date: "",
    driver_type: parseImportedDriverType(pickDriverHeader(record, ["team", "driver type", "drivertype"])),
    active: parseImportedActive(pickDriverHeader(record, ["status"])),
  };
  for (const field of DATE_FIELDS) {
    values[field] = cleanImportedDate(pickDriverRaw(record, COLUMN_ALIASES[field]));
  }
  return values;
}

export function parseImportedDriverType(value: string): DriverKind {
  const key = normalizeHeader(value);
  if (!key || key === "single") return "single";
  if (/(owner|oo)/.test(key)) return "owner_operator";
  if (/company/.test(key)) return "company_driver";
  return "single";
}

export function parseImportedActive(value: string): number {
  const key = normalizeHeader(value);
  if (!key) return 1;
  if (key === "0" || key === "inactive" || key === "no" || key === "false") return 0;
  return 1;
}

export function cleanImportedDate(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToIso(value);
  }
  const raw = String(value).trim();
  if (!raw || raw === "-" || /^0{4}-0{2}-0{2}/.test(raw)) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const mdy = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) return excelSerialToIso(serial);
  }
  return "";
}

export function licenseNumberText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const raw = String(value).trim();
  if (!raw || raw === "-") return "";
  if (/^\d+\.0+$/.test(raw)) return raw.slice(0, raw.indexOf("."));
  return raw;
}

export function recordsFromDelimitedText(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => normalizeHeader(header));
  if (!headers.includes("name")) return [];
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) row[header] = values[index] ?? "";
    });
    return row;
  });
}

function pickDriverHeader(record: Record<string, unknown>, aliases: string[]): string {
  return asImportText(pickDriverRaw(record, aliases));
}

function pickDriverRaw(record: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map((alias) => normalizeHeader(alias)));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeHeader(key))) return value;
  }
  return "";
}

function asImportText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const raw = String(value).trim();
  return raw === "-" ? "" : raw;
}

function excelSerialToIso(serial: number): string {
  const whole = Math.floor(serial);
  if (whole < 1) return "";
  const utc = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
