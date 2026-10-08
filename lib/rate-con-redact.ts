import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import {
  brokerageIdentityVisible,
  documentIsMsExpressCarrier,
  documentIssuedByBrokerage,
  findBareMsLoadsSpans,
  findBrokerageSpans,
  findMoneySpans,
  lineAnchorsBrokerageLetterhead,
  textHasExtractableMoney,
  type MoneySpan,
} from "./rate-con-redact-money";
import { getAttachment, getAttachmentPath } from "./files";
import {
  getRateConRedactionBySource,
  markRateConRedactionProcessing,
  saveRateConRedactionFile,
  type RateConRedaction,
  type RateConRedactionStatus,
} from "./rate-con-redact-store";

const nodeRequire = createRequire(import.meta.url);

export type DriverRateConBuild = {
  status: "ready" | "needs_review";
  reason: string;
  pdf: Buffer | null;
  pagePngs: Buffer[];
  amountsFound: number;
  textChars: number;
  pageCount: number;
  verification: string;
};

type PdfTextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
};

type TextStyle = { fontFamily?: string };

type PlacedItem = PdfTextItem & { start: number; end: number };

type PagePlan = {
  textChars: number;
  annotationChars: number;
  amounts: number;
  lowConfidence: boolean;
  lines: Array<{ text: string; items: PlacedItem[] }>;
  styles: Record<string, TextStyle>;
};

type PaintBox = { left: number; top: number; w: number; h: number; pad: number };

type PageSize = { width: number; height: number };

const RENDER_SCALE = 2;

function pdfjsPaths(): { workerSrc: string; standardFontDataUrl: string } {
  const root = path.dirname(nodeRequire.resolve("pdfjs-dist/package.json"));
  return {
    workerSrc: pathToFileURL(path.join(root, "legacy/build/pdf.worker.mjs")).href,
    standardFontDataUrl: pathToFileURL(path.join(root, "standard_fonts") + path.sep).href,
  };
}

type PdfjsModule = {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDoc>; destroy: () => Promise<void> };
  GlobalWorkerOptions: { workerSrc: string };
  AnnotationMode: { DISABLE: number };
  OPS: {
    save: number;
    restore: number;
    transform: number;
    paintImageXObject: number;
    paintInlineImageXObject: number;
    paintImageXObjectRepeat: number;
  };
  Util: { transform: (m1: number[], m2: number[]) => number[] };
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfViewport = {
  width: number;
  height: number;
  transform: number[];
  convertToViewportPoint: (x: number, y: number) => number[];
};

type PdfOperatorList = { fnArray: number[]; argsArray: unknown[] };

type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<{ items: unknown[]; styles?: Record<string, TextStyle> }>;
  getAnnotations: (params?: { intent?: string }) => Promise<unknown[]>;
  getOperatorList: (params?: { intent?: string; annotationMode?: number }) => Promise<PdfOperatorList>;
  render: (params: Record<string, unknown>) => { promise: Promise<void> };
  commonObjs?: Iterable<[string, unknown]>;
};

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      const pdfjs = mod as unknown as PdfjsModule;
      const paths = pdfjsPaths();
      pdfjs.GlobalWorkerOptions.workerSrc = paths.workerSrc;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function asTextItem(value: unknown): PdfTextItem | null {
  if (!value || typeof value !== "object" || !("str" in value)) return null;
  const item = value as PdfTextItem;
  if (typeof item.str !== "string") return null;
  if (typeof item.fontName !== "string") item.fontName = "";
  return item;
}

export type OfficePageLine = { text: string; fontSize?: number; y?: number };

