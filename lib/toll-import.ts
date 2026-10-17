import { fileToBuffer } from "./files";
import { decodeCsvBuffer } from "./location-csv";
import type { TollImportResult } from "./tolls";
import { importTollsFromText } from "./tolls-store";

export async function importTollsFromUpload(file: File): Promise<TollImportResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV or Excel file." };
  }
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || mime.includes("spreadsheet");
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "File is too large (max 5 MB)." };
  }
  if (name.endsWith(".xls") && !isXlsx) {
    return { ok: false, error: "Save the workbook as .xlsx or CSV UTF-8." };
  }
  const buffer = await fileToBuffer(file);
  let text = "";
  if (isXlsx) {
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
  const result = importTollsFromText(text, file.name || "tolls.csv");
  return { ok: true, ...result };
}
