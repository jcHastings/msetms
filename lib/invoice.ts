import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { addAttachment } from "./files";
import { formatInvoiceMoney, formatWeight } from "./format";
import { labelForPayCategory } from "./load-page-shared";
import { formatLocationAddress } from "./locations";
import { customerInvoicePayItems } from "./pay-items";
import { getCustomer, getLoad, markTmsInvoice } from "./queries";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults } from "./settings";
import { listStops } from "./stops";
import type { LoadView } from "./types";

export type TmsInvoiceLine = {
  name: string;
  description: string;
  amount: number;
  qty: number | null;
  rate: number | null;
};

export type TmsInvoiceStop = {
  kind: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  reference: string;
  cargo: string;
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
  companyLegalName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  weight: string;
  miles: string;
  customerStreet: string;
  customerCityStateZip: string;
  customerPhone: string;
  customerContact: string;
  stops: TmsInvoiceStop[];
  publicNotes?: string;
};

/** Paperwork legal name. Settings "M&S Loads" prints as M&S Loads LLC. Other names are unchanged. */
export function paperworkCompanyName(name: string): string {
  const trimmed = name.trim() || "M&S Loads";
  if (/\bllc\b/i.test(trimmed)) return trimmed;
  if (/^m\s*&\s*s\s+loads$/i.test(trimmed)) return "M&S Loads LLC";
  return trimmed;
}

export function tmsCustomerInvoiceLines(load: LoadView): TmsInvoiceLine[] {
  const payItems = customerInvoicePayItems(load.id).filter((item) => item.category !== "lumper");
  const lane = `${load.origin} → ${load.destination}`;
  if (payItems.length) {
    return payItems.map((item) => ({
      name: labelForPayCategory(item.category),
      description: item.notes.trim() || `${load.load_number} ${lane}`,
      amount: item.total ?? 0,
      qty: item.qty,
      rate: item.rate,
    }));
  }
  if (load.rate != null && load.rate > 0) {
    return [{ name: "Line Haul", description: `${load.load_number} ${lane}`, amount: load.rate, qty: 1, rate: load.rate }];
  }
  return [];
}

function invoiceStops(load: LoadView): TmsInvoiceStop[] {
  return listStops(load.id).map((stop) => ({
    kind: stop.kind === "delivery" ? "Delivery" : "Pickup",
    name: stop.name,
    street: stop.street,
    city: stop.city,
    state: stop.state,
    zip: stop.zip,
    phone: stop.phone,
    reference: stop.reference || stop.confirmation,
    cargo: stop.cargo,
  }));
}

function customerBlock(load: LoadView): {
  street: string;
  cityStateZip: string;
  phone: string;
  contact: string;
} {
  const customer = getCustomer(load.customer_id);
  const contact = customer?.contacts[0];
  return {
    street: "",
    cityStateZip: "",
    phone: (load.contact_phone || contact?.phone || "").trim(),
    contact: (load.contact_name || contact?.name || "").trim(),
  };
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
  const settings = getCompanySettings();
  const company = getCompanyProfile();
  const customer = customerBlock(load);
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
    companyName: company.company_name,
    companyLegalName: paperworkCompanyName(company.company_name),
    companyAddress: formatCompanyAddress(settings),
    companyPhone: company.dispatcher_phone,
    companyEmail: company.dispatcher_email,
    weight: load.weight != null ? formatWeight(load.weight, settings.weight_unit) : "",
    miles: load.route_miles != null ? String(load.route_miles) : "",
    customerStreet: customer.street,
    customerCityStateZip: customer.cityStateZip,
    customerPhone: customer.phone,
    customerContact: customer.contact,
    stops: invoiceStops(load),
    publicNotes: (load.public_notes ?? "").trim(),
  };
}