function titleKind(text: string, fontSize: number, median: number): "" | "invoice" | "customer" | "bol" {
  const line = text.trim();
  if (!line || line.length > 64) return "";
  const words = line.split(/\s+/);
  const large = fontSize >= 14 && (median <= 0 || fontSize >= median * 1.25);
  const short = words.length <= 6 && line.length <= 42;
  if (!large && !short) return "";
  if (/\b(?:your|receipt|email|upon)\b/i.test(line) && !/^invoice\s*(?:#|no\.?|number)\b/i.test(line)) return "";
  if (/^invoice\s*(?:#|no\.?\b|number\b)/i.test(line)) return "invoice";
  if (/^invoice\s*[:.]?\s*$/i.test(line)) return "invoice";
  if (large && /^invoice\b/i.test(line) && words.length <= 4) return "invoice";
  if (/^customer\s+confirmation\s*[:.]?\s*$/i.test(line)) return "customer";
  if (large && /^customer\s+confirmation\b/i.test(line) && words.length <= 6) return "customer";
  if (/^bill\s+of\s+lading\s*[:.]?\s*$/i.test(line)) return "bol";
  if (large && /^bill\s+of\s+lading\b/i.test(line) && words.length <= 6) return "bol";
  return "";
}

/**
 * Hold invoices, customer confirmations, and bills of lading when the title
 * says so. A mention in the terms ("email your invoice", "receipt of invoice")
 * is not a title.
 */
export function officeOnlyPageReason(text: string, lines?: OfficePageLine[], pageHeight = 792): string {
  const rows: OfficePageLine[] = lines?.length ? lines : text.split(/\n/).map((line) => ({ text: line }));
  const heights = rows.map((row) => row.fontSize ?? 0).filter((size) => size > 0);
  const median = heights.length ? [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 0;
  const positioned = rows.some((row) => row.y != null);
  const top = rows.filter((row, index) => {
    if (positioned && row.y != null && pageHeight > 0) return row.y >= pageHeight * 0.62;
    if (positioned && row.y == null) return false;
    return index < 8;
  });
  for (const row of top.length ? top : rows.slice(0, 8)) {
    const kind = titleKind(row.text, row.fontSize ?? 0, median);
    if (kind === "invoice") return "Page 1 is an invoice.";
    if (kind === "customer") return "Page 1 is a customer confirmation.";
    if (kind === "bol") return "Page 1 is a bill of lading.";
  }
  return "";
}

function annotationPlain(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const row = value as { contents?: unknown; fieldValue?: unknown; alternativeText?: unknown };
  return [row.contents, row.fieldValue, row.alternativeText]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim();
}

function groupLines(items: PdfTextItem[]): Array<{ text: string; items: PlacedItem[] }> {
  const real = items.filter((item) => item.str.trim() && item.width > 0);
  const sorted = [...real].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 2) return dy;
    return a.transform[4] - b.transform[4];
  });
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const last = lines[lines.length - 1];
    const anchor = last?.[0]?.transform[5] ?? y;
    if (!last || Math.abs(anchor - y) > 3) lines.push([item]);
    else last.push(item);
  }
  return lines.map((row) => {
    const ordered = [...row].sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    const placed: PlacedItem[] = [];
    for (const item of ordered) {
      if (text) text += " ";
      const start = text.length;
      text += item.str;
      placed.push({ ...item, start, end: text.length });
    }
    return { text, items: placed };
  });
}

async function openPdf(buffer: Buffer): Promise<{ pdfjs: PdfjsModule; doc: PdfDoc; destroy: () => Promise<void> }> {
  const pdfjs = await loadPdfjs();
  const paths = pdfjsPaths();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: paths.standardFontDataUrl,
    useSystemFonts: false,
    disableFontFace: true,
    fontExtraProperties: true,
    verbosity: 0,
    isEvalSupported: false,
  });
  const doc = await task.promise;
  return {
    pdfjs,
    doc,
    destroy: async () => {
      await task.destroy();
    },
  };
}

async function planPage(page: PdfPage): Promise<PagePlan> {
  const textContent = await page.getTextContent();
  const items = textContent.items.map(asTextItem).filter((item): item is PdfTextItem => item != null);
  const lines = groupLines(items);
  const textChars = lines.reduce((sum, line) => sum + line.text.trim().length, 0);
  const annotations = await page.getAnnotations({ intent: "any" });
  const annotationChars = annotations.reduce<number>((sum, row) => sum + annotationPlain(row).length, 0);
  let amounts = 0;
  let zeroWidth = 0;
  let measured = 0;
  for (let index = 0; index < lines.length; index += 1) {
    amounts += findMoneySpans(lines[index].text, lines[index - 1]?.text ?? "").length;
  }
  for (const item of items) {
    if (!item.str.trim()) continue;
    measured += 1;
    if (!(item.width > 0) || !Number.isFinite(item.transform[4]) || !Number.isFinite(item.transform[5])) {
      zeroWidth += 1;
    }
  }
  return {
    textChars,
    annotationChars,
    amounts,
    lowConfidence: measured > 0 && zeroWidth / measured > 0.5,
    lines,
    styles: textContent.styles ?? {},
  };
}

const measureCanvas = createCanvas(8, 8);
const measureCtx = measureCanvas.getContext("2d");

function fontFamily(styles: Record<string, TextStyle>, fontName: string): string {
  const family = styles[fontName]?.fontFamily?.trim() || "sans-serif";
  return family.includes(" ") ? `"${family}"` : family;
}

type GlyphFont = {
  widthOf: (char: string) => number | null;
};

/** pdfjs fills font widths while painting. Keys match each text item's fontName. */
function glyphFonts(page: PdfPage): Map<string, GlyphFont> {
  const fonts = new Map<string, GlyphFont>();
  if (!page.commonObjs) return fonts;
  for (const [id, data] of page.commonObjs) {
    if (!data || typeof data !== "object" || !("widths" in data)) continue;
    const row = data as { widths?: unknown; defaultWidth?: unknown };
    const table = row.widths;
    if (!table || (typeof table !== "object" && !(table instanceof Map))) continue;
    const fallback = typeof row.defaultWidth === "number" && row.defaultWidth > 0 ? row.defaultWidth : 0;
    fonts.set(id, {
      widthOf(char: string) {
        const code = char.codePointAt(0);
        if (code == null) return null;
        const value = table instanceof Map ? table.get(code) : (table as Record<number, number>)[code];
        if (typeof value === "number" && value > 0) return value;
        return fallback > 0 ? fallback : null;
      },
    });
  }
  return fonts;
}

/**
 * Pull a `$` that sits against the amount (optional spaces between) into the
 * covered range. A glued neighbor such as `/Each` stays outside: the edge
 * remains the inter-letter gap, and a space keeps the inter-word gap.
 */
function coverTouchingDollar(full: string, from: number, to: number): [number, number] {
  let start = from;
  let end = to;
  let cursor = start;
  while (cursor > 0 && /\s/.test(full[cursor - 1] ?? "")) cursor -= 1;
  if (cursor > 0 && full[cursor - 1] === "$") start = cursor - 1;
  cursor = end;
  while (cursor < full.length && /\s/.test(full[cursor] ?? "")) cursor += 1;
  if (cursor < full.length && full[cursor] === "$") end = cursor + 1;
  return [start, end];
}

