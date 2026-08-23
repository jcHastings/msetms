import type { LocationInput } from "./locations";
import type { LocationRole } from "./types";

export const ASCEND_LOCATION_HEADERS = [
  "Location Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Zip/Postal Code",
  "Phone number",
  "Phone Ext.",
  "Location Type",
  "Location Code",
  "Primary Contact Name",
  "Primary Contact Phone Number",
  "Primary Contact Ext.",
  "Primary Contact Email",
  "Primary Contact Fax",
  "Secondary Contact Name",
  "Secondary Contact Phone Number",
  "Secondary Contact Ext.",
  "Secondary Contact Email",
  "Secondary Contact Fax",
  "Location Private notes",
  "Location Public notes",
] as const;

export type LocationCsvRowError = { row: number; error: string };

export type ParsedLocationCsvRow = {
  row: number;
  input: LocationInput;
  matchKey: string;
};

export type LocationCsvParseResult = {
  rows: ParsedLocationCsvRow[];
  skipped: number;
  errors: LocationCsvRowError[];
};

export type LocationCsvImportResult = {
  ok: boolean;
  error?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: LocationCsvRowError[];
};

export function renderAscendLocationTemplate(): string {
  return `\uFEFF${ASCEND_LOCATION_HEADERS.map(csvEscape).join(",")}\r\n`;
}

export function decodeCsvBuffer(input: ArrayBuffer | Uint8Array | Buffer): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  return buffer.toString("utf8");
}

export function parseAscendLocationCsv(text: string): LocationCsvParseResult {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new Error("The CSV is empty. Download the template and keep the header row.");
  }
  const headerMap = mapHeaders(records[0]);
  if (headerMap["location name"] == null) {
    throw new Error("Use the Ascend location CSV headers (download the template).");
  }

  const rows: ParsedLocationCsvRow[] = [];
  const errors: LocationCsvRowError[] = [];
  let skipped = 0;

  records.slice(1).forEach((cells, index) => {
    const excelRow = index + 2;
    const get = (header: (typeof ASCEND_LOCATION_HEADERS)[number]) =>
      (cells[headerMap[normalizeHeader(header)] ?? -1] ?? "").trim();
    const name = get("Location Name");
    if (!name) {
      skipped += 1;
      return;
    }
    const typeRaw = get("Location Type");
    const role = parseLocationType(typeRaw);
    if (!role) {
      errors.push({
        row: excelRow,
        error: `Location Type must be shipper, receiver, or both (got “${typeRaw}”).`,
      });
      return;
    }
    const line1 = get("Address Line 1");
    const line2 = get("Address Line 2");
    const street = [line1, line2].filter(Boolean).join(", ");
    const city = get("City");
    const state = normalizeState(get("State"));
    const zip = get("Zip/Postal Code");
    const phone = formatPhoneExt(get("Phone number"), get("Phone Ext."));
    const notes = formatLocationNotes({
      privateNotes: get("Location Private notes"),
      code: get("Location Code"),
      primary: {
        name: get("Primary Contact Name"),
        phone: get("Primary Contact Phone Number"),
        ext: get("Primary Contact Ext."),
        email: get("Primary Contact Email"),
        fax: get("Primary Contact Fax"),
        label: "Primary",
      },
      secondary: {
        name: get("Secondary Contact Name"),
        phone: get("Secondary Contact Phone Number"),
        ext: get("Secondary Contact Ext."),
        email: get("Secondary Contact Email"),
        fax: get("Secondary Contact Fax"),
        label: "Secondary",
      },
    });
    const input: LocationInput = {
      name,
      street,
      city,
      state,
      zip,
      phone,
      notes,
      role,
      scheduling_type: "fcfs",
      hours: "",
      scheduling_notes: get("Location Public notes"),
    };
    rows.push({
      row: excelRow,
      input,
      matchKey: locationMatchKey(name, street, city, state, zip),
    });
  });

  return { rows, skipped, errors };
}

export function locationMatchKey(
  name: string,
  street: string,
  city: string,
  state: string,
  zip: string,
): string {
  return [name, street, city, state, zip].map(normalizeMatchPart).join("|");
}

function normalizeMatchPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeState(value: string): string {
  const trimmed = value.trim();
  return trimmed.length === 2 ? trimmed.toUpperCase() : trimmed;
}

function parseLocationType(value: string): LocationRole | null {
  const key = value.trim().toLowerCase();
  if (!key) return "both";
  if (key === "shipper") return "shipper";
  if (key === "receiver" || key === "consignee") return "receiver";
  if (key === "both" || key === "shipper and receiver" || key === "shipper/receiver") return "both";
  return null;
}

function formatPhoneExt(phone: string, ext: string): string {
  const number = phone.trim();
  const extra = ext.trim();
  if (number && extra) return `${number} x${extra}`;
  return number;
}

function formatLocationNotes(input: {
  privateNotes: string;
  code: string;
  primary: ContactBits;
  secondary: ContactBits;
}): string {
  const parts: string[] = [];
  if (input.privateNotes) parts.push(input.privateNotes);
  if (input.code) parts.push(`Code: ${input.code}`);
  const primary = formatContactLine(input.primary);
  const secondary = formatContactLine(input.secondary);
  if (primary) parts.push(primary);
  if (secondary) parts.push(secondary);
  return parts.join("\n");
}

type ContactBits = {
  label: string;
  name: string;
  phone: string;
  ext: string;
  email: string;
  fax: string;
};

function formatContactLine(contact: ContactBits): string {
  const phone = formatPhoneExt(contact.phone, contact.ext);
  const bits = [contact.name, phone, contact.email, contact.fax ? `fax ${contact.fax}` : ""].filter(Boolean);
  if (bits.length === 0) return "";
  return `${contact.label}: ${bits.join(" · ")}`;
}

function mapHeaders(cells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key && map[key] == null) map[key] = index;
  });
  return map;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") continue;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
