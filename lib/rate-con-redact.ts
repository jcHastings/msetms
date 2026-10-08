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
  /** User-space advance of each UTF-16 unit. Null when the operator list could not be aligned. */
  advances?: number[] | null;
  /**
   * Unicode-keyed advances, only when that table actually sums to the item.
   * Subset fonts fail this check. A standard font can sit a fraction of a point
   * to the right of the operator-list edge; the paint uses the wider of the two.
   */
  altAdvances?: number[] | null;
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

type PaintBox = {
  left: number;
  top: number;
  w: number;
  h: number;
  pad: number;
  kind: "money" | "identity";
  token: string;
};

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
  await attachGlyphAdvances(page, items);
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

const TEXT_OPS = {
  save: 10,
  restore: 11,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setFont: 37,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
};

type GlyphPiece = { unicode?: unknown; width?: unknown; isSpace?: unknown };

type TextDrawState = {
  fontSize: number;
  hScale: number;
  charSpacing: number;
  wordSpacing: number;
  matrix0: number;
};

function fontMatrixScale(page: PdfPage, fontName: string): number {
  if (!page.commonObjs || !fontName) return 0.001;
  for (const [id, data] of page.commonObjs) {
    if (id !== fontName || !data || typeof data !== "object") continue;
    const scale = (data as { fontMatrix?: number[] }).fontMatrix?.[0];
    if (typeof scale === "number" && Number.isFinite(scale) && scale > 0) return scale;
  }
  return 0.001;
}

function glyphRun(glyphs: unknown[], state: TextDrawState): { text: string; advances: number[] } | null {
  let text = "";
  const advances: number[] = [];
  let pending = 0;
  // A TJ number adjusts x before the next glyph, so it belongs to the gap after the previous one.
  const kernOf = (value: number) => (-value * state.fontSize) / 1000 * state.hScale;
  const widthOf = (glyph: GlyphPiece) => {
    const width = typeof glyph.width === "number" ? glyph.width : 0;
    const spacing = (glyph.isSpace ? state.wordSpacing : 0) + state.charSpacing;
    return (width * state.fontSize * state.matrix0 + spacing) * state.hScale;
  };
  for (const entry of glyphs) {
    if (typeof entry === "number") {
      const kern = kernOf(entry);
      if (advances.length) advances[advances.length - 1] += kern;
      else pending += kern;
      continue;
    }
    if (!entry || typeof entry !== "object") return null;
    const glyph = entry as GlyphPiece;
    const unicode = typeof glyph.unicode === "string" ? glyph.unicode : "";
    const advance = widthOf(glyph) + pending;
    pending = 0;
    if (!unicode) {
      pending += advance;
      continue;
    }
    const start = text.length;
    text += unicode;
    const units = text.length - start;
    for (let unit = 0; unit < units; unit += 1) advances.push(unit === 0 ? advance : 0);
  }
  if (pending && advances.length) advances[advances.length - 1] += pending;
  if (advances.length !== text.length) return null;
  return { text, advances };
}