function widthFractions(
  item: PlacedItem,
  from: number,
  to: number,
  styles: Record<string, TextStyle>,
  fonts: Map<string, GlyphFont>,
): [number, number, number, number] {
  const full = item.str;
  const len = Math.max(1, full.length);
  let localFrom = Math.max(0, Math.min(full.length, from - item.start));
  let localTo = Math.max(localFrom, Math.min(full.length, to - item.start));
  [localFrom, localTo] = coverTouchingDollar(full, localFrom, localTo);
  const prev = full[localFrom - 1];
  const next = full[localTo];
  const slopLeft = prev != null && /\s/.test(prev) ? 0.4 : 0;
  const slopRight = next != null && /\s/.test(next) ? 0.4 : 0;
  const font = fonts.get(item.fontName);
  if (font && full.length > 0) {
    const units: number[] = [];
    let measured = true;
    for (const char of full) {
      const width = font.widthOf(char);
      if (width == null || width <= 0) {
        measured = false;
        break;
      }
      units.push(width);
    }
    const total = measured ? units.reduce((sum, width) => sum + width, 0) : 0;
    if (total > 0) {
      let leftUnits = 0;
      let rightUnits = 0;
      let index = 0;
      for (const char of full) {
        if (index === localFrom) leftUnits = rightUnits;
        if (index === localTo) break;
        rightUnits += units[index] ?? 0;
        index += char.length;
      }
      if (index < localTo) rightUnits = total;
      const left = leftUnits / total;
      const right = rightUnits / total;
      return [Math.max(0, Math.min(1, left)), Math.max(left, Math.min(1, right)), slopLeft, slopRight];
    }
  }
  const size = Math.max(8, Math.hypot(item.transform[2] || 0, item.transform[3] || 0) || item.height || 12);
  measureCtx.font = `${size}px ${fontFamily(styles, item.fontName)}`;
  const total = measureCtx.measureText(full).width;
  if (!(total > 0)) return [localFrom / len, localTo / len, slopLeft, slopRight];
  const left = measureCtx.measureText(full.slice(0, localFrom)).width / total;
  const right = measureCtx.measureText(full.slice(0, localTo)).width / total;
  return [Math.max(0, Math.min(1, left)), Math.max(0, Math.min(1, Math.max(left, right))), slopLeft, slopRight];
}

function requirementValue(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 48) return false;
  if (/^(?:reefer|van|flatbed|step\s*deck|straight\s+truck|power\s*only)$/i.test(value)) return true;
  if (/^\d{1,2}\s*['′](?:\s*(?:ft|feet))?$/i.test(value)) return true;
  if (/^(?:equipment|length|temp(?:erature)?|date|time|weight|p\.?\s*o\.?|po|ref(?:erence)?)\b/i.test(value)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) return true;
  if (/^-?\d+(?:\.\d+)?\s*°\s*[FfCc]?$/.test(value)) return true;
  if (/^\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:lbs?|pounds?)$/i.test(value)) return true;
  return false;
}

function paintSpans(
  ctx: {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
  },
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  items: PlacedItem[],
  spans: MoneySpan[],
  styles: Record<string, TextStyle>,
  fonts: Map<string, GlyphFont>,
  options?: { skipRequirementItems?: boolean; previousBaseline?: number },
): PaintBox[] {
  const boxes: PaintBox[] = [];
  for (const item of items) {
    if (options?.skipRequirementItems && requirementValue(item.str)) continue;
    for (const span of spans) {
      const from = Math.max(span.start, item.start);
      const to = Math.min(span.end, item.end);
      if (to <= from) continue;
      const [f0, f1, slopLeft, slopRight] = widthFractions(item, from, to, styles, fonts);
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width;
      const height = Math.max(item.height || 0, Math.abs(item.transform[3] || 0), 8);
      const below = Math.max(1, height * 0.18);
      let topPdf = y + height;
      const previousBaseline = options?.previousBaseline;
      if (previousBaseline != null && previousBaseline > y + 2) {
        topPdf = Math.min(topPdf, (y + height + previousBaseline) / 2);
      }
      const x0 = Math.max(x, Math.min(x + width, x + width * f0 - slopLeft));
      const x1 = Math.max(x0, Math.min(x + width, x + width * f1 + slopRight));
      const p0 = viewport.convertToViewportPoint(x0, y - below);
      const p1 = viewport.convertToViewportPoint(x1, topPdf);
      const left = Math.min(p0[0], p1[0]);
      const top = Math.min(p0[1], p1[1]);
      const boxW = Math.abs(p0[0] - p1[0]);
      const boxH = Math.abs(p0[1] - p1[1]) + 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(left, top, boxW, boxH);
      boxes.push({ left, top, w: boxW, h: boxH, pad: 4 });
    }
  }
  return boxes;
}

function darkRatio(canvas: { width: number; height: number; getContext: (kind: "2d") => { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } | null }): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 1;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 16 * 4) {
    samples += 1;
    if (data[i] < 210 || data[i + 1] < 210 || data[i + 2] < 210) dark += 1;
  }
  return samples ? dark / samples : 0;
}

type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };

type OcrBlock = {
  paragraphs?: Array<{
    lines?: Array<{
      words?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
    }>;
  }>;
};

