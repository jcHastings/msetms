import { extractText, extractTextItems } from "unpdf";

type TextItem = {
  str?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

/** Rebuild table rows from PDF text items so FleetOne columns keep spaces. */
export function reconstructPdfTextItems(pages: TextItem[][]): string {
  return pages
    .map((items) => {
      const rows = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of items) {
        const str = String(item.str ?? "").replace(/\u00a0/g, " ");
        if (!str.trim()) continue;
        const height = typeof item.height === "number" && item.height > 0 ? item.height : 8;
        const y = typeof item.y === "number" ? item.y : 0;
        const key = Math.round(y / Math.max(2.5, height * 0.55));
        const row = rows.get(key) ?? [];
        row.push({ x: typeof item.x === "number" ? item.x : 0, str });
        rows.set(key, row);
      }
      return [...rows.entries()]
        .sort((left, right) => right[0] - left[0])
        .map(([, cells]) =>
          cells
            .sort((left, right) => left.x - right.x)
            .map((cell) => cell.str.trim())
            .filter(Boolean)
            .join(" "),
        )
        .join("\n");
    })
    .filter((page) => page.trim())
    .join("\n");
}

function flattenExtractedText(value: unknown): string {
  if (Array.isArray(value)) return value.map((part) => flattenExtractedText(part)).join("\n");
  return String(value ?? "");
}

export async function extractFuelPdfText(buffer: Buffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let rebuilt = "";
  try {
    const extracted = await extractTextItems(bytes);
    const pages = (extracted.items ?? []) as TextItem[][];
    if (Array.isArray(pages) && pages.length) {
      rebuilt = reconstructPdfTextItems(pages);
    }
  } catch {
    rebuilt = "";
  }
  if (rebuilt.replace(/\s+/g, "").length >= 40) return rebuilt.trim();
  const fallback = await extractText(bytes, { mergePages: true });
  return flattenExtractedText(fallback.text).trim();
}
