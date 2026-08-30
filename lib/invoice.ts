import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { addAttachment } from "./files";
import { formatInvoiceMoney, formatMdYDisplay, formatStopWindow, formatWeight } from "./format";
import { labelForPayCategory } from "./load-page-shared";
import { applyLocationToStop, formatStopPartyAddress, matchLocationForStop } from "./locations";
import { customerInvoicePayItems } from "./pay-items";
import { listChildLoads } from "./master-load";
import { getCustomer, getLoad, listLocations, markTmsInvoice } from "./queries";
import { expandDocumentTags, pdfFontName, scaledFontSize } from "./document-tags";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults, getDocumentFont } from "./settings";
import { routeGuideFromLoad } from "./routing-shared";
import { listStops, type LoadStop } from "./stops";
import { isBillableStatus, type LoadView, type Location } from "./types";

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
  customerContactPhone?: string;
  terms?: string;
  dueDate?: string;
  dispatcherName?: string;
  companyDocket?: string;
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
      window: formatStopWindow(filled.window_start, filled.window_end, filled.schedule_type),
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
  contactPhone: string;
  terms: string;
} {
  const settings = getCompanySettings();
  const company = getCompanyProfile();
  const customer = getCustomer(load.customer_id);
  const contact = customer?.contacts[0];
  const billPhone = (load.contact_phone || contact?.phone || "").trim();
  const contactName = (load.contact_name || contact?.name || "").trim();
  const contactPhone = (contact?.phone || load.contact_phone || "").trim();
  const terms = (customer?.payment_terms ?? "").trim();
  if (isCompanyCustomerName(load.customer_name, company.company_name)) {
    return {
      street: settings.street.trim(),
      cityStateZip: cityStateZipLine(settings.city, settings.state, settings.zip),
      phone: billPhone || settings.dispatcher_phone.trim(),
      contact: contactName,
      contactPhone,
      terms,
    };
  }
  return {
    street: "",
    cityStateZip: "",
    phone: billPhone,
    contact: contactName,
    contactPhone,
    terms,
  };
}