type OcrEngine = {
  recognize: (
    image: Buffer,
    options?: Record<string, unknown>,
    output?: { text?: boolean; blocks?: boolean },
  ) => Promise<{ data: { text?: string; blocks?: OcrBlock[] | null } }>;
  terminate: () => Promise<unknown>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
};

let ocrUnavailable = false;
let ocrWorker: OcrEngine | null = null;

async function ocrWords(png: Buffer, mode: "3" | "11" = "11"): Promise<{ text: string; words: OcrWord[] } | null> {
  if (ocrUnavailable || png.length < 32) return null;
  try {
    if (!ocrWorker) {
      const { createWorker } = await import("tesseract.js");
      ocrWorker = (await createWorker("eng", 1, {
        cachePath: path.join(os.tmpdir(), "tms-tesseract"),
      })) as unknown as OcrEngine;
    }
    // PSM 11 reads sparse table cells. PSM 3 is the automatic page pass used by the identity guard.
    await ocrWorker.setParameters({ tessedit_pageseg_mode: mode });
    const recognized = await ocrWorker.recognize(png, {}, { text: true, blocks: mode === "11" });
    const words: OcrWord[] = [];
    for (const block of recognized.data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            const text = String(word.text ?? "").trim();
            if (!text || !word.bbox) continue;
            words.push({
              text,
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            });
          }
        }
      }
    }
    return { text: String(recognized.data.text ?? ""), words };
  } catch {
    if (!ocrWorker) ocrUnavailable = true;
    return null;
  }
}

function paintOcrMoney(
  ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void },
  words: OcrWord[],
): number {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: OcrWord[][] = [];
  for (const word of sorted) {
    const last = lines[lines.length - 1];
    const anchor = last?.[0]?.y0 ?? word.y0;
    if (!last || Math.abs(anchor - word.y0) > 10) lines.push([word]);
    else last.push(word);
  }
  const lineTexts = lines.map((lineWords) => lineWords.map((word) => word.text).join(" "));
  const brokerage = documentIssuedByBrokerage(lineTexts.join("\n"));
  const lineTop = lines.map((lineWords) => lineWords[0]?.y0 ?? 0);
  const pageBottom = Math.max(...words.map((word) => word.y1), 1);
  const anchorTops = lineTexts.flatMap((text, index) =>
    lineAnchorsBrokerageLetterhead(text) && lineTop[index] <= pageBottom * 0.34 ? [lineTop[index]] : [],
  );
  let painted = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineWords = lines[index];
    const letterhead =
      lineTop[index] <= pageBottom * 0.34 && anchorTops.some((anchor) => Math.abs(anchor - lineTop[index]) <= 36);
    let text = "";
    const placed: Array<OcrWord & { start: number; end: number }> = [];
    for (const word of lineWords) {
      if (text) text += " ";
      const start = text.length;
      text += word.text;
      placed.push({ ...word, start, end: text.length });
    }
    const spans = [
      ...findMoneySpans(text, lineTexts[index - 1] ?? ""),
      ...(brokerage ? findBrokerageSpans(text, { letterhead }) : []),
    ];
    for (const span of spans) {
      for (const word of placed) {
        if (span.start >= word.end || span.end <= word.start) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(word.x0 - 2, word.y0 - 2, word.x1 - word.x0 + 6, word.y1 - word.y0 + 6);
        painted += 1;
      }
    }
  }
  return painted;
}

function digitTouchSide(word: OcrWord, box: PaintBox, originX: number, originY: number): "left" | "right" | null {
  if (!/^[^A-Za-z]*\d[^A-Za-z]*$/.test(word.text)) return null;
  const x0 = originX + word.x0;
  const x1 = originX + word.x1;
  const cx = (x0 + x1) / 2;
  const cy = originY + (word.y0 + word.y1) / 2;
  const lineSlack = Math.max(3, box.h * 0.3);
  if (cy < box.top - lineSlack || cy > box.top + box.h + lineSlack) return null;
  const edge = 4;
  if (cx < box.left - edge || cx > box.left + box.w + edge) return null;
  const inset = 6;
  if (x0 >= box.left + inset && x1 <= box.left + box.w - inset) return null;
  const distLeft = Math.abs(cx - box.left);
  const distRight = Math.abs(cx - (box.left + box.w));
  return distLeft <= distRight ? "left" : "right";
}

async function widenBoxes(
  canvas: Canvas,
  ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void },
  boxes: PaintBox[],
): Promise<boolean> {
  let leak = false;
  for (const box of boxes) {
    if (box.w < 4 || box.h < 4) continue;
    let sides = await boxEdgeSides(canvas, box);
    if (!sides.size) continue;
    const grow = Math.max(4, box.pad);
    if (sides.has("left")) {
      box.left -= grow;
      box.w += grow;
    }
    if (sides.has("right")) box.w += grow;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.left, box.top, box.w, box.h);
    sides = await boxEdgeSides(canvas, box);
    if (sides.size) leak = true;
  }
  return leak;
}

