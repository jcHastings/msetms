import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { formatDateTime, formatMdYDisplay, formatWeight } from "./format";
import { paperworkCompanyName } from "./invoice";
import { resolveLoadCustomerPhoneLine } from "./load-contact";
import { getCustomer, getLoad, getLocation } from "./queries";
import { formatReeferSetpoint, resolveReeferSpec } from "./reefer-shared";
import { companyLogoPath, getCompanySettings, HASTINGS_OFFICE, withOfficeAddress } from "./settings";
import { listStops, type LoadStop } from "./stops";
import type { LoadView } from "./types";

export type AscendBolVariant = "master" | "blind" | "signatures" | "third_party";

export type AscendBolStop = {
  id: number | null;
  sequence: number;
  kind: "pickup" | "delivery";
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  when: string;
  cargo: string;
  reference: string;
  notes: string;
};

export type AscendBolModel = {
  variant: AscendBolVariant;
  loadNumber: string;
  date: string;
  temperature: string;
  weight: string;
  commodity: string;
  distance: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  notes: string;
  references: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  thirdPartyName: string;
  thirdPartyAddress: string;
  freightCharges: string;
  stops: AscendBolStop[];
  shipFrom: AscendBolStop | null;
  shipTo: AscendBolStop | null;
};

const INK = "#111111";
const RULE = "#222222";
const HEADER_FILL = "#d8d8d8";
const LEFT = 36;
const WIDTH = 540;
const PAGE_BOTTOM = 720;

function splitCityState(value: string): { city: string; state: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+),\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: trimmed, state: "" };
}

