import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { addAttachment } from "./files";
import { formatMoney } from "./format";
import { labelForPayCategory } from "./load-page-shared";
import { customerInvoicePayItems } from "./pay-items";
import { getLoad, markTmsInvoice } from "./queries";
import { getCompanySettings, getDocumentDefaults } from "./settings";
import type { LoadView } from "./types";

export type TmsInvoiceLine = {
  name: string;
  description: string;
  amount: number;
};

export type TmsInvoiceModel = {
  invoiceNumber: string;
  loadNumber: string;
  customerName: string;
  date: string;
  poNumber: string;
  customerReference: string;
  lane: string;
  lines: TmsInvoiceLine[];
  total: number;
  companyName: string;
};

export function tmsCustomerInvoiceLines(load: LoadView): TmsInvoiceLine[] {
  const payItems = customerInvoicePayItems(load.id).filter((item) => item.category !== "lumper");
  const lane = `${load.origin} → ${load.destination}`;
  if (payItems.length) {
    return payItems.map((item) => ({
      name: labelForPayCategory(item.category),
      description: `${load.load_number} ${lane}`,
      amount: item.total ?? 0,
    }));
  }
  if (load.rate != null && load.rate > 0) {
    return [{ name: "Line Haul", description: `${load.load_number} ${lane}`, amount: load.rate }];
  }
  return [];
}

export function buildTmsInvoice(load: LoadView): TmsInvoiceModel {
  if (load.status !== "delivered" && load.status !== "completed") {
    throw new Error("Mark the load Delivered before invoicing.");
  }
  const lines = tmsCustomerInvoiceLines(load);
  if (!lines.length) {
    throw new Error("Add Income / Budget line items or a customer rate first.");
  }
  const invoiceNumber = load.tms_invoice_number || `INV-${load.load_number}`;
  return {
    invoiceNumber,
    loadNumber: load.load_number,
    customerName: load.customer_name,
    date: (load.delivery_end || load.delivery_start || new Date().toISOString()).slice(0, 10),
    poNumber: load.po_number || load.customer_reference || "",
    customerReference: load.customer_reference || load.po_number || "",
    lane: `${load.origin} → ${load.destination}`,
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    companyName: getCompanyProfile().company_name,
  };
}

export async function createTmsInvoice(loadId: number): Promise<{ invoiceNumber: string; attachmentId: number }> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const model = buildTmsInvoice(load);
  const buffer = await renderTmsInvoicePdf(model);
  const attachment = addAttachment({
    loadId,
    kind: "invoice",
    originalName: `${model.invoiceNumber}.pdf`,
    buffer,
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  markTmsInvoice(loadId, model.invoiceNumber, new Date().toISOString());
  return { invoiceNumber: model.invoiceNumber, attachmentId: attachment.id };
}

export function renderInvoicesCsv(rows: TmsInvoiceModel[]): string {
  const header = ["Invoice #", "Load #", "Customer", "Date", "Description", "Amount", "PO / WSF PO"];
  const lines = rows.map((row) =>
    [
      row.invoiceNumber,
      row.loadNumber,
      row.customerName,
      row.date,
      row.lane,
      row.total.toFixed(2),
      row.customerReference || row.poNumber,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

async function renderTmsInvoicePdf(model: TmsInvoiceModel): Promise<Buffer> {
  const defaults = getDocumentDefaults("invoice");
  const settings = getCompanySettings();
  const doc = new PDFDocument({ size: "LETTER", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.font("Helvetica-Bold").fontSize(16).text(defaults.header_text.trim() || "Invoice", { align: "center" });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(model.companyName);
  doc.text(`Invoice ${model.invoiceNumber}`);
  doc.text(`Load ${model.loadNumber}`);
  doc.text(`Customer ${model.customerName}`);
  doc.text(`Date ${model.date}`);
  if (model.customerReference) doc.text(`PO / ref ${model.customerReference}`);
  doc.text(model.lane);
  doc.moveDown();
  model.lines.forEach((line) => {
    doc.text(`${line.name}  ${formatMoney(line.amount, settings.currency)}`);
    if (line.description) doc.fontSize(8).fillColor("#4b5563").text(line.description).fontSize(10).fillColor("#111827");
  });
  doc.moveDown();
  doc.font("Helvetica-Bold").text(`Total ${formatMoney(model.total, settings.currency)}`);
  if (defaults.terms_text) {
    doc.moveDown();
    doc.font("Helvetica").fontSize(8).fillColor("#374151").text(defaults.terms_text);
  }
  doc.end();
  return done;
}

function csvCell(value: string): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}
