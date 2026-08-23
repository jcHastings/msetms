import { createRequire } from "node:module";

type PdfkitConstructor = typeof import("pdfkit");
type PdfkitExports = {
  default?: PdfkitConstructor;
  PDFDocument?: PdfkitConstructor;
};

/**
 * Next/Turbopack's ESM `import "pdfkit"` is the browser build (no Helvetica).
 * Node `require("pdfkit")` is the CJS build, which registers standard fonts.
 */
const nodeRequire = createRequire(import.meta.url);
const pdfkit = nodeRequire("pdfkit") as PdfkitConstructor | PdfkitExports;
const PDFDocument = (
  typeof pdfkit === "function" ? pdfkit : pdfkit.PDFDocument ?? pdfkit.default
) as PdfkitConstructor;

if (typeof PDFDocument !== "function") {
  throw new Error("Could not load the Node pdfkit build for load confirmations.");
}

export default PDFDocument;