/** Per-glyph advances from showText / showSpacedText. Widths are the font's char codes, not Unicode. */
async function attachGlyphAdvances(page: PdfPage, items: PdfTextItem[]): Promise<void> {
  for (const item of items) {
    item.advances = null;
    item.altAdvances = null;
  }
  let list: PdfOperatorList;
  try {
    list = await page.getOperatorList({ intent: "display" });
  } catch {
    return;
  }
  const runs: Array<{ text: string; advances: number[] }> = [];
  const stack: TextDrawState[] = [];
  let state: TextDrawState = { fontSize: 12, hScale: 1, charSpacing: 0, wordSpacing: 0, matrix0: 0.001 };
  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index];
    if (fn === TEXT_OPS.save) {
      stack.push({ ...state });
      continue;
    }
    if (fn === TEXT_OPS.restore) {
      state = stack.pop() ?? state;
      continue;
    }
    if (!Array.isArray(args)) continue;
    if (fn === TEXT_OPS.setFont) {
      const fontName = typeof args[0] === "string" ? args[0] : "";
      const fontSize = typeof args[1] === "number" ? args[1] : state.fontSize;
      state = { ...state, fontSize, matrix0: fontMatrixScale(page, fontName) };
      continue;
    }
    if (fn === TEXT_OPS.setHScale && typeof args[0] === "number") {
      state = { ...state, hScale: args[0] / 100 };
      continue;
    }
    if (fn === TEXT_OPS.setCharSpacing && typeof args[0] === "number") {
      state = { ...state, charSpacing: args[0] };
      continue;
    }
    if (fn === TEXT_OPS.setWordSpacing && typeof args[0] === "number") {
      state = { ...state, wordSpacing: args[0] };
      continue;
    }
    let glyphs: unknown[] | null = null;
    let draw = state;
    if (fn === TEXT_OPS.showText || fn === TEXT_OPS.showSpacedText || fn === TEXT_OPS.nextLineShowText) {
      glyphs = Array.isArray(args[0]) ? args[0] : null;
    } else if (fn === TEXT_OPS.nextLineSetSpacingShowText) {
      const wordSpacing = typeof args[0] === "number" ? args[0] : state.wordSpacing;
      const charSpacing = typeof args[1] === "number" ? args[1] : state.charSpacing;
      draw = { ...state, wordSpacing, charSpacing };
      state = draw;
      glyphs = Array.isArray(args[2]) ? args[2] : null;
    }
    if (!glyphs) continue;
    const run = glyphRun(glyphs, draw);
    if (run && run.text) runs.push(run);
  }
  let cursor = 0;
  for (const item of items) {
    if (!item.str) continue;
    let matched = false;
    const limit = Math.min(runs.length, cursor + 6);
    for (let index = cursor; index < limit; index += 1) {
      const run = runs[index];
      if (!run || run.text !== item.str || run.advances.length !== item.str.length) continue;
      const total = run.advances.reduce((sum, width) => sum + width, 0);
      if (!(item.width > 0) || Math.abs(total - item.width) / item.width > 0.03) break;
      item.advances = run.advances;
      item.altAdvances = unicodeAdvances(page, item);
      cursor = index + 1;
      matched = true;
      break;
    }
    if (!matched) {
      item.advances = null;
      item.altAdvances = null;
    }
  }
}

/** Unicode widths, when every character has one and the sum matches the item. */
function unicodeAdvances(page: PdfPage, item: PdfTextItem): number[] | null {
  if (!page.commonObjs || !(item.width > 0) || !item.str) return null;
  let widths: { get?: (key: number) => unknown } & Record<number, unknown> | null = null;
  let matrix0 = 0.001;
  for (const [id, data] of page.commonObjs) {
    if (id !== item.fontName || !data || typeof data !== "object" || !("widths" in data)) continue;
    const row = data as { widths?: unknown; fontMatrix?: number[] };
    if (!row.widths || (typeof row.widths !== "object" && !(row.widths instanceof Map))) return null;
    widths = row.widths as { get?: (key: number) => unknown } & Record<number, unknown>;
    const scale = row.fontMatrix?.[0];
    if (typeof scale === "number" && scale > 0) matrix0 = scale;
  }
  if (!widths) return null;
  const fontSize = Math.max(1, Math.hypot(item.transform[2] || 0, item.transform[3] || 0) || item.height || 12);
  const advances: number[] = [];
  for (let index = 0; index < item.str.length; ) {
    const code = item.str.codePointAt(index) ?? 0;
    const units = code > 0xffff ? 2 : 1;
    const raw = widths instanceof Map ? widths.get(code) : widths[code];
    if (typeof raw !== "number" || !(raw > 0)) return null;
    advances.push(raw * fontSize * matrix0);
    if (units === 2) advances.push(0);
    index += units;
  }
  if (advances.length !== item.str.length) return null;
  const total = advances.reduce((sum, width) => sum + width, 0);
  if (Math.abs(total - item.width) / item.width > 0.03) return null;
  return advances;
}