async function boxEdgeSides(canvas: Canvas, box: PaintBox): Promise<Set<"left" | "right">> {
  const bandX = 12;
  const bandY = 2;
  const x = Math.max(0, Math.floor(box.left - bandX));
  const y = Math.max(0, Math.floor(box.top - bandY));
  const w = Math.max(1, Math.min(canvas.width - x, Math.ceil(box.w + bandX * 2)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.ceil(box.h + bandY * 2)));
  const slice = createCanvas(w + 16, h + 16);
  const sliceCtx = slice.getContext("2d");
  sliceCtx.fillStyle = "#ffffff";
  sliceCtx.fillRect(0, 0, slice.width, slice.height);
  sliceCtx.drawImage(canvas, x, y, w, h, 8, 8, w, h);
  if (darkRatio(slice) < 0.008) return new Set();
  const ocr = await ocrWords(slice.toBuffer("image/png"));
  const sides = new Set<"left" | "right">();
  if (!ocr) return sides;
  for (const word of ocr.words) {
    const side = digitTouchSide(word, box, x - 8, y - 8);
    if (side) sides.add(side);
  }
  return sides;
}

async function imageOnlyPdf(pages: Array<{ png: Buffer; width: number; height: number }>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const source of pages) {
    const image = await doc.embedPng(source.png);
    const width = source.width > 1 ? source.width : image.width;
    const height = source.height > 1 ? source.height : image.height;
    const page = doc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("");
  doc.setCreator("");
  const bytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function structuralProblems(pdf: Buffer): string[] {
  const problems: string[] = [];
  const raw = pdf.toString("latin1");
  if (/\/Annots\s*\[\s*[^\s\]]/.test(raw)) problems.push("annotations left in the driver copy");
  if (/\/AcroForm\b/.test(raw)) problems.push("form fields left in the driver copy");
  if (/\/EmbeddedFiles\b/.test(raw)) problems.push("attachments left in the driver copy");
  if (/\/Metadata\b/.test(raw) || raw.includes("<?xpacket")) problems.push("metadata left in the driver copy");
  return problems;
}

async function extractedText(buffer: Buffer): Promise<string> {
  const opened = await openPdf(buffer);
  try {
    const chunks: string[] = [];
    for (let number = 1; number <= opened.doc.numPages; number += 1) {
      const page = await opened.doc.getPage(number);
      const text = await page.getTextContent();
      for (const item of text.items) {
        const row = asTextItem(item);
        if (row?.str) chunks.push(row.str);
      }
      const annots = await page.getAnnotations({ intent: "any" });
      for (const annot of annots) {
        const plain = annotationPlain(annot);
        if (plain) chunks.push(plain);
      }
    }
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  } finally {
    await opened.destroy();
  }
}

function sourceHasDollarAmount(sourceText: string, digits: string): boolean {
  const normalized = sourceText.replace(/(\d),(?=\d)/g, "$1");
  const escaped = digits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\$\\s*${escaped}\\b`).test(normalized);
}

export function ocrDollarLeak(ocrText: string, sourceText: string): string | null {
  for (const hit of ocrText.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)/g)) {
    const digits = hit[1].replace(/,/g, "");
    if (!sourceText.trim() || sourceHasDollarAmount(sourceText, digits)) return hit[0];
  }
  if (/\b\d{1,3}(?:,\d{3})+\.\d{2}\b/.test(ocrText) && sourceText.trim()) {
    for (const hit of ocrText.matchAll(/\b(\d{1,3}(?:,\d{3})+\.\d{2})\b/g)) {
      const compact = hit[1].replace(/,/g, "");
      if (sourceHasDollarAmount(sourceText, compact) || sourceText.includes(hit[1])) return hit[1];
    }
  }
  // Same amounts without the "$" (unit-price columns, OCR dropping the sign).
  // "100 percent" / "100%" is not the digits of a "$100" amount.
  const rawTokens = ocrText.split(/\s+/).filter(Boolean);
  const ocrTokens = new Set<string>();
  for (let index = 0; index < rawTokens.length; index += 1) {
    const raw = rawTokens[index] ?? "";
    const next = rawTokens[index + 1] ?? "";
    if (/%|percent/i.test(raw)) continue;
    if (/^%/.test(next) || /^percent\b/i.test(next)) continue;
    const cleaned = raw.replace(/[^\d.]/g, "");
    if (cleaned) ocrTokens.add(cleaned);
  }
  for (const hit of sourceText.matchAll(/\$\s*(\d[\d,]*(?:\.\d{2})?)/g)) {
    const compact = hit[1].replace(/,/g, "");
    const whole = compact.split(".")[0];
    if (compact.replace(/\D/g, "").replace(/^0+/, "").length < 3) continue;
    if (ocrTokens.has(compact) || (whole.length >= 3 && (ocrTokens.has(whole) || ocrTokens.has(`${whole}.00`)))) return compact;
  }
  return null;
}

async function verifyDriverCopy(
  pdf: Buffer,
  pagePngs: Buffer[],
  forbidden: string[],
  sourceText: string,
  checkIdentity = false,
): Promise<string> {
  const problems: string[] = [];
  let text = "";
  try {
    text = await extractedText(pdf);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "could not read the driver copy");
  }
  if (text) problems.push("driver copy still has a text layer");
  if (textHasExtractableMoney(text)) problems.push("driver copy text still has a dollar amount");
  problems.push(...structuralProblems(pdf));
  const latin = pdf.toString("latin1");
  for (const secret of forbidden) {
    if (secret.length >= 5 && latin.includes(secret)) problems.push(`plaintext amount left in the file (${secret})`);
  }
  for (const png of pagePngs) {
    const ocr = await ocrWords(png, "11");
    const leak = ocr ? ocrDollarLeak(ocr.text, sourceText) : null;
    if (leak) problems.push(`OCR still sees a dollar amount (${leak})`);
    if (checkIdentity) {
      const psm3 = await ocrWords(png, "3");
      const identityText = `${ocr?.text ?? ""}\n${psm3?.text ?? ""}`;
      if (brokerageIdentityVisible(identityText)) problems.push("brokerage identity visible");
    }
  }
  if (!problems.length) return "ok";
  return `failed: ${problems.join("; ")}`;
}

function failed(reason: string): DriverRateConBuild {
  return {
    status: "needs_review",
    reason,
    pdf: null,
    pagePngs: [],
    amountsFound: 0,
    textChars: 0,
    pageCount: 0,
    verification: "failed: no driver copy",
  };
}

function lineBaseline(line: { items: PlacedItem[] }): number {
  return line.items[0]?.transform[5] ?? 0;
}

const COLUMN_GAP = 56;

function columnBrokerageSpans(
  line: { text: string; items: PlacedItem[] },
  letterhead: boolean,
): MoneySpan[] {
  if (!line.items.length) return findBrokerageSpans(line.text, { letterhead });
  const columns: PlacedItem[][] = [];
  for (const item of line.items) {
    const current = columns[columns.length - 1];
    const prev = current?.[current.length - 1];
    const gap = prev ? item.transform[4] - (prev.transform[4] + Math.max(prev.width, 0)) : 0;
    if (!current || (prev && gap > COLUMN_GAP)) columns.push([item]);
    else current.push(item);
  }
  const spans: MoneySpan[] = [];
  for (const column of columns) {
    const start = column[0]?.start ?? 0;
    const end = column[column.length - 1]?.end ?? start;
    const text = line.text.slice(start, end);
    for (const span of findBrokerageSpans(text, { letterhead })) {
      spans.push({ ...span, start: start + span.start, end: start + span.end });
    }
  }
  return spans;
}

function lineFontSize(line: { items: PlacedItem[] }): number {
  const sizes = line.items
    .map((item) => Math.abs(item.transform[3] || item.height || 0))
    .filter((size) => size > 0);
  return sizes.length ? Math.max(...sizes) : 11;
}

function medianNumber(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function letterheadLineIndexes(lines: PagePlan["lines"], pageHeight: number): Set<number> {
  const rows = lines.map((line, index) => {
    const xs = line.items.map((item) => item.transform[4]).filter((value) => Number.isFinite(value));
    return {
      index,
      y: lineBaseline(line),
      x: xs.length ? Math.min(...xs) : 0,
      size: lineFontSize(line),
      text: line.text,
    };
  });
  const anchors = rows.filter((row) => lineAnchorsBrokerageLetterhead(row.text) && row.y >= pageHeight * 0.4);
  const indexes = new Set<number>();
  if (!anchors.length) return indexes;
  const first = anchors.reduce((best, row) => (row.y > best.y ? row : best));
  const column = rows
    .filter((row) => Math.abs(row.x - first.x) <= 80 && row.y <= first.y + 1)
    .sort((a, b) => b.y - a.y);
  const gaps: number[] = [];
  let previous: (typeof column)[number] | null = null;
  for (const row of column) {
    if (row.y > first.y + 0.5) continue;
    if (/carrier\s+information|^\s*carrier\b/i.test(row.text)) break;
    if (previous) {
      const gap = previous.y - row.y;
      const font = Math.max(previous.size, row.size, 8);
      const typical = gaps.length ? medianNumber(gaps) : font * 1.15;
      if (gap > Math.max(typical, font) * 1.5 + 0.75) break;
      gaps.push(gap);
    }
    indexes.add(row.index);
    previous = row;
  }
  return indexes;
}

type PdfRect = { x: number; y: number; width: number; height: number };

function unitSquareBox(ctm: number[]): PdfRect | null {
  if (ctm.length < 6 || ctm.some((value) => !Number.isFinite(value))) return null;
  const [a, b, c, d, e, f] = ctm;
  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function paintPdfRect(
  ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void },
  viewport: PdfViewport,
  box: PdfRect,
): void {
  const p0 = viewport.convertToViewportPoint(box.x, box.y);
  const p1 = viewport.convertToViewportPoint(box.x + box.width, box.y + box.height);
  const left = Math.min(p0[0], p1[0]) - 1;
  const top = Math.min(p0[1], p1[1]) - 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left, top, Math.abs(p1[0] - p0[0]) + 2, Math.abs(p1[1] - p0[1]) + 2);
}

/** Cover letterhead rasters. Returns true when an image was seen but not located. */
async function coverHeaderLogos(
  page: PdfPage,
  pdfjs: PdfjsModule,
  ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void },
  viewport: PdfViewport,
  pageWidth: number,
  pageHeight: number,
): Promise<boolean> {
  let unlocated = false;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const list = await page.getOperatorList({
    intent: "display",
    annotationMode: pdfjs.AnnotationMode.DISABLE,
  });
  const ops = pdfjs.OPS;
  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index];
    if (fn === ops.save) {
      stack.push(ctm.slice());
      continue;
    }
    if (fn === ops.restore) {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === ops.transform && args && typeof args === "object" && "length" in args) {
      const list = args as ArrayLike<unknown>;
      if (list.length >= 6) {
        const matrix = [0, 1, 2, 3, 4, 5].map((slot) => Number(list[slot]));
        if (matrix.every((value) => Number.isFinite(value))) ctm = pdfjs.Util.transform(ctm, matrix);
      }
      continue;
    }
    if (fn === ops.paintImageXObjectRepeat) {
      unlocated = true;
      continue;
    }
    if (fn !== ops.paintImageXObject && fn !== ops.paintInlineImageXObject) continue;
    const box = unitSquareBox(ctm);
    if (!box) {
      unlocated = true;
      continue;
    }
    if (box.width < 8 || box.height < 8) continue;
    if (box.width > pageWidth * 0.85 && box.height > pageHeight * 0.45) continue;
    const centerY = box.y + box.height / 2;
    if (centerY < pageHeight * 0.72) continue;
    paintPdfRect(ctx, viewport, box);
  }
  return unlocated;
}

async function rasterPages(
  buffer: Buffer,
): Promise<{ pngs: Buffer[]; plans: PagePlan[]; blank: boolean; edgeLeak: boolean; logoUnlocated: boolean; pageSizes: PageSize[] } | null> {
  const opened = await openPdf(buffer);
  try {
    const prepared: Array<{ page: PdfPage; plan: PagePlan }> = [];
    for (let number = 1; number <= opened.doc.numPages; number += 1) {
      const page = await opened.doc.getPage(number);
      prepared.push({ page, plan: await planPage(page) });
    }
    const pageText = prepared.flatMap((entry) => entry.plan.lines.map((line) => line.text)).join("\n");
    const brokerage = documentIssuedByBrokerage(pageText);
    const carrierOffice = documentIsMsExpressCarrier(pageText);
    const pngs: Buffer[] = [];
    const plans: PagePlan[] = [];
    const pageSizes: PageSize[] = [];
    let blank = false;
    let edgeLeak = false;
    let logoUnlocated = false;
    for (const entry of prepared) {
      const plan = entry.plan;
      plans.push(plan);
      const natural = entry.page.getViewport({ scale: 1 });
      pageSizes.push({ width: natural.width, height: natural.height });
      const viewport = entry.page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await entry.page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
        annotationMode: opened.pdfjs.AnnotationMode.DISABLE,
      }).promise;
      if (plan.textChars >= 80 && darkRatio(canvas) < 0.0015) blank = true;
      const paint = ctx as { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void };
      const fonts = glyphFonts(entry.page);
      const letterhead = brokerage ? letterheadLineIndexes(plan.lines, natural.height) : new Set<number>();
      if (brokerage && pngs.length === 0) {
        if (await coverHeaderLogos(entry.page, opened.pdfjs, paint, viewport, natural.width, natural.height)) {
          logoUnlocated = true;
        }
      }
      const boxes: PaintBox[] = [];
      for (let index = 0; index < plan.lines.length; index += 1) {
        const line = plan.lines[index];
        const previousBaseline = index > 0 ? lineBaseline(plan.lines[index - 1] ?? { items: [] }) : undefined;
        boxes.push(
          ...paintSpans(
            paint,
            viewport,
            line.items,
            findMoneySpans(line.text, plan.lines[index - 1]?.text ?? ""),
            plan.styles,
            fonts,
            { previousBaseline },
          ),
        );
        if (carrierOffice) {
          boxes.push(
            ...paintSpans(paint, viewport, line.items, findBareMsLoadsSpans(line.text), plan.styles, fonts, {
              previousBaseline,
            }),
          );
        }
        if (!brokerage) continue;
        boxes.push(
          ...paintSpans(
            paint,
            viewport,
            line.items,
            columnBrokerageSpans(line, letterhead.has(index)),
            plan.styles,
            fonts,
            { skipRequirementItems: true, previousBaseline },
          ),
        );
      }
      if (await widenBoxes(canvas, paint, boxes)) edgeLeak = true;
      pngs.push(canvas.toBuffer("image/png"));
    }
    return { pngs, plans, blank, edgeLeak, logoUnlocated, pageSizes };
  } finally {
    await opened.destroy();
  }
}

async function paintOcrOnPng(png: Buffer): Promise<{ png: Buffer; amounts: number }> {
  const { loadImage } = await import("@napi-rs/canvas");
  const decoded = await loadImage(png);
  const page = createCanvas(decoded.width, decoded.height);
  const ctx = page.getContext("2d");
  ctx.drawImage(decoded, 0, 0);
  const ocr = await ocrWords(png);
  const amounts = ocr
    ? paintOcrMoney(ctx as { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void }, ocr.words)
    : 0;
  return { png: page.toBuffer("image/png"), amounts };
}

async function fromImage(buffer: Buffer): Promise<DriverRateConBuild> {
  const painted = await paintOcrOnPng(buffer);
  const { loadImage } = await import("@napi-rs/canvas");
  const decoded = await loadImage(painted.png);
  const pdf = await imageOnlyPdf([{ png: painted.png, width: decoded.width, height: decoded.height }]);
  const verification = await verifyDriverCopy(pdf, [painted.png], [], "");
  return {
    status: "needs_review",
    reason: "Scanned or image-only file. Office review before the driver can see it.",
    pdf,
    pagePngs: [painted.png],
    amountsFound: painted.amounts,
    textChars: 0,
    pageCount: 1,
    verification,
  };
}

export async function buildDriverRateCon(buffer: Buffer, mime = "application/pdf"): Promise<DriverRateConBuild> {
  const isImage = mime.startsWith("image/") && !mime.includes("pdf");
  if (isImage) {
    try {
      return await fromImage(buffer);
    } catch (error) {
      return failed(error instanceof Error ? error.message : "Could not read that image.");
    }
  }
  if (!buffer.subarray(0, 5).toString("latin1").includes("%PDF")) {
    return failed("This file is not a PDF. Office review.");
  }
  let raster: {
    pngs: Buffer[];
    plans: PagePlan[];
    blank: boolean;
    edgeLeak: boolean;
    logoUnlocated: boolean;
    pageSizes: PageSize[];
  } | null = null;
  try {
    raster = await rasterPages(buffer);
  } catch (error) {
    return failed(error instanceof Error ? `Could not read the PDF. ${error.message}` : "Could not read the PDF.");
  }
  if (!raster) return failed("Could not read the PDF.");
  const textChars = raster.plans.reduce((sum, plan) => sum + plan.textChars, 0);
  const annotationChars = raster.plans.reduce((sum, plan) => sum + plan.annotationChars, 0);
  let amounts = raster.plans.reduce((sum, plan) => sum + plan.amounts, 0);
  const reasons: string[] = [];
  const scanned = textChars < 40;
  const emptyPage = raster.plans.some((plan) => plan.textChars < 15);
  const annotationOnly = textChars < 40 && annotationChars > 0;
  if (scanned) {
    for (let index = 0; index < raster.pngs.length; index += 1) {
      const painted = await paintOcrOnPng(raster.pngs[index]);
      amounts += painted.amounts;
      raster.pngs[index] = painted.png;
    }
    reasons.push("Scanned or image-only PDF. No usable text layer.");
  }
  if (!scanned && emptyPage) reasons.push("A page has no text.");
  if (annotationOnly) reasons.push("Text was only in an annotation or form field.");
  if (raster.plans.some((plan) => plan.lowConfidence) || raster.blank) reasons.push("Low extraction confidence.");
  if (!scanned && amounts < 1) reasons.push("No dollar amount found.");
  const pageOneLines = raster.plans[0]?.lines ?? [];
  const pageOneHeight = raster.pageSizes[0]?.height ?? 792;
  const officeOnly = officeOnlyPageReason(
    pageOneLines.map((line) => line.text).join("\n"),
    pageOneLines.map((line) => ({
      text: line.text,
      fontSize: Math.max(0, ...line.items.map((item) => Math.abs(item.transform[3] || item.height || 0))),
      y: lineBaseline(line),
    })),
    pageOneHeight,
  );
  if (officeOnly) reasons.push(officeOnly);
  if (raster.edgeLeak) reasons.push("A redaction box still touches a digit.");
  if (raster.logoUnlocated) reasons.push("Brokerage logo could not be located.");
  const sourceText = raster.plans.flatMap((plan) => plan.lines.map((line) => line.text)).join("\n");
  const forbidden = raster.plans.flatMap((plan) =>
    plan.lines.flatMap((line, index) => findMoneySpans(line.text, plan.lines[index - 1]?.text ?? "").map((span) => span.text)),
  );
  let pdf: Buffer;
  try {
    pdf = await imageOnlyPdf(raster.pngs.map((png, index) => ({ png, ...raster.pageSizes[index] })));
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Could not write the driver copy.");
  }
  let verification = "failed: not checked";
  try {
    verification = await verifyDriverCopy(pdf, raster.pngs, forbidden, sourceText, documentIssuedByBrokerage(sourceText));
  } catch (error) {
    verification = `failed: ${error instanceof Error ? error.message : "verification threw"}`;
  }
  if (/brokerage identity visible/i.test(verification)) reasons.push("brokerage identity visible");
  if (!verification.startsWith("ok")) reasons.push("Verification did not pass.");
  const hold = reasons.length > 0;
  return {
    status: hold ? "needs_review" : "ready",
    reason: hold ? reasons.join(" ") : "Ready for the driver.",
    pdf,
    pagePngs: raster.pngs,
    amountsFound: amounts,
    textChars,
    pageCount: raster.pngs.length,
    verification,
  };
}

export async function shutdownDriverRateConOcr(): Promise<void> {
  const worker = ocrWorker;
  ocrWorker = null;
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    // The next redaction starts a new worker.
  }
}

export async function redactStoredRateCon(
  attachmentId: number,
  options?: { holdForOffice?: boolean },
): Promise<RateConRedaction | null> {
  const attachment = getAttachment(attachmentId);
  if (!attachment || attachment.kind !== "rate_con") return null;
  const previous = getRateConRedactionBySource(attachmentId);
  markRateConRedactionProcessing({ loadId: attachment.load_id, sourceAttachmentId: attachment.id });
  let build: DriverRateConBuild;
  try {
    const stored = getAttachmentPath(attachment);
    if (!fs.existsSync(/*turbopackIgnore: true*/ stored)) {
      build = failed("The original file is missing.");
    } else {
      const buffer = fs.readFileSync(/*turbopackIgnore: true*/ stored);
      build = await buildDriverRateCon(buffer, attachment.mime_type || "");
    }
  } catch (error) {
    build = failed(error instanceof Error ? error.message : "Redaction failed.");
  }
  let status: RateConRedactionStatus = build.status;
  let reason = build.reason;
  if (options?.holdForOffice && status === "ready") {
    status = "needs_review";
    reason = `Backfill held for office review. ${reason}`.trim();
  }
  return saveRateConRedactionFile({
    loadId: attachment.load_id,
    sourceAttachmentId: attachment.id,
    status,
    reason,
    verification: build.verification,
    pdf: build.pdf,
    pagePngs: build.pagePngs,
    amountsFound: build.amountsFound,
    textChars: build.textChars,
    previous,
  });
}
