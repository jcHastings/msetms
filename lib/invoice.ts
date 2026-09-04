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
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults, getDocumentFont, HASTINGS_OFFICE } from "./settings";
import { routeGuideFromLoad } from "./routing-shared";
import { listStops, type LoadStop } from "./stops";
import { isBillableStatus, type LoadView, type Location } from "./types";
import { resolveCustomerMainPhone } from "./load-contact";
import { invoiceFromAddress } from "./mail-shared";

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

function invoiceLineFromPayItem(item: { category: string; notes: string; total: number | null; qty: number | null; rate: number | null }): TmsInvoiceLine {
  return {
    name: labelForPayCategory(item.category),
    description: item.notes.trim(),
    amount: item.total ?? 0,
    qty: item.qty,
    rate: item.rate,
  };
}

/** Customer freight (rate or Flat Rate) plus extras such as detention. Lumper stays off. */
export function tmsCustomerInvoiceLines(load: LoadView): TmsInvoiceLine[] {
  const payItems = customerInvoicePayItems(load.id).filter((item) => item.category !== "lumper");
  const flats = payItems.filter((item) => item.category === "flat_rate");
  const extras = payItems.filter((item) => item.category !== "flat_rate");
  const lines: TmsInvoiceLine[] = [];
  if (flats.length) {
    lines.push(...flats.map(invoiceLineFromPayItem));
  } else if (load.rate != null && load.rate > 0) {
    lines.push({ name: "Flat Rate", description: "", amount: load.rate, qty: 1, rate: load.rate });
  }
  lines.push(...extras.map(invoiceLineFromPayItem));
  return lines;
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

function looksLikeBillingAddress(value: string): boolean {
  if (/\d/.test(value) && /\b[A-Z]{2}\b/.test(value)) return true;
  return /\d/.test(value) && /\b(st|street|ave|rd|blvd|dr|way|ln|ct|hwy|pkwy|box)\b/i.test(value);
}

function billingFromNotes(notes: string): { street: string; cityStateZip: string } | null {
  const trimmed = String(notes ?? "").trim();
  if (!trimmed) return null;
  if (/created from a rate confirmation/i.test(trimmed)) return null;
  if (/^net\s*\d+\s*\.?$/i.test(trimmed)) return null;
  const flattened = trimmed.replace(/\s*\n+\s*/g, ", ");
  if (!looksLikeBillingAddress(flattened)) return null;
  const match = flattened.match(/^(.*?)(?:,\s*)?([A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)\s*$/);
  if (match) {
    return { street: match[1].replace(/,\s*$/, "").trim(), cityStateZip: match[2].trim() };
  }
  return { street: flattened, cityStateZip: "" };
}

function isBlockedInvoiceContact(value: string): boolean {
  return /^(ms\s*test|jojo(?:\s+schwartz)?|carrier\s*attn|ana(?:\s+g)?)$/i.test(value.trim());
}

function customerBlock(load: LoadView): {
  street: string;
  cityStateZip: string;
  phone: string;
  contact: string;
  contactPhone: string;
  terms: string;
} {
  const company = getCompanyProfile();
  const customer = getCustomer(load.customer_id);
  const contact = customer?.contacts[0];
  const billPhone = resolveCustomerMainPhone(load.customer_id);
  const rawContact = (load.contact_name || contact?.name || "").trim();
  const contactName = isBlockedInvoiceContact(rawContact) ? "" : rawContact;
  const terms = (customer?.payment_terms ?? "").trim();
  const fromNotes = billingFromNotes(String(customer?.billing_notes ?? ""));
  const selfNamed = isCompanyCustomerName(load.customer_name, company.company_name);
  if (fromNotes) {
    return {
      street: fromNotes.street,
      cityStateZip: fromNotes.cityStateZip,
      phone: billPhone,
      contact: contactName,
      contactPhone: billPhone,
      terms,
    };
  }
  if (selfNamed) {
    return {
      street: "",
      cityStateZip: "",
      phone: "",
      contact: contactName,
      contactPhone: "",
      terms,
    };
  }
  return {
    street: "",
    cityStateZip: "",
    phone: billPhone,
    contact: contactName,
    contactPhone: billPhone,
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
    companyEmail: invoiceFromAddress(),
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
    terms: customer.terms || "Net 30",
    dueDate: dueDateFromTerms(customer.terms || "Net 30", date),
    dispatcherName: "",
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

  const left = 44;
  const width = 524;
  const ink = INVOICE_INK;
  const pageBottom = 732;
  let y = 36;

  function addContentPage() {
    doc.addPage();
    y = 36;
    y = drawContinuationHeader(doc, model, left, width, y);
  }

  function ensureSpace(needed: number) {
    if (y + needed <= pageBottom) return;
    addContentPage();
  }

  y = drawInvoiceHeader(doc, model, settings, left, width, y);
  y += 22;

  y = drawSectionBand(doc, left, y, width, "Customer Information");
  y = drawCustomerBlock(doc, model, left, width, y);
  y += 28;

  ensureSpace(72);
  y = drawSectionBand(doc, left, y, width, "Pay Items");
  const payHeaders = ["Description", "Notes", "Qty", "Rate", "Amount"];
  const payWidths = [148, 148, 52, 86, 90];
  const payRows = model.lines.map((line) => [
    line.name,
    line.description,
    line.qty != null ? String(line.qty) : "",
    formatInvoiceMoney(line.rate, currency),
    formatInvoiceMoney(line.amount, currency),
  ]);
  y = drawLetterTable(doc, left, y, width, payHeaders, payWidths, payRows, {
    pageBottom,
    minRowH: 26,
    onPage: addContentPage,
    getY: () => y,
    setY: (next) => {
      y = next;
    },
  });
  y = drawPayTotal(doc, left, width, y, payWidths, formatInvoiceMoney(model.total, currency));
  y += 28;

  const stops = invoiceStopsInPrintOrder(model.stops);
  if (stops.length) {
    const stopRows = stops.map((stop) => [
      String(stop.sequence),
      stop.kind,
      stop.window,
      [
        stopLocationBlock(stop),
        stop.reference ? `References: ${stop.reference}` : "",
        stop.cargo ? `Cargo: ${stop.cargo}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      stop.phone,
    ]);
    const stopHeaderH = 22;
    const stopMinH = 48;
    const bandH = 28;
    const neededMin = bandH + stopHeaderH + stops.length * stopMinH;
    let stopRowH = stopMinH;
    if (y + neededMin <= pageBottom) {
      const leftover = pageBottom - (y + neededMin);
      stopRowH = Math.min(76, stopMinH + leftover / Math.max(1, stops.length));
    }
    ensureSpace(bandH + stopHeaderH + stopMinH);
    y = drawSectionBand(doc, left, y, width, "Pickup / Delivery");
    y = drawLetterTable(
      doc,
      left,
      y,
      width,
      ["#", "Pickup / Delivery", "Date/Time", "Location", "Contact"],
      [28, 88, 108, 196, 104],
      stopRows,
      {
        pageBottom,
        minRowH: stopRowH,
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

const INVOICE_NAVY = "#12315c";
const INVOICE_INK = "#111111";

function invoiceTerms(model: TmsInvoiceModel): string {
  return (model.terms ?? "").trim() || "Net 30";
}

function invoiceDueDate(model: TmsInvoiceModel): string {
  return (model.dueDate ?? "").trim() || dueDateFromTerms(invoiceTerms(model), model.date);
}

function invoiceDistance(miles: string): string {
  const trimmed = miles.trim();
  if (!trimmed) return "";
  return /mile/i.test(trimmed) ? trimmed : `${trimmed} miles`;
}

function invoiceStopsInPrintOrder(stops: TmsInvoiceStop[]): TmsInvoiceStop[] {
  const pickups = stops.filter((stop) => stop.kind !== "Delivery");
  const deliveries = stops.filter((stop) => stop.kind === "Delivery");
  if (!pickups.length || !deliveries.length) return stops;
  const alreadyOrdered = stops.findIndex((stop) => stop.kind === "Delivery") > stops.findIndex((stop) => stop.kind !== "Delivery");
  return alreadyOrdered ? stops : [...pickups, ...deliveries];
}

function drawMsExpressWordmark(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc.font("Helvetica-Bold").fontSize(size).fillColor(INVOICE_NAVY).text("MS EXPRESS", x, y, { lineBreak: false });
}

function drawInvoiceLogo(doc: PDFKit.PDFDocument, x: number, y: number, fit: [number, number]): number {
  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, x, y, { fit });
      return fit[1];
    } catch {
      // Raster missing — navy wordmark keeps the MS Express mark.
    }
  }
  drawMsExpressWordmark(doc, x, y + 8, Math.max(16, Math.min(22, fit[1] - 10)));
  return 28;
}

function drawInvoiceHeader(
  doc: PDFKit.PDFDocument,
  model: TmsInvoiceModel,
  settings: ReturnType<typeof getCompanySettings>,
  x: number,
  width: number,
  y: number,
): number {
  const logoH = drawInvoiceLogo(doc, x, y, [176, 62]);
  let companyY = y + logoH + 8;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INVOICE_INK).text(model.companyLegalName, x, companyY, {
    width: 250,
  });
  companyY += 16;
  for (const line of addressLines(
    settings.street,
    cityStateZipLine(settings.city, settings.state, settings.zip),
  )) {
    doc.font("Helvetica").fontSize(9).fillColor(INVOICE_INK).text(line, x, companyY, { width: 250 });
    companyY += 13;
  }
  if (model.companyDocket?.trim()) {
    doc.font("Helvetica").fontSize(9).text(model.companyDocket.trim(), x, companyY, { width: 250 });
    companyY += 13;
  }
  if (model.companyPhone) {
    doc.font("Helvetica").fontSize(9).text(`Phone: ${model.companyPhone}`, x, companyY, { width: 250 });
    companyY += 13;
  }
  if (model.companyEmail) {
    doc.font("Helvetica").fontSize(9).text(model.companyEmail, x, companyY, { width: 250 });
    companyY += 13;
  }

  const cardW = 228;
  const cardX = x + width - cardW;
  doc.font("Helvetica-Bold").fontSize(23).fillColor(INVOICE_INK);
  doc.text("INVOICE", x, y, { width, align: "right" });
  const meta = [
    ["Invoice #", model.invoiceNumber],
    ["Date", model.date],
    ["Terms", invoiceTerms(model)],
    ["Due Date", invoiceDueDate(model)],
    ["Weight", model.weight],
    ["Distance", invoiceDistance(model.miles)],
  ];
  const rowH = 15;
  const cardY = y + 30;
  const cardH = 12 + meta.length * rowH;
  doc.rect(cardX, cardY, cardW, cardH).strokeColor(INVOICE_INK).lineWidth(1).stroke();
  let metaY = cardY + 7;
  for (const [label, value] of meta) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INVOICE_INK).text(`${label}:`, cardX + 10, metaY, {
      width: 78,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(9).text(value, cardX + 90, metaY, { width: 128, lineBreak: false });
    metaY += rowH;
  }
  const bottom = Math.max(companyY, cardY + cardH) + 14;
  doc
    .moveTo(x, bottom)
    .lineTo(x + width, bottom)
    .strokeColor(INVOICE_NAVY)
    .lineWidth(1.4)
    .stroke();
  return bottom + 8;
}

function drawSectionBand(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
): number {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INVOICE_INK).text(title, x, y);
  y += 15;
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor(INVOICE_NAVY).lineWidth(1.25).stroke();
  return y + 12;
}

function drawCustomerBlock(
  doc: PDFKit.PDFDocument,
  model: TmsInvoiceModel,
  x: number,
  width: number,
  y: number,
): number {
  const billLines = [
    model.customerName,
    ...addressLines(model.customerStreet, model.customerCityStateZip),
    model.customerPhone,
  ].filter((line) => line.trim());
  const contactLines = [
    `Primary Contact: ${model.customerContact?.trim() || ""}`,
    `Phone: ${model.customerContactPhone?.trim() || ""}`,
    "Fax:",
  ];
  const lineH = 14;
  const blockH = Math.max(64, Math.max(billLines.length, contactLines.length) * lineH);
  const blockTop = y;
  billLines.forEach((line, index) => {
    doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(INVOICE_INK);
    doc.text(line, x, blockTop + index * lineH, { width: 280 });
  });
  contactLines.forEach((line, index) => {
    doc.font("Helvetica").fontSize(10).fillColor(INVOICE_INK).text(line, x + width - 220, blockTop + index * lineH, {
      width: 220,
    });
  });
  return blockTop + blockH;
}

function drawPayTotal(
  doc: PDFKit.PDFDocument,
  x: number,
  width: number,
  y: number,
  widths: number[],
  amount: string,
): number {
  y += 8;
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor(INVOICE_INK).lineWidth(0.8).stroke();
  y += 10;
  const amountW = widths[widths.length - 1] ?? 90;
  const amountX = x + width - amountW;
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INVOICE_INK);
  doc.text("Total", amountX - 88, y, { width: 80, align: "right", lineBreak: false });
  doc.text(amount, amountX, y, { width: amountW, align: "right", lineBreak: false });
  return y + 20;
}

function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  model: TmsInvoiceModel,
  x: number,
  width: number,
  y: number,
): number {
  drawInvoiceLogo(doc, x, y, [72, 28]);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INVOICE_INK);
  doc.text("INVOICE", x + 84, y + 8, { width: 200, lineBreak: false });
  doc.text(`Load #${model.loadNumber}`, x, y + 8, { width, align: "right", lineBreak: false });
  doc.moveTo(x, y + 36).lineTo(x + width, y + 36).strokeColor(INVOICE_NAVY).lineWidth(1.1).stroke();
  return y + 46;
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
  doc.moveTo(x, top).lineTo(x + width, top).strokeColor(INVOICE_INK).lineWidth(0.7).stroke();
  const remit = `Remit to ${model.companyLegalName} / ${HASTINGS_OFFICE.city}`;
  doc.font("Helvetica").fontSize(8).fillColor(INVOICE_INK);
  doc.text(`Page ${page} of ${pageCount}`, x, top + 10, {
    width: 150,
    lineBreak: false,
    height: 12,
  });
  doc.text(`Load #${model.loadNumber}`, x + 150, top + 10, {
    width: 224,
    align: "center",
    lineBreak: false,
    height: 12,
  });
  doc.text(remit, x + 374, top + 10, {
    width: 150,
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
    pageBottom: number;
    minRowH?: number;
    onPage: () => void;
    getY: () => number;
    setY: (next: number) => void;
  },
): number {
  const headerH = 22;
  const minRowH = options.minRowH ?? 26;
  const drawHeader = (at: number) => {
    doc.rect(x, at, width, headerH).fill(INVOICE_NAVY);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
    let cx = x + 6;
    headers.forEach((header, index) => {
      const numeric = /^(qty|quantity|rate|amount)$/i.test(headers[index] ?? "");
      doc.text(header, cx, at + 7, { width: widths[index] - 10, lineBreak: false, align: numeric ? "right" : "left" });
      cx += widths[index];
    });
    return at + headerH;
  };

  if (y + headerH + minRowH > options.pageBottom) {
    options.onPage();
    y = options.getY();
  }
  y = drawHeader(y);
  let segmentTop = y - headerH;

  const drawRow = (row: string[]) => {
    doc.font("Helvetica").fontSize(9);
    const heights = row.map((cell, index) => doc.heightOfString(cell || " ", { width: widths[index] - 10 }));
    const rowH = Math.max(minRowH, ...heights) + 12;
    if (y + rowH > options.pageBottom) {
      doc.strokeColor("#c5c9d1").lineWidth(0.5).rect(x, segmentTop, width, Math.max(headerH, y - segmentTop)).stroke();
      options.onPage();
      y = options.getY();
      y = drawHeader(y);
      segmentTop = y - headerH;
    }
    let cx = x + 6;
    row.forEach((cell, index) => {
      const numeric = /^(qty|quantity|rate|amount)$/i.test(headers[index] ?? "");
      doc.font("Helvetica").fontSize(9).fillColor(INVOICE_INK);
      doc.text(cell || "", cx, y + 8, {
        width: widths[index] - 10,
        align: numeric ? "right" : "left",
      });
      cx += widths[index];
    });
    y += rowH;
    doc
      .moveTo(x, y)
      .lineTo(x + width, y)
      .strokeColor("#d8dce3")
      .lineWidth(0.4)
      .stroke();
  };

  rows.forEach((row) => drawRow(row));
  doc.strokeColor("#c5c9d1").lineWidth(0.5).rect(x, segmentTop, width, Math.max(headerH, y - segmentTop)).stroke();
  options.setY(y);
  return y;
}

function csvCell(value: string): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}
