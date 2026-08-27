import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { addAttachment } from "./files";
import { formatInvoiceMoney, formatMdYDisplay, formatStopWindow, formatWeight } from "./format";
import { labelForPayCategory } from "./load-page-shared";
import { applyLocationToStop, formatStopPartyAddress, matchLocationForStop } from "./locations";
import { customerInvoicePayItems } from "./pay-items";
import { getCustomer, getLoad, listLocations, markTmsInvoice } from "./queries";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults } from "./settings";
import { listStops, type LoadStop } from "./stops";
import type { LoadView, Location } from "./types";

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

export function isCompanyCustomerName(customerName: string, companyName: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const customer = norm(customerName);
  if (!customer) return false;
  if (customer.includes("msloads") || customer.includes("mandsloads") || customer.includes("msexpress")) {
    return true;
  }
  const company = norm(companyName).replace(/llc$/, "");
  const customerCore = customer.replace(/llc$/, "");
  return Boolean(company) && (customerCore === company || customerCore.includes(company) || company.includes(customerCore));
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

function fillStopFromLocationBook(stop: LoadStop, locations: Location[]): LoadStop {
  const match = matchLocationForStop(locations, stop);
  if (!match) return stop;
  const filled = applyLocationToStop(stop, match);
  return {
    ...stop,
    location_id: filled.location_id ?? stop.location_id,
    name: filled.name,
    street: filled.street ?? "",
    city: filled.city ?? "",
    state: filled.state ?? "",
    zip: filled.zip ?? "",
    phone: filled.phone ?? "",
  };
}

function invoiceStops(load: LoadView): TmsInvoiceStop[] {
  const locations = listLocations();
  return listStops(load.id).map((stop, index) => {
    const filled = fillStopFromLocationBook(stop, locations);
    return {
      sequence: filled.sequence || index + 1,
      kind: filled.kind === "delivery" ? "Delivery" : "Pickup",
      window: formatStopWindow(filled.window_start, filled.window_end),
      name: filled.name,
      street: filled.street,
      city: filled.city,
      state: filled.state,
      zip: filled.zip,
      phone: filled.phone,
      reference: filled.reference || filled.confirmation,
      cargo: filled.cargo,
    };
  });
}

function cityStateZipLine(city: string, state: string, zip: string): string {
  return [[city, state].map((part) => part.trim()).filter(Boolean).join(", "), zip.trim()]
    .filter(Boolean)
    .join(" ");
}

function addressLines(street: string, cityStateZip: string): string[] {
  return [street, cityStateZip].map((line) => line.trim()).filter(Boolean);
}

function stopLocationBlock(stop: TmsInvoiceStop): string {
  const address = formatStopPartyAddress(stop);
  return [stop.name, address].map((line) => line.trim()).filter(Boolean).join("\n");
}

function customerBlock(load: LoadView): {
  street: string;
  cityStateZip: string;
  phone: string;
  contact: string;
} {
  const settings = getCompanySettings();
  const company = getCompanyProfile();
  const customer = getCustomer(load.customer_id);
  const contact = customer?.contacts[0];
  const phone = (load.contact_phone || contact?.phone || "").trim();
  const contactName = (load.contact_name || contact?.name || "").trim();
  if (isCompanyCustomerName(load.customer_name, company.company_name)) {
    return {
      street: settings.street.trim(),
      cityStateZip: cityStateZipLine(settings.city, settings.state, settings.zip),
      phone: phone || settings.dispatcher_phone.trim(),
      contact: contactName,
    };
  }
  return {
    street: "",
    cityStateZip: "",
    phone,
    contact: contactName,
  };
}

function invoiceDate(load: LoadView): string {
  const raw = (load.delivery_end || load.delivery_start || load.tms_invoice_at || new Date().toISOString()).trim();
  const printed = formatMdYDisplay(raw);
  return printed === "—" ? formatMdYDisplay(new Date().toISOString()) : printed;
}

export function buildTmsInvoice(load: LoadView): TmsInvoiceModel {
  if (load.non_revenue) {
    throw new Error("Empty move — no customer invoice.");
  }
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
    date: invoiceDate(load),
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
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 40;
  const width = 532;
  const ink = "#111111";
  const rule = "#1f2937";
  let y = 40;

  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [64, 36] });
    } catch {
      // Skip a bad logo rather than failing the invoice.
    }
  }

  const companyX = logo ? left + 76 : left;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(ink).text(model.companyLegalName, companyX, y, {
    width: 250,
  });
  let companyY = y + 15;
  for (const line of addressLines(
    settings.street,
    cityStateZipLine(settings.city, settings.state, settings.zip),
  )) {
    doc.font("Helvetica").fontSize(8).fillColor(ink).text(line, companyX, companyY, { width: 250 });
    companyY += 10;
  }
  if (model.companyPhone) {
    doc.font("Helvetica").fontSize(8).text(model.companyPhone, companyX, companyY, { width: 250 });
    companyY += 10;
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor(ink);
  doc.text("INVOICE", left, y, { width, align: "right" });
  const meta = [
    ["Invoice #", model.invoiceNumber],
    ["Date", model.date],
    ["Reference", model.customerReference || model.poNumber],
    ["Weight", model.weight],
    ["Distance", model.miles ? `${model.miles} mi` : ""],
  ].filter(([, value]) => value);
  let metaY = y + 24;
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").fontSize(8).text(`${label}:`, left + 318, metaY, { width: 68, lineBreak: false });
    doc.font("Helvetica").text(value, left + 388, metaY, { width: 144, lineBreak: false });
    metaY += 11;
  }
  y = Math.max(companyY, metaY) + 8;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(rule).lineWidth(1).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(ink).text("Customer Information", left, y);
  y += 13;
  doc.font("Helvetica-Bold").fontSize(10).text(model.customerName, left, y, { width: 300 });
  if (model.customerContact) {
    doc.font("Helvetica").fontSize(8).text(model.customerContact, left + 310, y, { width: 222 });
  }
  y += 12;
  for (const line of addressLines(model.customerStreet, model.customerCityStateZip)) {
    doc.font("Helvetica").fontSize(9).text(line, left, y, { width: 300 });
    y += 11;
  }
  if (model.customerPhone) {
    doc.font("Helvetica").fontSize(9).text(model.customerPhone, left, y, { width: 300 });
    y += 11;
  }
  y += 10;

  const showNotes = model.lines.some((line) => line.description.trim());
  y = drawTable(
    doc,
    left,
    y,
    width,
    showNotes
      ? ["Description", "Notes", "Quantity", "Rate", "Amount"]
      : ["Description", "Quantity", "Rate", "Amount"],
    showNotes ? [140, 156, 68, 80, 88] : [236, 88, 104, 104],
    model.lines.map((line) =>
      showNotes
        ? [
            line.name,
            line.description,
            line.qty != null ? String(line.qty) : "",
            formatInvoiceMoney(line.rate, currency),
            formatInvoiceMoney(line.amount, currency),
          ]
        : [
            line.name,
            line.qty != null ? String(line.qty) : "",
            formatInvoiceMoney(line.rate, currency),
            formatInvoiceMoney(line.amount, currency),
          ],
    ),
  );
  y = drawTotalsBox(doc, left, y + 6, width, model.total, currency);
  y += 14;

  if (model.stops.length) {
    if (y > 620) {
      doc.addPage();
      y = 40;
    }
    doc.font("Helvetica-Bold").fontSize(9).fillColor(ink).text("Pickup / Delivery", left, y);
    y += 12;
    y = drawTable(
      doc,
      left,
      y,
      width,
      ["#", "Stop", "Date/Time", "Location", "Contact"],
      [24, 62, 118, 220, 108],
      model.stops.map((stop) => [
        String(stop.sequence),
        stop.kind,
        stop.window,
        stopLocationBlock(stop),
        stop.phone,
      ]),
    );
    y += 8;
    for (const stop of model.stops) {
      if (!stop.reference && !stop.cargo) continue;
      if (y > 720) {
        doc.addPage();
        y = 40;
      }
      doc.font("Helvetica-Bold").fontSize(8).text(`Stop ${stop.sequence}`, left, y);
      y += 10;
      if (stop.reference) {
        doc.font("Helvetica").fontSize(8).text(`References: ${stop.reference}`, left + 12, y, { width });
        y += 10;
      }
      if (stop.cargo) {
        doc.font("Helvetica").fontSize(8).text(`Cargo: ${stop.cargo}`, left + 12, y, { width });
        y += 10;
      }
    }
  }

  if (model.publicNotes?.trim()) {
    y += 6;
    doc.font("Helvetica").fontSize(8).fillColor(ink).text(model.publicNotes, left, y, { width });
    y += 12;
  }

  const terms = defaults.terms_text.trim();
  const footer = defaults.footer_text.trim();
  if (terms) {
    y += 6;
    doc.font("Helvetica").fontSize(8).fillColor(ink).text(terms, left, y, { width });
    y += 10;
  }
  if (footer) {
    doc.font("Helvetica").fontSize(8).fillColor("#4b5563").text(footer, left, y, { width });
  }

  doc.end();
  return done;
}

function drawTotalsBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  total: number,
  currency: string,
): number {
  const boxW = 176;
  const boxX = x + width - boxW;
  const rowH = 16;
  const boxH = rowH * 2;
  const money = formatInvoiceMoney(total, currency);
  doc.rect(boxX, y, boxW, boxH).strokeColor("#111111").lineWidth(0.8).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#111111");
  doc.text("Subtotal", boxX + 8, y + 4, { width: 70, lineBreak: false });
  doc.text(money, boxX + 78, y + 4, { width: 90, align: "right", lineBreak: false });
  doc.rect(boxX, y + rowH, boxW, rowH).fill("#111111");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  doc.text("Total", boxX + 8, y + rowH + 4, { width: 70, lineBreak: false });
  doc.text(money, boxX + 78, y + rowH + 4, { width: 90, align: "right", lineBreak: false });
  return y + boxH;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  headers: string[],
  widths: number[],
  rows: string[][],
): number {
  const headerH = 15;
  doc.rect(x, y, width, headerH).fill("#111111");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
  let cx = x + 4;
  headers.forEach((header, index) => {
    doc.text(header, cx, y + 3, { width: widths[index] - 8, lineBreak: false });
    cx += widths[index];
  });
  y += headerH;
  const startY = y;
  doc.font("Helvetica").fontSize(8).fillColor("#111111");
  rows.forEach((row, rowIndex) => {
    const heights = row.map((cell, index) => doc.heightOfString(cell || " ", { width: widths[index] - 8 }));
    const rowH = Math.max(15, ...heights) + 5;
    if (rowIndex % 2 === 1) {
      doc.rect(x, y, width, rowH).fill("#f3f4f6");
      doc.fillColor("#111111");
    }
    cx = x + 4;
    row.forEach((cell, index) => {
      doc.fillColor("#111111").text(cell || "", cx, y + 3, { width: widths[index] - 8 });
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
