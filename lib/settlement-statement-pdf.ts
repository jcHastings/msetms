import { formatMdYDisplay } from "./format";
import PDFDocument from "./pdfkit-document";
import { formatStatementMoney, type SettlementStatement } from "./settlement-statement";

const NAVY = "#12315c";
const INK = "#122033";
const MUTED = "#5c6b7c";

function moneyOrBlank(value: number | null): string {
  return value == null ? "—" : formatStatementMoney(value);
}

function percentLabel(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export async function renderSettlementPdf(statement: SettlementStatement): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawSettlement(doc, statement);
    doc.end();
  });
}

function drawSettlement(doc: PDFKit.PDFDocument, statement: SettlementStatement): void {
  const left = 40;
  const width = 532;
  let y = 40;

  const addPage = () => {
    doc.addPage();
    y = 40;
  };
  const ensure = (needed: number) => {
    if (y + needed > 740) addPage();
  };

  doc.font("Helvetica-Bold").fontSize(16).fillColor(NAVY);
  doc.text(statement.carrierName || "Carrier", left, y, { width: 320, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
  doc.text("SETTLEMENT STATEMENT", left, y, { width, align: "right", lineBreak: false });
  y += 22;
  doc.font("Helvetica").fontSize(9).fillColor(INK);
  for (const line of statement.carrierAddress.split("·").map((part) => part.trim()).filter(Boolean)) {
    doc.text(line, left, y, { width: 320, lineBreak: false });
    y += 12;
  }
  doc.text(statement.usdot ? `USDOT ${statement.usdot}` : "USDOT Not on file", left, y, { width: 320, lineBreak: false });
  y += 12;
  doc.text(statement.mcNumber ? `MC ${statement.mcNumber}` : "MC Not on file", left, y, { width: 320, lineBreak: false });
  y += 16;

  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  const meta = [
    ["Statement", statement.statementNumber],
    ["Week", `${formatMdYDisplay(statement.weekStart)} – ${formatMdYDisplay(statement.weekEnd)}`],
    ["Paid record", statement.paidAt ? formatMdYDisplay(statement.paidAt) : "Not marked paid"],
  ];
  let metaY = 40;
  for (const [label, value] of meta) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, 360, metaY, { width: 70, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(value, 430, metaY, { width: 142, align: "right", lineBreak: false });
    metaY += 14;
  }
  y = Math.max(y, metaY) + 8;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#d6dee8").stroke();
  y += 12;
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(statement.driverName, left, y, { width, lineBreak: false });
  y += 18;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  doc.text(statement.driverKindLabel, left, y, { width, lineBreak: false });
  y += 14;
  if (statement.ownerOperatorCompany) {
    doc.text(statement.ownerOperatorCompany, left, y, { width, lineBreak: false });
    y += 14;
  }
  y += 8;

  const showPercent = statement.driverKind === "owner_operator";
  y = sectionTitle(doc, left, y, "Loads");
  const loadHeader = showPercent
    ? ["Load", "Pickup → delivery", "Dates", "Miles", "Linehaul", "OO %"]
    : ["Load", "Pickup → delivery", "Dates", "Miles", "Linehaul"];
  const loadWidths = showPercent ? [70, 160, 100, 50, 80, 72] : [70, 190, 110, 60, 102];
  y = tableHeader(doc, left, y, loadHeader, loadWidths);
  if (!statement.loads.length) {
    y = emptyLine(doc, left, y, "No loads in this week.");
  }
  for (const line of statement.loads) {
    ensure(28);
    const dates = [formatMdYDisplay(line.pickup), formatMdYDisplay(line.delivery)].filter((part) => part !== "—").join(" – ");
    const cells = [
      line.loadNumber,
      line.lane,
      dates || "—",
      line.miles != null ? String(Math.round(line.miles * 10) / 10) : "—",
      moneyOrBlank(line.linehaul),
    ];
    if (showPercent) cells.push(percentLabel(line.ooPercent));
    y = tableRow(doc, left, y, cells, loadWidths);
  }

  y += 8;
  ensure(40);
  y = sectionTitle(doc, left, y, "Extra pay");
  y = tableHeader(doc, left, y, ["Load", "Item", "Amount"], [80, 352, 100]);
  if (!statement.extras.length) y = emptyLine(doc, left, y, "No extra pay stored for this week.");
  for (const line of statement.extras) {
    ensure(22);
    y = tableRow(doc, left, y, [line.loadNumber, line.label, formatStatementMoney(line.amount)], [80, 352, 100]);
  }

  y += 8;
  ensure(40);
  y = sectionTitle(doc, left, y, "Reimbursements");
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text("Added to net. Not a deduction.", left, y, { width, lineBreak: false });
  y += 12;
  y = tableHeader(doc, left, y, ["Category", "Load", "Status", "Amount"], [140, 180, 112, 100]);
  if (!statement.reimbursements.length) y = emptyLine(doc, left, y, "No approved reimbursements this week.");
  for (const line of statement.reimbursements) {
    ensure(22);
    y = tableRow(
      doc,
      left,
      y,
      [line.categoryLabel, line.loadNumber || "—", line.status === "paid" ? "Paid" : "Approved", formatStatementMoney(line.amount)],
      [140, 180, 112, 100],
    );
  }

  y += 8;
  ensure(40);
  y = sectionTitle(doc, left, y, "Deductions");
  y = tableHeader(doc, left, y, ["Item", "How it applies", "Amount"], [180, 252, 100]);
  if (!statement.deductions.length) y = emptyLine(doc, left, y, "No deductions on this statement.");
  for (const line of statement.deductions) {
    ensure(22);
    y = tableRow(doc, left, y, [line.name, line.detail, formatStatementMoney(line.amount)], [180, 252, 100]);
  }

  y += 14;
  ensure(78);
  const totals: Array<[string, string, boolean]> = [
    ["Gross", formatStatementMoney(statement.gross), false],
    ["Reimbursements", formatStatementMoney(statement.reimbursementTotal), false],
    ["Total deductions", formatStatementMoney(statement.deductionTotal), false],
    ["Net", formatStatementMoney(statement.net), true],
  ];
  for (const [label, value, strong] of totals) {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 12 : 10).fillColor(INK);
    doc.text(label, 320, y, { width: 140, lineBreak: false });
    doc.text(value, 460, y, { width: 112, align: "right", lineBreak: false });
    y += strong ? 18 : 16;
  }
  y += 12;
  ensure(36);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text(
    "Tax is not calculated on this statement. This page does not move money or send a copy to the driver.",
    left,
    y,
    { width },
  );
}

function sectionTitle(doc: PDFKit.PDFDocument, x: number, y: number, title: string): number {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text(title, x, y, { lineBreak: false });
  return y + 16;
}

function tableHeader(doc: PDFKit.PDFDocument, x: number, y: number, labels: string[], widths: number[]): number {
  let cursor = x;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  labels.forEach((label, index) => {
    doc.text(label, cursor, y, { width: widths[index] - 6, lineBreak: false });
    cursor += widths[index];
  });
  const next = y + 12;
  doc.moveTo(x, next).lineTo(x + widths.reduce((sum, width) => sum + width, 0), next).strokeColor("#d6dee8").stroke();
  return next + 4;
}

function tableRow(doc: PDFKit.PDFDocument, x: number, y: number, cells: string[], widths: number[]): number {
  let cursor = x;
  doc.font("Helvetica").fontSize(8).fillColor("#122033");
  cells.forEach((cell, index) => {
    doc.text(cell, cursor, y, { width: widths[index] - 6, lineBreak: false, ellipsis: true });
    cursor += widths[index];
  });
  return y + 14;
}

function emptyLine(doc: PDFKit.PDFDocument, x: number, y: number, text: string): number {
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(text, x, y, { lineBreak: false });
  return y + 16;
}
