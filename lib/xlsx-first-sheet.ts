import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** First worksheet of an .xlsx as header/value records. Shared strings stay text; numbers stay numbers. */
export function recordsFromXlsx(buffer: Uint8Array): Array<Record<string, string | number>> {
  const files = unzipSync(buffer);
  const shared = parseSharedStrings(readZipText(files, "xl/sharedStrings.xml"));
  const sheetPath =
    Object.keys(files)
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort()[0] ?? "";
  const sheet = readZipText(files, sheetPath);
  if (!sheet) return [];
  const grid = parseSheetGrid(sheet, shared);
  if (grid.length < 2) return [];
  const headers = (grid[0] ?? []).map((cell) => String(cell ?? "").trim());
  if (!headers.some((header) => normalizeLoose(header) === "name")) return [];
  return grid.slice(1).map((cells) => {
    const row: Record<string, string | number> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cells[index];
      if (value !== undefined) row[header] = value;
    });
    return row;
  });
}

function readZipText(files: Record<string, Uint8Array>, name: string): string {
  const data = files[name] ?? files[name.replaceAll("/", "\\")];
  return data ? strFromU8(data) : "";
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const blocks = xml.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  for (const block of blocks) {
    const parts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    out.push(parts.join(""));
  }
  return out;
}

function parseSheetGrid(xml: string, shared: string[]): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [];
  const rowBlocks = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rowBlocks) {
    const cells: Array<string | number> = [];
    const cellBlocks = rowXml.match(/<c\b[\s\S]*?<\/c>/g) ?? [];
    for (const cellXml of cellBlocks) {
      const ref = attr(cellXml, "r");
      const type = attr(cellXml, "t");
      const index = colIndex(ref);
      if (index < 0) continue;
      cells[index] = cellValue(cellXml, type, shared);
    }
    rows.push(cells);
  }
  return rows;
}

function cellValue(cellXml: string, type: string, shared: string[]): string | number {
  if (type === "inlineStr") {
    const parts = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    return parts.join("");
  }
  const raw = decodeXml((cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/) ?? [])[1] ?? "");
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "1" : "0";
  if (type === "str" || type === "e") return raw;
  if (raw && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  return raw;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, "");
  if (!letters) return -1;
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function attr(xml: string, name: string): string {
  return (xml.match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeLoose(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildXlsxFromGrid(rows: Array<Array<string | number>>): Uint8Array {
  const shared: string[] = [];
  const share = (text: string) => {
    shared.push(escapeXml(text));
    return shared.length - 1;
  };
  const sheetRows = rows.map((cells, rowIndex) => {
    const xml = cells
      .map((value, colIndex) => {
        const ref = `${colLetter(colIndex)}${rowIndex + 1}`;
        if (typeof value === "number" && Number.isFinite(value)) {
          return `<c r="${ref}"><v>${value}</v></c>`;
        }
        return `<c r="${ref}" t="s"><v>${share(String(value ?? ""))}</v></c>`;
      })
      .join("");
    return `<row r="${rowIndex + 1}">${xml}</row>`;
  });
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((text) => `<si><t>${text}</t></si>`)
    .join("")}</sst>`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  return zipSync({
    "xl/sharedStrings.xml": strToU8(sharedXml),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });
}

function colLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
