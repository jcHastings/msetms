import PDFDocument from "pdfkit";
import * as pdfkit from "pdfkit";
import Helvetica from "pdfkit/standard-fonts/Helvetica";
import HelveticaBold from "pdfkit/standard-fonts/HelveticaBold";

type StandardFont = { name: string };

/**
 * Next/Turbopack resolves `pdfkit` to the browser ESM build, which does not
 * auto-register Helvetica. Node's CJS build does. Register the two faces this
 * app uses whenever the browser export is what actually loaded.
 */
const registerStdFonts = (pdfkit as { registerStdFonts?: (...fonts: StandardFont[]) => void })
  .registerStdFonts;

if (typeof registerStdFonts === "function") {
  registerStdFonts(Helvetica, HelveticaBold);
}

export default PDFDocument;
