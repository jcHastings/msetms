import { renderUtf8Csv } from "./csv";
import type { LocationInput } from "./locations";
import type { Location, LocationRole } from "./types";

export { csvEscape, renderUtf8Csv } from "./csv";

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
  return renderUtf8Csv(ASCEND_LOCATION_HEADERS, []);
}

export function locationToAscendValues(
  location: Location,
): Record<(typeof ASCEND_LOCATION_HEADERS)[number], string> {
  const { phone, ext } = splitPhoneExt(location.phone);
  const notes = parseStoredLocationNotes(location.notes);
  return {
    "Location Name": location.name,
    "Address Line 1": location.street,
    "Address Line 2": "",
    City: location.city,
    State: location.state,
    "Zip/Postal Code": location.zip,
    "Phone number": phone,
    "Phone Ext.": ext,
    "Location Type": location.role,
    "Location Code": notes.code,
    "Primary Contact Name": notes.primary.name,
    "Primary Contact Phone Number": notes.primary.phone,
    "Primary Contact Ext.": notes.primary.ext,
    "Primary Contact Email": notes.primary.email,
    "Primary Contact Fax": notes.primary.fax,
    "Secondary Contact Name": notes.secondary.name,
    "Secondary Contact Phone Number": notes.secondary.phone,
    "Secondary Contact Ext.": notes.secondary.ext,
    "Secondary Contact Email": notes.secondary.email,
    "Secondary Contact Fax": notes.secondary.fax,
    "Location Private notes": notes.privateNotes,
    "Location Public notes": location.scheduling_notes,
  };
}

export function renderAscendLocationCsv(locations: Location[]): string {
  return renderUtf8Csv(
    ASCEND_LOCATION_HEADERS,
    locations.map((location) => {
      const values = locationToAscendValues(location);
      return ASCEND_LOCATION_HEADERS.map((header) => values[header]);
    }),
  );
}

export function decodeCsvBuffer(input: ArrayBuffer | Uint8Array | Buffer): string {
  const buffer = toNodeBuffer(input);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  return buffer.toString("utf8");
}

function toNodeBuffer(input: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input));
  return Buffer.from(Uint8Array.from(input));
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
      const hasValues = ASCEND_LOCATION_HEADERS.some((header) => get(header));
      if (hasValues) skipped += 1;
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

function splitPhoneExt(value: string): { phone: string; ext: string } {
  const match = value.trim().match(/^(.*?)\s+x\s*(.+)$/i);
  if (match) return { phone: match[1].trim(), ext: match[2].trim() };
  return { phone: value.trim(), ext: "" };
}

function parseStoredLocationNotes(notes: string): {
  privateNotes: string;
  code: string;
  primary: ContactBits;
  secondary: ContactBits;
} {
  const privateLines: string[] = [];
  let code = "";
  let primary = emptyContact("Primary");
  let secondary = emptyContact("Secondary");
  for (const line of notes.split(/\r?\n/)) {
    const trimmed = line.trim();
    const codeMatch = trimmed.match(/^code:\s*(.*)$/i);
    if (codeMatch) {
      code = codeMatch[1].trim();
      continue;
    }
    const primaryMatch = trimmed.match(/^primary:\s*(.*)$/i);
    if (primaryMatch) {
      primary = parseContactLine("Primary", primaryMatch[1]);
      continue;
    }
    const secondaryMatch = trimmed.match(/^secondary:\s*(.*)$/i);
    if (secondaryMatch) {
      secondary = parseContactLine("Secondary", secondaryMatch[1]);
      continue;
    }
    if (line.length > 0) privateLines.push(line);
  }
  return { privateNotes: privateLines.join("\n"), code, primary, secondary };
}

function emptyContact(label: string): ContactBits {
  return { label, name: "", phone: "", ext: "", email: "", fax: "" };
}

function parseContactLine(label: string, raw: string): ContactBits {
  const parts = raw
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  const faxPart = parts.find((part) => /^fax\s+/i.test(part));
  const emailPart = parts.find((part) => part.includes("@"));
  const phonePart = parts.find(
    (part) => part !== faxPart && part !== emailPart && /\d/.test(part) && !part.includes("@"),
  );
  const namePart = parts.find((part) => part !== faxPart && part !== emailPart && part !== phonePart);
  const phone = splitPhoneExt(phonePart ?? "");
  return {
    label,
    name: namePart ?? "",
    phone: phone.phone,
    ext: phone.ext,
    email: emailPart ?? "",
    fax: faxPart ? faxPart.replace(/^fax\s+/i, "").trim() : "",
  };
}