function stepCodeUnit(text: string, index: number, direction: -1 | 1): number {
  if (direction < 0) {
    if (index <= 0) return 0;
    if (index >= 2 && text.charCodeAt(index - 1) >= 0xdc00 && text.charCodeAt(index - 1) <= 0xdfff) return index - 2;
    return index - 1;
  }
  if (index >= text.length) return text.length;
  const code = text.codePointAt(index) ?? 0;
  return index + (code > 0xffff ? 2 : 1);
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

function prefixAdvance(advances: number[], index: number): number {
  let sum = 0;
  const end = Math.max(0, Math.min(advances.length, index));
  for (let cursor = 0; cursor < end; cursor += 1) sum += advances[cursor] ?? 0;
  return sum;
}

function widthFractions(
  item: PlacedItem,
  from: number,
  to: number,
  styles: Record<string, TextStyle>,
): [number, number, number, number] {
  const full = item.str;
  const len = Math.max(1, full.length);
  let localFrom = Math.max(0, Math.min(full.length, from - item.start));
  let localTo = Math.max(localFrom, Math.min(full.length, to - item.start));
  [localFrom, localTo] = coverTouchingDollar(full, localFrom, localTo);
  const advances = item.advances;
  const aligned = advances != null && advances.length === full.length && full.length > 0;
  const advanceTotal = aligned ? prefixAdvance(advances, advances.length) : 0;
  const advanceOk = aligned && item.width > 0 && Math.abs(advanceTotal - item.width) / item.width <= 0.03 && advanceTotal > 0;
  if (!advanceOk) {
    localFrom = stepCodeUnit(full, localFrom, -1);
    localTo = stepCodeUnit(full, localTo, 1);
  }
  const prev = full[localFrom - 1];
  const next = full[localTo];
  const slopLeft = prev != null && /\s/.test(prev) ? 0.4 : 0;
  const slopRight = next != null && /\s/.test(next) ? 0.4 : 0;
  if (advanceOk && advances) {
    let left = prefixAdvance(advances, localFrom) / advanceTotal;
    let right = prefixAdvance(advances, localTo) / advanceTotal;
    const alt = item.altAdvances;
    if (alt && alt.length === full.length) {
      const altTotal = prefixAdvance(alt, alt.length);
      if (altTotal > 0) {
        left = Math.min(left, prefixAdvance(alt, localFrom) / altTotal);
        right = Math.max(right, prefixAdvance(alt, localTo) / altTotal);
      }
    }
    return [Math.max(0, Math.min(1, left)), Math.max(left, Math.min(1, right)), slopLeft, slopRight];
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

type FrameCanvas = {
  width: number;
  height: number;
  getContext: (kind: "2d") => {
    getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  } | null;
};

/** A vertical rule just left of the text. Returns the column, or null. */
function frameColumn(canvas: FrameCanvas, boxLeft: number, boxTop: number, boxH: number): number | null {
  const ctx = canvas.getContext("2d");
  if (!ctx || boxH < 6) return null;
  const y0 = Math.max(0, Math.floor(boxTop - Math.min(boxH, 24)));
  const y1 = Math.min(canvas.height, Math.ceil(boxTop + boxH));
  const h = y1 - y0;
  const above = Math.floor(boxTop) - y0;
  if (h < 8 || above < 4) return null;
  const x0 = Math.max(0, Math.floor(boxLeft - 40));
  const x1 = Math.min(canvas.width, Math.ceil(boxLeft + 6));
  const w = x1 - x0;
  if (w < 2) return null;
  const data = ctx.getImageData(x0, y0, w, h).data;
  let found = -1;
  for (let column = 0; column < w; column += 1) {
    let darkAbove = 0;
    let darkBody = 0;
    let body = 0;
    for (let y = 0; y < h; y += 1) {
      const index = (y * w + column) * 4;
      const dark = data[index] < 90 && data[index + 1] < 90 && data[index + 2] < 90;
      if (y < above) {
        if (dark) darkAbove += 1;
      } else {
        body += 1;
        if (dark) darkBody += 1;
      }
    }
    if (darkAbove >= above * 0.7 && body > 0 && darkBody >= body * 0.55) found = x0 + column;
  }
  return found >= 0 ? found : null;
}

function clipLeftOfFrame(canvas: FrameCanvas, left: number, top: number, width: number, height: number): { left: number; width: number } {
  const frame = frameColumn(canvas, left, top, height);
  if (frame == null) return { left, width };
  const minLeft = frame + 2;
  if (minLeft <= left || minLeft >= left + width - 2) return { left, width };
  return { left: minLeft, width: width - (minLeft - left) };
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
  canvas: FrameCanvas,
  options?: { skipRequirementItems?: boolean; previousBaseline?: number; kind?: "money" | "identity" },
): PaintBox[] {
  const boxes: PaintBox[] = [];
  const kind = options?.kind ?? "money";
  for (const item of items) {
    if (options?.skipRequirementItems && requirementValue(item.str)) continue;
    for (const span of spans) {
      const from = Math.max(span.start, item.start);
      const to = Math.min(span.end, item.end);
      if (to <= from) continue;
      const [f0, f1, slopLeft, slopRight] = widthFractions(item, from, to, styles);
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
      let left = Math.min(p0[0], p1[0]);
      const top = Math.min(p0[1], p1[1]);
      let boxW = Math.abs(p0[0] - p1[0]);
      const boxH = Math.abs(p0[1] - p1[1]) + 1;
      const clipped = clipLeftOfFrame(canvas, left, top, boxW, boxH);
      left = clipped.left;
      boxW = clipped.width;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(left, top, boxW, boxH);
      boxes.push({
        left,
        top,
        w: boxW,
        h: boxH,
        pad: kind === "identity" ? Math.max(8, Math.round(boxH * 0.55)) : 4,
        kind,
        token: span.text || item.str.slice(from - item.start, to - item.start),
      });
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

function wordTouchesEdge(word: OcrWord, box: PaintBox, originX: number, originY: number): "left" | "right" | null {
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

function digitTouchSide(word: OcrWord, box: PaintBox, originX: number, originY: number): "left" | "right" | null {
  if (!/^[^A-Za-z]*\d[^A-Za-z]*$/.test(word.text)) return null;
  return wordTouchesEdge(word, box, originX, originY);
}

function identityTouchSide(word: OcrWord, box: PaintBox, originX: number, originY: number): "left" | "right" | null {
  if (box.kind !== "identity") return null;
  const letters = word.text.replace(/[^A-Za-z]/g, "").toLowerCase();
  const token = box.token.replace(/[^A-Za-z]/g, "").toLowerCase();
  // A one-letter sliver of a neighbour ("a" in "and") is also a letter of "Loads".
  // Fragments that fail a real file are at least two letters ('ads', 'Lo').
  if (letters.length < 2 || !token.includes(letters)) return null;
  return wordTouchesEdge(word, box, originX, originY);
}

async function widenBoxes(
  canvas: Canvas,
  ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void },
  boxes: PaintBox[],
): Promise<boolean> {
  let leak = false;
  for (const box of boxes) {
    if (box.w < 4 || box.h < 4) continue;
    const passes = box.kind === "identity" ? 4 : 1;
    for (let pass = 0; pass < passes; pass += 1) {
      const sides = await boxEdgeSides(canvas, box);
      if (!sides.size) break;
      const grow = Math.max(4, box.pad);
      if (sides.has("left")) {
        const frame = frameColumn(canvas, box.left, box.top, box.h);
        const room = frame == null ? grow : Math.max(0, box.left - (frame + 2));
        const growLeft = Math.min(grow, room);
        box.left -= growLeft;
        box.w += growLeft;
      }
      if (sides.has("right")) box.w += grow;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(box.left, box.top, box.w, box.h);
      if (pass === passes - 1 && (await boxEdgeSides(canvas, box, true)).size) leak = true;
    }
  }
  return leak;
}

async function boxEdgeSides(canvas: Canvas, box: PaintBox, outsideOnly = false): Promise<Set<"left" | "right">> {
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
    const side = digitTouchSide(word, box, x - 8, y - 8) ?? identityTouchSide(word, box, x - 8, y - 8);
    if (!side) continue;
    if (outsideOnly) {
      const cx = x - 8 + (word.x0 + word.x1) / 2;
      const outside = side === "left" ? cx < box.left - 1 : cx > box.left + box.w + 1;
      if (!outside) continue;
    }
    sides.add(side);
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

function llcNearIdentity(words: OcrWord[], boxes: PaintBox[]): boolean {
  for (const word of words) {
    if (!/\bllc\b/i.test(word.text)) continue;
    for (const box of boxes) {
      if (box.kind !== "identity") continue;
      const dx = Math.max(box.left - word.x1, word.x0 - (box.left + box.w), 0);
      const dy = Math.max(box.top - word.y1, word.y0 - (box.top + box.h), 0);
      if (Math.hypot(dx, dy) <= 40) return true;
    }
  }
  return false;
}

async function verifyDriverCopy(
  pdf: Buffer,
  pagePngs: Buffer[],
  forbidden: string[],
  sourceText: string,
  checkIdentity = false,
  identityBoxes: PaintBox[][] = [],
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
      const nearLlc = ocr ? llcNearIdentity(ocr.words, identityBoxes[pagePngs.indexOf(png)] ?? []) : false;
      if (brokerageIdentityVisible(identityText) || nearLlc) problems.push("brokerage identity visible");
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
): Promise<{ pngs: Buffer[]; plans: PagePlan[]; blank: boolean; edgeLeak: boolean; logoUnlocated: boolean; pageSizes: PageSize[]; identityBoxes: PaintBox[][] } | null> {
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
    const identityBoxes: PaintBox[][] = [];
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
      const letterhead = brokerage ? letterheadLineIndexes(plan.lines, natural.height) : new Set<number>();
      const pageIdentity: PaintBox[] = [];
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
            canvas,
            { previousBaseline, kind: "money" },
          ),
        );
        if (carrierOffice) {
          const covered = paintSpans(paint, viewport, line.items, findBareMsLoadsSpans(line.text), plan.styles, canvas, {
            previousBaseline,
            kind: "identity",
          });
          boxes.push(...covered);
          pageIdentity.push(...covered);
        }
        if (!brokerage) continue;
        const covered = paintSpans(
          paint,
          viewport,
          line.items,
          columnBrokerageSpans(line, letterhead.has(index)),
          plan.styles,
          canvas,
          { skipRequirementItems: true, previousBaseline, kind: "identity" },
        );
        boxes.push(...covered);
        pageIdentity.push(...covered);
      }
      identityBoxes.push(pageIdentity);
      if (await widenBoxes(canvas, paint, boxes)) edgeLeak = true;
      pngs.push(canvas.toBuffer("image/png"));
    }
    return { pngs, plans, blank, edgeLeak, logoUnlocated, pageSizes, identityBoxes };
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
    identityBoxes: PaintBox[][];
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
  if (raster.edgeLeak) reasons.push("A redaction box still touches covered text.");
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
    verification = await verifyDriverCopy(
      pdf,
      raster.pngs,
      forbidden,
      sourceText,
      documentIssuedByBrokerage(sourceText),
      raster.identityBoxes,
    );
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
