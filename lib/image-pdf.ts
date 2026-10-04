import { PDFDocument } from "pdf-lib";

export type PdfImagePage = {
  bytes: Uint8Array;
  format: "jpeg" | "png";
};

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 28;

/** Embed one or more JPEG/PNG pages into a single PDF. Pure JS (pdf-lib). */
export async function imagesToPdf(pages: PdfImagePage[]): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("Add at least one photo.");
  }
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const image =
      page.format === "png" ? await pdf.embedPng(page.bytes) : await pdf.embedJpg(page.bytes);
    const pdfPage = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    const maxW = LETTER_WIDTH - MARGIN * 2;
    const maxH = LETTER_HEIGHT - MARGIN * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    pdfPage.drawImage(image, {
      x: (LETTER_WIDTH - width) / 2,
      y: (LETTER_HEIGHT - height) / 2,
      width,
      height,
    });
  }
  return pdf.save();
}

export function pdfFileName(kind: string, loadNumber?: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeKind = kind.replace(/[^a-z0-9_-]+/gi, "-") || "doc";
  const safeLoad = (loadNumber || "load").replace(/[^a-z0-9_-]+/gi, "-");
  return `${safeKind}-${safeLoad}-${stamp}.pdf`;
}
