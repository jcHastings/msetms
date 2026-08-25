import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { addAttachment } from "./files";
import { formatInvoiceMoney, formatStopWindow, formatWeight } from "./format";
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
  sequence: number;
  kind: string;
  window: string;
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
  if (payItems.length) {
    return payItems.map((item) => ({
      name: labelForPayCategory(item.category),
      description: item.notes.trim(),
      amount: item.total ?? 0,
      qty: item.qty,
      rate: item.rate,
    }));
  }
  if (load.rate != null && load.rate > 0) {
    return [{ name: "Flat Rate", description: "", amount: load.rate, qty: 1, rate: load.rate }];
  }
  return [];
}

function invoiceStops(load: LoadView): TmsInvoiceStop[] {
  return listStops(load.id).map((stop, index) => ({
    sequence: stop.sequence || index + 1,
    kind: stop.kind === "delivery" ? "Delivery" : "Pickup",
    window: formatStopWindow(stop.window_start, stop.window_end),
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

function companyAddressLines(street: string, cityStateZip: string): string[] {
  return [street, cityStateZip].map((line) => line.trim()).filter(Boolean);
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
  const width = 540;
  const navy = "#111111";
  let y = 36;

  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [72, 48] });
    } catch {
      // Skip a bad logo rather than failing the invoice.
    }
  }

  const companyX = logo ? left + 84 : left;
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text(model.companyLegalName, companyX, y, {
    width: 240,
  });
  let companyY = y + 16;
  for (const line of companyAddressLines(
    settings.street,
    [[settings.city, settings.state].filter(Boolean).join(", "), settings.zip].filter(Boolean).join(" "),
  )) {
    doc.font("Helvetica").fontSize(8).fillColor("#111111").text(line, companyX, companyY, { width: 240 });
    companyY += 11;
  }
  if (model.companyPhone) {
    doc.font("Helvetica").fontSize(8).text(`Phone: ${model.companyPhone}`, companyX, companyY, { width: 240 });
    companyY += 11;
  }

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111111");
  doc.text("INVOICE", left, y, { width, align: "right" });
  const meta = [
    ["Invoice #", model.invoiceNumber],
    ["Date", model.date],
    ["Reference", model.customerReference || model.poNumber],
    ["Weight", model.weight],
    ["Distance", model.miles ? `${model.miles} miles` : ""],
  ].filter(([, value]) => value);
  let metaY = y + 26;
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").fontSize(8).text(`${label}:`, left + 330, metaY, { width: 70, lineBreak: false });
    doc.font("Helvetica").text(value, left + 400, metaY, { width: 140, lineBreak: false });
    metaY += 12;
  }
  y = Math.max(companyY, metaY) + 12;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#111111").lineWidth(0.8).stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(10).text("Customer Information", left, y);
  y += 6;
  doc.moveTo(left, y + 8).lineTo(left + width, y + 8).strokeColor("#111111").lineWidth(0.4).stroke();
  y += 16;
  doc.font("Helvetica-Bold").fontSize(10).text(model.customerName, left, y, { width: 280 });
  if (model.customerContact) {
    doc.font("Helvetica").fontSize(9).text(`Primary Contact: ${model.customerContact}`, left + 300, y, { width: 240 });
  }
  y += 13;
  for (const line of companyAddressLines(model.customerStreet, model.customerCityStateZip)) {
    doc.font("Helvetica").fontSize(9).text(line, left, y, { width: 280 });
    y += 12;
  }
  if (model.customerPhone) {
    doc.font("Helvetica").fontSize(9).text(`Phone: ${model.customerPhone}`, left, y, { width: 280 });
    y += 12;
  }
  y += 10;

  y = drawTable(
    doc,
    left,
    y,
    width,
    ["Description", "Notes", "Quantity", "Rate", "Amount"],
    [140, 160, 70, 80, 90],
    model.lines.map((line) => [
      line.name,
      line.description,
      line.qty != null ? String(line.qty) : "",
      formatInvoiceMoney(line.rate, currency),
      formatInvoiceMoney(line.amount, currency),
    ]),
    navy,
  );
  y += 8;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
  doc.text(`Total ${formatInvoiceMoney(model.total, currency)}`, left, y, { width, align: "right" });
  y += 18;

  if (model.stops.length) {
    if (y > 680) {
      doc.addPage();
      y = 36;
    }
    doc.font("Helvetica-Bold").fontSize(10).text("Stops / Actions", left, y);
    y += 6;
    doc.moveTo(left, y + 8).lineTo(left + width, y + 8).strokeColor("#111111").lineWidth(0.4).stroke();
    y += 16;
    y = drawTable(
      doc,
      left,
      y,
      width,
      ["#", "Action", "Date/Time", "Location", "Contact"],
      [28, 70, 90, 230, 122],
      model.stops.map((stop) => [
        String(stop.sequence),
        stop.kind,
        stop.window,
        [stop.name, formatLocationAddress(stop)].filter(Boolean).join("\n"),
        stop.phone,
      ]),
      navy,
    );
    y += 8;
    for (const stop of model.stops) {
      if (!stop.reference && !stop.cargo) continue;
      if (y > 720) {
        doc.addPage();
        y = 36;
      }
      doc.font("Helvetica-Bold").fontSize(8).text(`Stop ${stop.sequence}`, left, y);
      y += 11;
      if (stop.reference) {
        doc.font("Helvetica").fontSize(8).text(`References: ${stop.reference}`, left + 12, y, { width });
        y += 11;
      }
      if (stop.cargo) {
        doc.font("Helvetica").fontSize(8).text(`Cargo: ${stop.cargo}`, left + 12, y, { width });
        y += 11;
      }
    }
  }

  if (model.publicNotes?.trim()) {
    y += 8;
    doc.font("Helvetica-Bold").fontSize(9).text("Notes", left, y);
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
  const headerH = 16;
  doc.rect(x, y, width, headerH).fill(navy);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
  let cx = x + 4;
  headers.forEach((header, index) => {
    doc.text(header, cx, y + 4, { width: widths[index] - 8, lineBreak: false });
    cx += widths[index];
  });
  y += headerH;
  const startY = y;
  doc.font("Helvetica").fontSize(8).fillColor("#111111");
  rows.forEach((row, rowIndex) => {
    const heights = row.map((cell, index) =>
      doc.heightOfString(cell || " ", { width: widths[index] - 8 }),
    );
    const rowH = Math.max(16, ...heights) + 6;
    if (rowIndex % 2 === 1) {
      doc.rect(x, y, width, rowH).fill("#f3f4f6");
      doc.fillColor("#111111");
    }
    cx = x + 4;
    row.forEach((cell, index) => {
      doc.fillColor("#111111").text(cell || "", cx, y + 4, { width: widths[index] - 8 });
      cx += widths[index];
    });
    y += rowH;
  });
  doc.strokeColor("#d1d5db").lineWidth(0.5).rect(x, startY - headerH, width, y - startY + headerH).stroke();
  return y;
}

function csvCell(value: string): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}
