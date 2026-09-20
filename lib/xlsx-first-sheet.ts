import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** First worksheet of an .xlsx as header/value records. Shared strings stay text; numbers stay numbers. */
export function recordsFromXlsx(buffer: Uint8Array): Array<Record<string, string | number>> {
  const records = recordsFromFirstSheet(buffer);
  if (!records.length) return [];
  const headers = Object.keys(records[0] ?? {});
  if (!headers.some((header) => normalizeLoose(header) === "name")) return [];
  return records;
}

/** First worksheet records without requiring a Name column (Ascend load sheets). */
export function recordsFromFirstSheet(buffer: Uint8Array): Array<Record<string, string | number>> {
  const files = unzipSync(buffer);
  const shared = parseSharedStrings(readZipText(files, "xl/sharedStrings.xml"));
  const sheetPath = listSheetPaths(files)[0] ?? "";
  const sheet = readZipText(files, sheetPath);
  if (!sheet) return [];
  return recordsFromGrid(parseSheetGrid(sheet, shared), { firstRowIsHeader: true });
}

/**
 * Every worksheet that looks like a load sheet (Load # header).
 * Merges print-layout pages / extra sheets and skips repeated headers.
 */
export function recordsFromLoadWorkbook(buffer: Uint8Array): Array<Record<string, string | number>> {
  const files = unzipSync(buffer);
  const shared = parseSharedStrings(readZipText(files, "xl/sharedStrings.xml"));
  const merged: Array<Record<string, string | number>> = [];
  const seen = new Set<string>();
  for (const sheetPath of listSheetPaths(files)) {
    const records = recordsFromGrid(parseSheetGrid(readZipText(files, sheetPath), shared), {
      firstRowIsHeader: false,
    });
    for (const record of records) {
      const loadNumber = loadNumberFromRecord(record).toLowerCase();
      if (loadNumber && seen.has(loadNumber)) continue;
      if (loadNumber) seen.add(loadNumber);
      merged.push(record);
    }
  }
  return merged;
}

function listSheetPaths(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name.replaceAll("\\", "/")))
    .sort((left, right) => sheetIndex(left) - sheetIndex(right));
}

function sheetIndex(path: string): number {
  return Number((path.replaceAll("\\", "/").match(/sheet(\d+)\.xml$/i) ?? [])[1] ?? 0);
}

function isLoadHeaderRow(cells: Array<string | number>): boolean {
  return cells.some((cell) => {
    const key = normalizeLoose(String(cell ?? ""));
    return key === "load" || key === "load number";
  });
}

function loadNumberFromRecord(record: Record<string, string | number>): string {
  for (const [key, value] of Object.entries(record)) {
    const header = normalizeLoose(key);
    if (header === "load" || header === "load number") return String(value ?? "").trim();
  }
  return "";
}

function recordsFromGrid(
  grid: Array<Array<string | number>>,
  options: { firstRowIsHeader: boolean },
): Array<Record<string, string | number>> {
  if (grid.length < 2) return [];
  const headerIndex = options.firstRowIsHeader ? 0 : grid.findIndex(isLoadHeaderRow);
  if (headerIndex < 0) return [];
  const headers = (grid[headerIndex] ?? []).map((cell) => String(cell ?? "").trim());
  if (!options.firstRowIsHeader && !headers.some((header) => {
    const key = normalizeLoose(header);
    return key === "load" || key === "load number";
  })) {
    return [];
  }
  const records: Array<Record<string, string | number>> = [];
  for (const cells of grid.slice(headerIndex + 1)) {
    if (!options.firstRowIsHeader && isLoadHeaderRow(cells)) continue;
    if (cells.every((cell) => String(cell ?? "").trim() === "")) continue;
    const row: Record<string, string | number> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cells[index];
      if (value !== undefined) row[header] = value;
    });
    if (!options.firstRowIsHeader) {
      const loadNumber = loadNumberFromRecord(row);
      if (!loadNumber) continue;
      const key = normalizeLoose(loadNumber);
      if (key === "load" || key === "load number") continue;
    }
    records.push(row);
  }
  return records;
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
  return buildXlsxFromSheets([rows]);
}

export function buildXlsxFromSheets(sheets: Array<Array<Array<string | number>>>): Uint8Array {
  const shared: string[] = [];
  const share = (text: string) => {
    shared.push(escapeXml(text));
    return shared.length - 1;
  };
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((rows, sheetIndex) => {
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
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
    files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = strToU8(sheetXml);
  });
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((text) => `<si><t>${text}</t></si>`)
    .join("")}</sst>`;
  files["xl/sharedStrings.xml"] = strToU8(sharedXml);
  const sheetOverrides = sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  files["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${sheetOverrides}
</Types>`);
  files["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  const workbookSheets = sheets
    .map((_sheet, index) => `<sheet name="Sheet${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  files["xl/workbook.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${workbookSheets}</sheets>
</workbook>`);
  const workbookRels = [
    ...sheets.map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`,
  ].join("");
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${workbookRels}
</Relationships>`);
  return zipSync(files);
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
