import type { FuelImportResult } from "./fuel";
import { fileToBuffer } from "./files";
import { importFuelFromText } from "./fuel-store";
import { decodeCsvBuffer } from "./location-csv";

export async function importFuelFromUpload(file: File): Promise<FuelImportResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV, Excel, or PDF." };
  }
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const { isFuelPdfUpload, readFuelUploadText } = await import("./fuel-pdf");
  const nameHintPdf = isFuelPdfUpload(file.name, mime);
  const isXlsx = name.endsWith(".xlsx") || mime.includes("spreadsheet");
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "PDF is too large (max 15 MB)." };
  }
  if (!nameHintPdf && file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "File is too large (max 5 MB)." };
  }
  if (name.endsWith(".xls") && !isXlsx) {
    return { ok: false, error: "Save the workbook as .xlsx or CSV UTF-8." };
  }
  const buffer = await fileToBuffer(file);
  const isPdf = isFuelPdfUpload(file.name, mime, buffer);
  if (isPdf && buffer.length > 15 * 1024 * 1024) {
    return { ok: false, error: "PDF is too large (max 15 MB)." };
  }
  let text = "";
  if (isPdf) {
    const extracted = await readFuelUploadText(buffer, file.name, mime);
    text = extracted.text;
    if (!text.trim()) {
      return { ok: false, error: "Couldn't read text from this PDF. Save the report as CSV and upload that." };
    }
  } else if (isXlsx) {
    const { recordsFromFirstSheet } = await import("./xlsx-first-sheet");
    const records = recordsFromFirstSheet(new Uint8Array(buffer));
    if (!records.length) return { ok: false, error: "Excel sheet is empty." };
    const headers = Object.keys(records[0] ?? {});
    text = [
      headers.join(","),
      ...records.map((row) =>
        headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(","),
      ),
    ].join("\n");
  } else {
    text = decodeCsvBuffer(buffer);
  }
  const result = importFuelFromText(text, file.name || "fuel.csv");
  return { ok: true, ...result };
}