export async function createTmsInvoice(loadId: number): Promise<{
  invoiceNumber: string;
  attachmentId: number;
  filename: string;
  buffer: Buffer;
}> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const model = buildTmsInvoice(load);
  const filename = `${model.invoiceNumber}.pdf`;
  const buffer = await renderTmsInvoicePdf(model);
  const attachment = addAttachment({
    loadId,
    kind: "invoice",
    originalName: filename,
    buffer,
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  markTmsInvoice(loadId, model.invoiceNumber, new Date().toISOString());
  return { invoiceNumber: model.invoiceNumber, attachmentId: attachment.id, filename, buffer };
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

export async function renderTmsInvoicePdf(model: TmsInvoiceModel): Promise<Buffer> {
  const defaults = getDocumentDefaults("invoice");
  const settings = getCompanySettings();
  const currency = settings.currency;
  const doc = new PDFDocument({ size: "LETTER", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 36;
  const pageW = 612;
  const width = pageW - 72;
  const navy = "#12315c";
  let y = 36;

  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [78, 48] });
    } catch {
      // Skip a bad logo rather than failing the invoice.
    }
  }

  doc.font("Helvetica-Bold").fontSize(18).fillColor(navy);
  doc.text("INVOICE", left + 90, y, { width: width - 90, align: "right" });
  y += 22;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(navy).text(model.companyLegalName, left + 90, y, { width: 220 });
  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  const metaX = left + 320;
  const meta = [
    ["Invoice #", model.invoiceNumber],
    ["Date", model.date],
    ["Reference", model.customerReference || model.poNumber],
    ["Weight", model.weight],
    ["Miles", model.miles],
  ].filter(([, value]) => value);
  let metaY = y;
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").fontSize(8).text(`${label}:`, metaX, metaY, { width: 70, lineBreak: false });
    doc.font("Helvetica").text(value, metaX + 70, metaY, { width: 110, lineBreak: false });
    metaY += 12;
  }
  y += 16;
  if (model.companyAddress) {
    doc.font("Helvetica").fontSize(8).fillColor("#374151").text(model.companyAddress, left + 90, y, { width: 220 });
    y += 12;
  }
  const phoneLine = [model.companyPhone, model.companyEmail].filter(Boolean).join("  ·  ");
  if (phoneLine) {
    doc.text(phoneLine, left + 90, y, { width: 220 });
    y += 12;
  }
  y = Math.max(y + 8, metaY + 10);

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(navy).lineWidth(1).stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(navy).text("Customer Information", left, y);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(model.customerName, left, y);
  y += 13;
  doc.font("Helvetica").fontSize(9);
  if (model.customerStreet) {
    doc.text(model.customerStreet, left, y);
    y += 12;
  }
  if (model.customerCityStateZip) {
    doc.text(model.customerCityStateZip, left, y);
    y += 12;
  }
  if (model.customerPhone) {
    doc.text(model.customerPhone, left, y);
    y += 12;
  }
  if (model.customerContact) {
    doc.text(`Contact: ${model.customerContact}`, left, y);
    y += 12;
  }
  y += 8;

  y = drawTable(
    doc,
    left,
    y,
    width,
    ["Description", "Qty", "Rate", "Amount"],
    [260, 50, 90, 100],
    model.lines.map((line) => [
      [line.name, line.description].filter(Boolean).join(" — "),
      line.qty != null ? String(line.qty) : "",
      formatInvoiceMoney(line.rate, currency),
      formatInvoiceMoney(line.amount, currency),
    ]),
    navy,
  );
  y += 16;

  if (model.stops.length) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(navy).text("Stops / Actions", left, y);
    y += 14;
    y = drawTable(
      doc,
      left,
      y,
      width,
      ["Type", "Name + address", "Phone", "Ref / cargo"],
      [70, 250, 90, 130],
      model.stops.map((stop) => [
        stop.kind,
        [stop.name, formatLocationAddress(stop)].filter(Boolean).join(" — "),
        stop.phone,
        [stop.reference, stop.cargo].filter(Boolean).join(" · "),
      ]),
      navy,
    );
    y += 12;
  }

  doc.font("Helvetica-Bold").fontSize(12).fillColor(navy);
  doc.text(`Total ${formatInvoiceMoney(model.total, currency)}`, left, y, { width, align: "right" });
  y += 18;

  if (model.publicNotes?.trim()) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text("Notes", left, y);
    y += 12;
    doc.font("Helvetica").fontSize(8).fillColor("#374151").text(model.publicNotes, left, y, { width });
    y += 16;
  }

  if (defaults.terms_text) {
    doc.font("Helvetica").fontSize(8).fillColor("#374151").text(defaults.terms_text, left, y, { width });
  }
  if (defaults.footer_text) {
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280").text(defaults.footer_text, left, 740, { width, align: "center" });
  }

  doc.end();
  return done;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  headers: string[],
  widths: number[],
  rows: string[][],
  navy: string,
): number {
  const rowH = 16;
  doc.rect(x, y, width, rowH).fill(navy);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
  let cx = x + 4;
  headers.forEach((header, index) => {
    doc.text(header, cx, y + 4, { width: widths[index] - 8, lineBreak: false });
    cx += widths[index];
  });
  y += rowH;
  doc.font("Helvetica").fontSize(8).fillColor("#111827");
  rows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 1) {
      doc.rect(x, y, width, rowH).fill("#f3f4f6");
      doc.fillColor("#111827");
    }
    cx = x + 4;
    row.forEach((cell, index) => {
      doc.text(cell || "", cx, y + 4, { width: widths[index] - 8, lineBreak: false });
      cx += widths[index];
    });
    y += rowH;
  });
  doc.strokeColor("#d1d5db").lineWidth(0.5).rect(x, y - rows.length * rowH - rowH, width, rows.length * rowH + rowH).stroke();
  return y;
}

function csvCell(value: string): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}