function officeBlock(): { name: string; address: string; phone: string } {
  const settings = withOfficeAddress({
    ...getCompanySettings(),
    street: getCompanySettings().street || HASTINGS_OFFICE.street,
    city: getCompanySettings().city || HASTINGS_OFFICE.city,
    state: getCompanySettings().state || HASTINGS_OFFICE.state,
    zip: getCompanySettings().zip || HASTINGS_OFFICE.zip,
  });
  const cityState = [settings.city.trim(), settings.state.trim()].filter(Boolean).join(", ");
  const address = [settings.street.trim(), [cityState, settings.zip.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    name: paperworkCompanyName(getCompanyProfile().company_name),
    address,
    phone: settings.dispatcher_phone.trim() || "402-302-0097",
  };
}

function stopWhen(stop: LoadStop, fallback: string): string {
  const raw = stop.window_start || stop.window_end || fallback;
  if (!raw) return "";
  const printed = formatDateTime(raw);
  return printed === "—" ? "" : printed;
}

function stopNotes(stop: LoadStop): string {
  return [stop.instructions, stop.notes].map((part) => part.trim()).filter(Boolean).join("\n");
}

function asBolStop(stop: LoadStop, index: number, fallbackWhen: string): AscendBolStop {
  const parsed = !stop.city && !stop.state ? splitCityState(stop.name) : { city: "", state: "" };
  return {
    id: stop.id || null,
    sequence: index + 1,
    kind: stop.kind === "delivery" ? "delivery" : "pickup",
    name: stop.name.trim(),
    street: stop.street.trim(),
    city: stop.city.trim() || parsed.city,
    state: stop.state.trim() || parsed.state,
    zip: stop.zip.trim(),
    phone: stop.phone.trim(),
    when: stopWhen(stop, fallbackWhen),
    cargo: stop.cargo.trim(),
    reference: stop.reference.trim(),
    notes: stopNotes(stop),
  };
}

function syntheticStop(
  load: LoadView,
  kind: "pickup" | "delivery",
  sequence: number,
): AscendBolStop {
  const label = kind === "pickup" ? load.origin : load.destination;
  const parsed = splitCityState(label);
  return {
    id: null,
    sequence,
    kind,
    name: "",
    street: "",
    city: parsed.city,
    state: parsed.state,
    zip: "",
    phone: "",
    when: stopWhen(
      {
        window_start: kind === "pickup" ? load.pickup_start : load.delivery_start,
        window_end: kind === "pickup" ? load.pickup_end : load.delivery_end,
      } as LoadStop,
      kind === "pickup" ? load.pickup_start : load.delivery_start,
    ),
    cargo: load.commodity.trim(),
    reference: (load.po_number || load.customer_reference || "").trim(),
    notes: "",
  };
}

function stopFromLocation(
  load: LoadView,
  kind: "pickup" | "delivery",
  locationId: number | null,
  fallbackName: string,
  sequence: number,
): AscendBolStop {
  const location = locationId ? getLocation(locationId) : null;
  if (!location) return syntheticStop(load, kind, sequence);
  return {
    id: null,
    sequence,
    kind,
    name: /^[A-Za-z .'-]+,\s*[A-Z]{2}$/.test((location.name || fallbackName).trim())
      ? ""
      : location.name || fallbackName,
    street: location.street.trim(),
    city: location.city.trim(),
    state: location.state.trim(),
    zip: location.zip.trim(),
    phone: location.phone.trim(),
    when: stopWhen(
      {
        window_start: kind === "pickup" ? load.pickup_start : load.delivery_start,
        window_end: kind === "pickup" ? load.pickup_end : load.delivery_end,
      } as LoadStop,
      kind === "pickup" ? load.pickup_start : load.delivery_start,
    ),
    cargo: load.commodity.trim(),
    reference: (load.po_number || load.customer_reference || "").trim(),
    notes: "",
  };
}

export function bolStopsForLoad(load: LoadView, stops: LoadStop[]): AscendBolStop[] {
  if (stops.length) {
    return stops.map((stop, index) =>
      asBolStop(stop, index, stop.kind === "pickup" ? load.pickup_start : load.delivery_start),
    );
  }
  return [
    stopFromLocation(load, "pickup", load.shipper_location_id, load.origin, 1),
    stopFromLocation(load, "delivery", load.consignee_location_id, load.destination, 2),
  ];
}

function deliveryStopsOf(stops: AscendBolStop[], load: LoadView): AscendBolStop[] {
  const deliveries = stops.filter((stop) => stop.kind === "delivery");
  return deliveries.length ? deliveries : [syntheticStop(load, "delivery", stops.length + 1)];
}

function pickupOf(stops: AscendBolStop[], load: LoadView): AscendBolStop {
  return stops.find((stop) => stop.kind === "pickup") ?? syntheticStop(load, "pickup", 1);
}

function loadReferences(load: LoadView): string {
  return [load.po_number, load.customer_reference, load.reference_number]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join("  ·  ");
}

function customerBlock(load: LoadView): { name: string; address: string; phone: string } {
  const customer = getCustomer(load.customer_id);
  const notes = String(customer?.billing_notes ?? "").trim();
  const billing =
    notes && !/created from a rate confirmation/i.test(notes) && !/^net\s*\d+\s*\.?$/i.test(notes)
      ? notes.replace(/\s*\n+\s*/g, ", ")
      : "";
  return {
    name: load.customer_name.trim(),
    address: billing,
    phone: resolveLoadCustomerPhoneLine(load),
  };
}

export function buildAscendBolModel(
  loadId: number,
  variant: AscendBolVariant,
  destStopId?: number | null,
): AscendBolModel {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const office = officeBlock();
  const customer = customerBlock(load);
  const reefer = resolveReeferSpec({
    reefer_setpoint_f: load.reefer_setpoint_f,
    temperature_f: load.temperature_f,
    reefer_mode: load.reefer_mode,
    special_instructions: load.special_instructions,
    equipment: load.equipment,
    truck_type: load.truck_type,
    trailer_type: load.trailer_type,
  });
  const stops = bolStopsForLoad(load, listStops(loadId));
  const shipFrom = pickupOf(stops, load);
  const deliveries = deliveryStopsOf(stops, load);
  const shipTo =
    variant === "third_party"
      ? (deliveries.find((stop) => stop.id === (destStopId ?? null)) ?? deliveries[0] ?? null)
      : (deliveries[deliveries.length - 1] ?? null);
  const miles = load.route_miles != null && load.route_miles > 0 ? `${Math.round(load.route_miles)} miles` : "";
  return {
    variant,
    loadNumber: load.load_number,
    date: formatMdYDisplay(load.pickup_start || new Date().toISOString()),
    temperature: reefer.isReefer ? formatReeferSetpoint(reefer.setpointF) : "",
    weight: load.weight != null ? formatWeight(load.weight) : "",
    commodity: load.commodity.trim(),
    distance: miles,
    customerName: customer.name,
    customerAddress: customer.address,
    customerPhone: customer.phone,
    notes: (load.special_instructions || load.notes || "").trim(),
    references: loadReferences(load),
    companyName: office.name,
    companyAddress: office.address,
    companyPhone: office.phone,
    thirdPartyName: customer.name,
    thirdPartyAddress: customer.address,
    freightCharges: variant === "third_party" ? "3rd Party" : "Prepaid",
    stops: variant === "third_party" ? [shipFrom, shipTo].filter((stop): stop is AscendBolStop => Boolean(stop)) : stops,
    shipFrom,
    shipTo,
  };
}

export async function renderAscendBolPdf(model: AscendBolModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 28, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    if (model.variant === "third_party") drawLaneBol(doc, model);
    else drawStopListBol(doc, model);
    writePageNumbers(doc, model.loadNumber);
    doc.end();
  });
}