function addDaysMdY(mdy: string, days: number): string {
  const match = String(mdy).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!match) return "";
  const year = Number(match[3]) + (Number(match[3]) >= 70 ? 1900 : 2000);
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]) + days);
  if (Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${String(date.getFullYear()).slice(-2)}`;
}

function dueDateFromTerms(terms: string, invoiceDate: string): string {
  const net = terms.match(/net\s*(\d+)/i);
  if (!net) return "";
  return addDaysMdY(invoiceDate, Number(net[1]));
}

function invoiceDate(load: LoadView): string {
  const raw = (load.delivery_end || load.delivery_start || load.tms_invoice_at || new Date().toISOString()).trim();
  const printed = formatMdYDisplay(raw);
  return printed === "—" ? formatMdYDisplay(new Date().toISOString()) : printed;
}

export function buildTmsInvoice(load: LoadView, options: { allowDraft?: boolean } = {}): TmsInvoiceModel {
  if (load.non_revenue) {
    throw new Error("Empty move — no customer invoice.");
  }
  if (!options.allowDraft) {
    const children = listChildLoads(load.id);
    if (children.length) {
      throw new Error(
        `Invoice the customer splits (${children.map((child) => child.load_number).join(", ")}) — this master is the trip.`,
      );
    }
  }
  if (!options.allowDraft && !isBillableStatus(load.status)) {
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
  const date = invoiceDate(load);
  return {
    invoiceNumber,
    loadNumber: load.load_number,
    customerName: load.customer_name,
    date,
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
    miles: (() => {
      const total = routeGuideFromLoad(load, { stopCount: listStops(load.id).length }).totalMiles;
      return total != null ? String(total) : "";
    })(),
    customerStreet: customer.street,
    customerCityStateZip: customer.cityStateZip,
    customerPhone: customer.phone,
    customerContact: customer.contact,
    customerContactPhone: customer.contactPhone,
    terms: customer.terms,
    dueDate: dueDateFromTerms(customer.terms, date),
    dispatcherName: (load.dispatcher_name || company.dispatcher_name || "").trim(),
    companyDocket: "",
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
  const doc = new PDFDocument({
    size: "LETTER",
    bufferPages: true,
    autoFirstPage: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 48;
  const width = 516;
  const ink = "#111111";
  const pageBottom = 720;
  let y = 48;

  function addContentPage() {
    doc.addPage();
    y = 48;
    y = drawContinuationHeader(doc, model, left, width, y);
  }

  function ensureSpace(needed: number) {
    if (y + needed <= pageBottom) return;
    addContentPage();
  }

  const logo = companyLogoPath();
  let companyY = y;
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [132, 46] });
      companyY = y + 52;
    } catch {
      companyY = y;
    }
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ink).text(model.companyLegalName, left, companyY, {
    width: 250,
  });
  companyY += 16;
  for (const line of addressLines(
    settings.street,
    cityStateZipLine(settings.city, settings.state, settings.zip),
  )) {
    doc.font("Helvetica").fontSize(9).fillColor(ink).text(line, left, companyY, { width: 250 });
    companyY += 12;
  }
  if (model.companyDocket?.trim()) {
    doc.font("Helvetica").fontSize(9).text(model.companyDocket.trim(), left, companyY, { width: 250 });
    companyY += 12;
  }
  if (model.companyPhone) {
    doc.font("Helvetica").fontSize(9).text(`Phone: ${model.companyPhone}`, left, companyY, { width: 250 });
    companyY += 12;
  }

  doc.font("Helvetica-Bold").fontSize(22).fillColor(ink);
  doc.text("INVOICE", left, y, { width, align: "right" });
  const meta = [
    ["Invoice #", model.invoiceNumber],
    ["Date", model.date],
    ["Terms", model.terms ?? ""],
    ["Due Date", model.dueDate ?? ""],
    ["Weight", model.weight],
    ["Distance", model.miles ? `${model.miles} miles` : ""],
  ].filter(([, value]) => value);
  let metaY = y + 30;
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, left + 300, metaY, { width: 80, lineBreak: false });
    doc.font("Helvetica").text(value, left + 380, metaY, { width: 136, lineBreak: false });
    metaY += 14;
  }
  y = Math.max(companyY, metaY) + 22;

  y = drawSectionBand(doc, left, y, width, "Customer Information");
  const billLines = [
    model.customerName,
    ...addressLines(model.customerStreet, model.customerCityStateZip),
    model.customerPhone,
  ].filter((line) => line.trim());
  const contactLines = [
    model.customerContact ? `Primary Contact: ${model.customerContact}` : "",
    model.customerContactPhone ? `Phone: ${model.customerContactPhone}` : "",
  ].filter(Boolean);
  const blockH = Math.max(billLines.length, contactLines.length) * 13;
  ensureSpace(blockH + 8);
  const blockTop = y;
  billLines.forEach((line, index) => {
    doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(ink);
    doc.text(line, left, blockTop + index * 13, { width: 280 });
  });
  contactLines.forEach((line, index) => {
    doc.font("Helvetica").fontSize(9).fillColor(ink).text(line, left + 300, blockTop + index * 13, { width: 216 });
  });
  y = blockTop + blockH + 20;

  const showNotes = model.lines.some((line) => line.description.trim());
  ensureSpace(56);
  y = drawSectionBand(doc, left, y, width, "Pay Items");
  const payHeaders = showNotes
    ? ["Description", "Notes", "Quantity", "Rate", "Amount"]
    : ["Description", "Quantity", "Rate", "Amount"];
  const payWidths = showNotes ? [140, 140, 70, 80, 86] : [220, 90, 100, 106];
  const payRows = model.lines.map((line) =>
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
  );
  const totalRow = showNotes
    ? ["Total", "", "", "", formatInvoiceMoney(model.total, currency)]
    : ["Total", "", "", formatInvoiceMoney(model.total, currency)];
  y = drawLetterTable(doc, left, y, width, payHeaders, payWidths, payRows, {
    totalRow,
    pageBottom,
    onPage: addContentPage,
    getY: () => y,
    setY: (next) => {
      y = next;
    },
  });
  y += 22;

  if (model.stops.length) {
    ensureSpace(56);
    y = drawSectionBand(doc, left, y, width, "Pickup / Delivery");
    y = drawLetterTable(
      doc,
      left,
      y,
      width,
      ["#", "Pickup / Delivery", "Date/Time", "Location", "Contact"],
      [22, 78, 108, 200, 108],
      model.stops.map((stop) => [
        String(stop.sequence),
        stop.kind,
        stop.window,
        [stopLocationBlock(stop), stop.reference ? `References: ${stop.reference}` : "", stop.cargo ? `Cargo: ${stop.cargo}` : ""]
          .filter(Boolean)
          .join("\n"),
        stop.phone,
      ]),
      {
        pageBottom,
        onPage: addContentPage,
        getY: () => y,
        setY: (next) => {
          y = next;
        },
      },
    );
    y += 16;
  }

  if (model.publicNotes?.trim()) {
    ensureSpace(28);
    doc.font("Helvetica").fontSize(9).fillColor(ink).text(model.publicNotes, left, y, { width });
    y += 14;
  }

  const font = getDocumentFont();
  const bodyFont = pdfFontName(font.family);
  const copySize = scaledFontSize(defaults.font_size || 10, font.scale);
  const tagCtx = {
    orgName: model.companyName,
    userName: model.dispatcherName,
    userEmail: model.companyEmail,
    userPhone: model.companyPhone,
    loadId: model.loadNumber,
    customerName: model.customerName,
    customerPhone: model.customerPhone,
  };
  const termsCopy = expandDocumentTags(defaults.terms_text, tagCtx).trim();
  const footerCopy = expandDocumentTags(defaults.footer_text, tagCtx).trim();
  if (termsCopy) {
    ensureSpace(24);
    doc.font(bodyFont).fontSize(Math.max(7, copySize - 2)).fillColor(ink).text(termsCopy, left, y, { width });
    y += 12;
  }
  if (footerCopy) {
    ensureSpace(24);
    doc.font(bodyFont).fontSize(Math.max(7, copySize - 2)).fillColor("#374151").text(footerCopy, left, y, { width });
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    drawPinnedFooter(doc, i + 1, range.count, model, left, width);
  }

  doc.end();
  return done;
}

function drawSectionBand(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
): number {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(title, x, y);
  y += 14;
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#111111").lineWidth(0.8).stroke();
  return y + 10;
}

function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  model: TmsInvoiceModel,
  x: number,
  width: number,
  y: number,
): number {
  const ref = model.customerReference || model.poNumber || model.loadNumber;
  doc.rect(x, y, width, 20).fill("#e5e7eb");
  doc.font("Helvetica").fontSize(8).fillColor("#111111").text(`References: ${ref}`, x + 8, y + 6, { width: width - 16 });
  return y + 28;
}

function drawPinnedFooter(
  doc: PDFKit.PDFDocument,
  page: number,
  pageCount: number,
  model: TmsInvoiceModel,
  x: number,
  width: number,
): void {
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const top = 748;
  doc.moveTo(x, top).lineTo(x + width, top).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  doc.moveTo(x + 172, top).lineTo(x + 172, top + 28).stroke();
  doc.moveTo(x + 344, top).lineTo(x + 344, top + 28).stroke();
  const dispatcher = (model.dispatcherName ?? "").trim();
  const right = dispatcher ? `${dispatcher} (${model.companyLegalName})` : model.companyLegalName;
  doc.font("Helvetica").fontSize(8).fillColor("#111111");
  doc.text(`Page ${page} of ${pageCount}`, x + 8, top + 10, {
    width: 156,
    lineBreak: false,
    height: 12,
  });
  doc.text(`Load #${model.loadNumber}`, x + 180, top + 10, {
    width: 156,
    align: "center",
    lineBreak: false,
    height: 12,
  });
  doc.text(right, x + 352, top + 10, {
    width: 156,
    align: "right",
    lineBreak: false,
    height: 12,
  });
}

function drawLetterTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  headers: string[],
  widths: number[],
  rows: string[][],
  options: {
    totalRow?: string[];
    pageBottom: number;
    onPage: () => void;
    getY: () => number;
    setY: (next: number) => void;
  },
): number {
  const headerH = 18;
  const drawHeader = (at: number) => {
    doc.rect(x, at, width, headerH).fill("#e5e7eb");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111111");
    let cx = x + 4;
    headers.forEach((header, index) => {
      doc.text(header, cx, at + 5, { width: widths[index] - 8, lineBreak: false });
      cx += widths[index];
    });
    return at + headerH;
  };

  if (y + headerH + 22 > options.pageBottom) {
    options.onPage();
    y = options.getY();
  }
  y = drawHeader(y);
  let segmentTop = y - headerH;

  const drawRow = (row: string[], rowIndex: number, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    const heights = row.map((cell, index) => doc.heightOfString(cell || " ", { width: widths[index] - 8 }));
    const rowH = Math.max(18, ...heights) + 8;
    if (y + rowH > options.pageBottom) {
      doc.strokeColor("#d1d5db").lineWidth(0.5).rect(x, segmentTop, width, Math.max(headerH, y - segmentTop)).stroke();
      options.onPage();
      y = options.getY();
      y = drawHeader(y);
      segmentTop = y - headerH;
    }
    if (!bold && rowIndex % 2 === 1) {
      doc.rect(x, y, width, rowH).fill("#f9fafb");
    }
    let cx = x + 4;
    row.forEach((cell, index) => {
      const numeric = /^(quantity|rate|amount)$/i.test(headers[index] ?? "");
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 8).fillColor("#111111");
      doc.text(cell || "", cx, y + 5, {
        width: widths[index] - 8,
        align: numeric ? "right" : "left",
      });
      cx += widths[index];
    });
    y += rowH;
  };

  rows.forEach((row, rowIndex) => drawRow(row, rowIndex));
  if (options.totalRow) {
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#111111").lineWidth(0.6).stroke();
    drawRow(options.totalRow, rows.length, true);
  }
  doc.strokeColor("#d1d5db").lineWidth(0.5).rect(x, segmentTop, width, Math.max(headerH, y - segmentTop)).stroke();
  options.setY(y);
  return y;
}

function csvCell(value: string): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}