function writePageNumbers(doc: PDFKit.PDFDocument, loadNumber: string): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.font("Helvetica").fontSize(8).fillColor(INK);
    doc.text(`Load #${loadNumber}`, LEFT, 748, { width: 200, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, LEFT, 748, { width: WIDTH, align: "right", lineBreak: false });
  }
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number): void {
  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [88, 36] });
      return;
    } catch {
      // Fall through to the drawn mark.
    }
  }
  doc.font("Helvetica-Bold").fontSize(16);
  doc.fillColor("#1e4d8c").text("MS", x, y + 6, { lineBreak: false, continued: true });
  doc.fillColor("#0b1b33").text(" E", { lineBreak: false, continued: true });
  doc.fillColor("#c8102e").text("X", { lineBreak: false, continued: true });
  doc.fillColor("#0b1b33").text("PRESS", { lineBreak: false });
}

function drawMetaPair(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  doc.save();
  doc.rect(x, y, 78, 16).fill(HEADER_FILL);
  doc.restore();
  doc.rect(x, y, 78, 16).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.rect(x + 78, y, width - 78, 16).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
  doc.text(label, x + 3, y + 4, { width: 72, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(value || " ", x + 82, y + 4, { width: width - 86, lineBreak: false });
}

function drawHeaderBar(doc: PDFKit.PDFDocument, x: number, y: number, width: number, title: string): void {
  doc.save();
  doc.rect(x, y, width, 14).fill(HEADER_FILL);
  doc.restore();
  doc.rect(x, y, width, 14).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
  doc.text(title, x + 4, y + 3, { width: width - 8, lineBreak: false });
}

function drawCompanyAndTitle(doc: PDFKit.PDFDocument, model: AscendBolModel): number {
  drawLogo(doc, LEFT, 28);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK);
  doc.text("BILL OF LADING", LEFT, 28, { width: WIDTH, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text(model.companyName, LEFT + 96, 32, { width: 220, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(model.companyAddress, LEFT + 96, 44, { width: 220, lineBreak: false });
  doc.text(model.companyPhone ? `Phone: ${model.companyPhone}` : "", LEFT + 96, 56, {
    width: 220,
    lineBreak: false,
  });
  return 78;
}

function drawLoadFacts(doc: PDFKit.PDFDocument, model: AscendBolModel, y: number): number {
  const facts = [
    ["Load #", model.loadNumber],
    ["Date", model.date],
    ["Temperature", model.temperature],
    ["Weight", model.weight],
    ["Commodity", model.commodity],
    ["Distance", model.distance],
  ];
  const col = WIDTH / 3;
  facts.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const colIndex = index % 3;
    drawMetaPair(doc, LEFT + colIndex * col, y + row * 16, col, label, value);
  });
  return y + 36;
}

function boxedText(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  body: string,
  minHeight = 52,
): number {
  const textHeight = Math.max(24, doc.heightOfString(body || " ", { width: width - 10, lineGap: 1 }));
  const height = Math.max(minHeight, 20 + textHeight);
  drawHeaderBar(doc, x, y, width, title);
  doc.rect(x, y + 14, width, height - 14).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(INK);
  doc.text(body || " ", x + 5, y + 18, { width: width - 10, lineGap: 1 });
  return y + height;
}

function locationLines(stop: AscendBolStop, blind: boolean): string[] {
  if (blind) {
    const cityState = [stop.city, stop.state].filter(Boolean).join(", ");
    return [cityState || " "];
  }
  const cityState = [stop.city, stop.state].filter(Boolean).join(", ");
  const cityZip = [cityState, stop.zip].filter(Boolean).join(" ");
  return [stop.name, stop.street, cityZip].filter(Boolean);
}

function contactLines(stop: AscendBolStop, blind: boolean): string[] {
  if (blind) return [];
  return [stop.phone ? `Phone: ${stop.phone}` : ""].filter(Boolean);
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) return y;
  doc.addPage();
  return 36;
}

function drawSignatureTriple(doc: PDFKit.PDFDocument, y: number, labels: [string, string, string]): number {
  const col = WIDTH / 3;
  const height = 54;
  labels.forEach((title, index) => {
    const x = LEFT + index * col;
    doc.rect(x, y, col, height).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(title, x + 4, y + 4, { width: col - 8, lineBreak: false });
    doc.font("Helvetica").fontSize(7);
    doc.text("Print Name", x + 4, y + 16, { width: col - 8, lineBreak: false });
    doc.moveTo(x + 4, y + 30).lineTo(x + col - 8, y + 30).stroke();
    doc.text("Signature / Date", x + 4, y + 34, { width: col - 8, lineBreak: false });
    doc.moveTo(x + 4, y + 48).lineTo(x + col - 8, y + 48).stroke();
  });
  return y + height;
}

function drawStopSignatures(doc: PDFKit.PDFDocument, y: number, kind: "pickup" | "delivery"): number {
  const leftTitle = kind === "pickup" ? "Shipper / Consignor" : "Receiver / Consignee";
  const cols = [
    { title: leftTitle, x: LEFT, w: 250 },
    { title: "Driver Initials", x: LEFT + 250, w: 140 },
    { title: "Date", x: LEFT + 390, w: 150 },
  ];
  const height = 44;
  for (const col of cols) {
    doc.rect(col.x, y, col.w, height).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(col.title, col.x + 4, y + 4, { width: col.w - 8, lineBreak: false });
    doc.font("Helvetica").fontSize(7);
    doc.text("Print Name", col.x + 4, y + 16, { width: col.w - 8, lineBreak: false });
    doc.moveTo(col.x + 4, y + 38).lineTo(col.x + col.w - 8, y + 38).stroke();
  }
  return y + height + 4;
}

function drawStopCard(
  doc: PDFKit.PDFDocument,
  model: AscendBolModel,
  stop: AscendBolStop,
  startY: number,
): number {
  const blind = model.variant === "blind";
  const location = locationLines(stop, blind);
  const contact = contactLines(stop, blind);
  const extras = [
    stop.reference && !blind ? `References: ${stop.reference}` : "",
    stop.cargo ? `Cargo: ${stop.cargo}` : "",
    !blind && stop.notes ? `Notes: ${stop.notes}` : "",
  ].filter(Boolean);
  const body = [...location, ...contact, ...extras].join("\n") || " ";
  doc.font("Helvetica").fontSize(8);
  const textHeight = doc.heightOfString(body, { width: WIDTH - 120, lineGap: 1 });
  const sigH = model.variant === "signatures" ? 48 : 0;
  const height = Math.max(58, 28 + textHeight + sigH);
  let y = ensureSpace(doc, startY, height + 8);
  doc.rect(LEFT, y, WIDTH, height).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.save();
  doc.rect(LEFT, y, 28, height).fill(HEADER_FILL);
  doc.restore();
  doc.rect(LEFT, y, 28, height).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  doc.text(String(stop.sequence), LEFT, y + 8, { width: 28, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text(stop.kind === "delivery" ? "Delivery" : "Pickup", LEFT + 36, y + 6, {
    width: 80,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8);
  doc.text(stop.when, LEFT + 120, y + 6, { width: 160, lineBreak: false });
  doc.text(body, LEFT + 36, y + 20, { width: WIDTH - 48, lineGap: 1 });
  if (model.variant === "signatures") {
    drawStopSignatures(doc, y + height - 48, stop.kind);
  }
  return y + height + 6;
}

function drawStopListBol(doc: PDFKit.PDFDocument, model: AscendBolModel): void {
  let y = drawCompanyAndTitle(doc, model);
  y = drawLoadFacts(doc, model, y + 6);
  if (model.variant !== "blind" && (model.customerName || model.customerAddress || model.customerPhone)) {
    const customer = [model.customerName, model.customerAddress, model.customerPhone ? `Phone: ${model.customerPhone}` : ""]
      .filter(Boolean)
      .join("\n");
    y = boxedText(doc, LEFT, y + 8, WIDTH, "Customer Information", customer, 48);
  }
  const notes = [model.notes && `Notes: ${model.notes}`, model.references && `Reference(s): ${model.references}`]
    .filter(Boolean)
    .join("\n");
  if (notes) y = boxedText(doc, LEFT, y + 6, WIDTH, "Notes and References", notes, 44);
  drawHeaderBar(doc, LEFT, y + 8, WIDTH, "Stops / Actions");
  y += 22;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
  doc.text("#", LEFT + 6, y, { width: 20, lineBreak: false });
  doc.text("Action", LEFT + 36, y, { width: 70, lineBreak: false });
  doc.text("Date/Time", LEFT + 120, y, { width: 120, lineBreak: false });
  doc.text(model.variant === "blind" ? "Location (city / state)" : "Location", LEFT + 250, y, {
    width: 200,
    lineBreak: false,
  });
  y += 12;
  for (const stop of model.stops) {
    y = drawStopCard(doc, model, stop, y);
  }
  if (model.variant === "signatures") {
    y = ensureSpace(doc, y + 4, 60);
    y = drawSignatureTriple(doc, y, ["Driver / Carrier", "Print Name / Signature", "Date"]);
    return;
  }
  y = ensureSpace(doc, y + 8, 60);
  drawSignatureTriple(doc, y, ["Shipper / Consignor", "Driver / Carrier", "Receiver / Consignee"]);
}

function drawLaneParty(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  stop: AscendBolStop | null,
): void {
  const lines = stop ? locationLines(stop, false) : [];
  if (stop?.phone) lines.push(`Tel: ${stop.phone}`);
  drawHeaderBar(doc, x, y, width, title);
  doc.rect(x, y + 14, width, 72).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  doc.text(lines[0] || " ", x + 5, y + 20, { width: width - 10, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(lines.slice(1).join("\n") || " ", x + 5, y + 34, { width: width - 10, lineGap: 1 });
}

function drawLaneBol(doc: PDFKit.PDFDocument, model: AscendBolModel): void {
  let y = drawCompanyAndTitle(doc, model);
  drawMetaPair(doc, LEFT + WIDTH - 220, 48, 220, "BOL Number", model.loadNumber);
  drawMetaPair(doc, LEFT + WIDTH - 220, 64, 220, "Date", model.date);
  const col = WIDTH / 2;
  y = 86;
  drawLaneParty(doc, LEFT, y, col, "Ship From", model.shipFrom);
  drawLaneParty(doc, LEFT + col, y, col, "Ship To", model.shipTo);
  y += 86;
  drawHeaderBar(doc, LEFT, y, col, "Third Party Freight Charges Bill To");
  doc.rect(LEFT, y + 14, col, 56).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  doc.text(model.thirdPartyName, LEFT + 5, y + 20, { width: col - 10, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(model.thirdPartyAddress, LEFT + 5, y + 34, { width: col - 10, lineGap: 1 });
  drawHeaderBar(doc, LEFT + col, y, col, "Carrier");
  doc.rect(LEFT + col, y + 14, col, 56).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  doc.text(model.companyName, LEFT + col + 5, y + 20, { width: col - 10, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(`Freight Terms: ${model.freightCharges}`, LEFT + col + 5, y + 36, {
    width: col - 10,
    lineBreak: false,
  });
  y += 76;
  const destNotes = model.shipTo?.notes ? `${model.shipTo.name}:\n${model.shipTo.notes}` : "";
  const notes = [model.notes, destNotes].filter(Boolean).join("\n\n");
  y = boxedText(doc, LEFT, y, WIDTH, "Notes / Special Instructions", notes, 64);
  const cargo = [
    model.shipTo?.cargo || model.commodity,
    model.weight,
    model.shipTo?.reference ? `References: ${model.shipTo.reference}` : model.references,
  ]
    .filter(Boolean)
    .join("  ·  ");
  y = boxedText(doc, LEFT, y + 6, WIDTH, "Cargo Information", cargo, 48);
  drawSignatureTriple(doc, y + 10, ["Receiver / Consignee", "Shipper", "Carrier"]);
}
