import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { computeOwnerOperatorPay } from "./settlement";
import { formatLocationAddress, formatSchedulingSummary } from "./locations";
import { getCustomer, getLoad, getLocation, getTrailer } from "./queries";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults } from "./settings";
import type { CompanyProfile, LoadView } from "./types";

export type ConfirmationStop = {
  title: string;
  name: string;
  address: string;
  phone: string;
  date: string;
  time: string;
  type: string;
  quantity: string;
  weight: string;
  poNumber: string;
  confirmationNumber: string;
  extra: string;
  hoursLabel: string;
  hours: string;
  appointment: string;
  description: string;
};

export type ConfirmationModel = {
  style: "owner_operator" | "company_driver";
  company: CompanyProfile;
  loadNumber: string;
  shipDate: string;
  todayDate: string;
  carrierName: string;
  carrierPhone: string;
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  equipment: string;
  truckNumber: string;
  trailerNumber: string;
  agreedAmount: number | null;
  loadStatus: string;
  shipper: ConfirmationStop;
  consignee: ConfirmationStop;
  dispatchNotes: string;
};

export function confirmationStatus(load: LoadView): string {
  if (load.status === "in_transit" || load.driver_progress) return "On Route";
  if (load.status === "assigned") return "Dispatched";
  if (load.status === "available") return "Available";
  if (load.status === "delivered" || load.status === "completed") return "Delivered";
  if (load.status === "cancelled") return "Cancelled";
  return load.status;
}

export function equipmentLabel(load: LoadView): string {
  const trailer = load.trailer_id ? getTrailer(load.trailer_id) : null;
  const type = trailer?.type || load.truck_type;
  if (type === "reefer") return "53' Reefer";
  if (type === "dry_van") return "53' Dry Van";
  if (type === "flatbed") return "53' Flatbed";
  if (type === "box") return "Box Truck";
  if (type === "power_only") return "Power Only";
  return type ? type.replaceAll("_", " ") : "";
}

export function agreedAmountForLoad(load: LoadView): number | null {
  if (load.driver_type !== "owner_operator") return null;
  if (load.oo_pay != null) return load.oo_pay;
  return computeOwnerOperatorPay(load.rate, load.oo_percent);
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return `${value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  })} USD`;
}

export function formatMdY(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function appointmentLabel(notes: string): string {
  if (!notes.trim()) return "No";
  if (/^no\b/i.test(notes.trim())) return "No";
  return "Yes";
}

export function buildConfirmationModel(load: LoadView, company = getCompanyProfile()): ConfirmationModel {
  const customer = getCustomer(load.customer_id);
  const contact = customer?.contacts[0];
  const shipperLoc = load.shipper_location_id ? getLocation(load.shipper_location_id) : null;
  const consigneeLoc = load.consignee_location_id ? getLocation(load.consignee_location_id) : null;
  const style = load.driver_type === "owner_operator" ? "owner_operator" : "company_driver";
  const notes = [
    load.special_instructions,
    load.appointment_notes,
    shipperLoc ? `Pickup: ${formatSchedulingSummary(shipperLoc)}` : "",
    consigneeLoc ? `Delivery: ${formatSchedulingSummary(consigneeLoc)}` : "",
    load.notes,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    style,
    company,
    loadNumber: load.load_number,
    shipDate: formatMdY(load.pickup_start),
    todayDate: formatMdY(new Date().toISOString()),
    carrierName: load.driver_name ?? "",
    carrierPhone: load.driver_phone ?? "",
    driverName: load.driver_name ?? "",
    driverPhone: load.driver_phone ?? "",
    driverEmail: "",
    equipment: equipmentLabel(load),
    truckNumber: load.truck_unit ?? "",
    trailerNumber: load.trailer_unit || load.trailer_number || "",
    agreedAmount: agreedAmountForLoad(load),
    loadStatus: confirmationStatus(load),
    shipper: {
      title: "Shipper 1",
      name: shipperLoc?.name ?? load.customer_name,
      address: shipperLoc ? formatLocationAddress(shipperLoc) : load.origin,
      phone: shipperLoc?.phone || contact?.phone || "",
      date: formatMdY(load.pickup_start),
      time: formatClock(load.pickup_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: load.po_number,
      confirmationNumber: load.reference_number,
      extra: shipperLoc?.scheduling_notes ?? "",
      hoursLabel: "Shipping Hours",
      hours: shipperLoc?.hours ?? "",
      appointment:
        shipperLoc?.scheduling_type === "appointment" ? "Yes" : appointmentLabel(load.appointment_notes),
      description: load.commodity,
    },
    consignee: {
      title: "Consignee 1",
      name: consigneeLoc?.name ?? load.destination,
      address: consigneeLoc ? formatLocationAddress(consigneeLoc) : load.destination,
      phone: consigneeLoc?.phone ?? "",
      date: formatMdY(load.delivery_start),
      time: formatClock(load.delivery_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: load.po_number,
      confirmationNumber: load.reference_number,
      extra: consigneeLoc?.scheduling_notes ?? "",
      hoursLabel: "Receiving Hours",
      hours: consigneeLoc?.hours ?? "",
      appointment:
        consigneeLoc?.scheduling_type === "appointment"
          ? "Yes"
          : appointmentLabel(load.appointment_notes),
      description: load.commodity,
    },
    dispatchNotes: notes,
  };
}

export function buildConfirmationForLoad(loadId: number): ConfirmationModel {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  return buildConfirmationModel(load);
}

export async function renderConfirmationPdf(model: ConfirmationModel): Promise<Buffer> {
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawConfirmation(doc, model);
    doc.end();
  });
  return dropEmptyExtraPages(raw);
}

async function dropEmptyExtraPages(buffer: Buffer): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(buffer);
  while (pdf.getPageCount() > 1) {
    pdf.removePage(pdf.getPageCount() - 1);
  }
  return Buffer.from(await pdf.save());
}

function drawConfirmation(doc: PDFKit.PDFDocument, model: ConfirmationModel): void {
  const left = 36;
  const width = 540;
  const right = left + width;
  const defaults = getDocumentDefaults("load_confirmation");
  const bodySize = defaults.font_size || 10;
  const title =
    defaults.header_text ||
    (model.style === "company_driver" ? "Load Confirmation" : "Rate & Load Confirmation");
  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, left, 36, { fit: [56, 36] });
    } catch {
      // Skip a bad logo file rather than failing the confirmation.
    }
  }

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
  doc.text(title, left, 40, { width, align: "center", lineBreak: false });

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#12315c");
  doc.text(model.company.company_name || "M&S", left, 78, { width: 190 });
  const address = formatCompanyAddress(getCompanySettings());
  if (address) {
    doc.font("Helvetica").fontSize(7).fillColor("#4b5563").text(address, left, 92, { width: 190 });
  }

  drawContactCard(doc, 400, 36, 176, [
    ["Dispatcher", model.company.dispatcher_name],
    ["Phone #", model.company.dispatcher_phone],
    ["Fax #", model.company.dispatcher_fax],
    ["Email", model.company.dispatcher_email],
    ["LOAD #", model.loadNumber],
    ["Ship Date", model.shipDate],
    ["Today's Date", model.todayDate],
  ]);
  let y = 148;

  if (model.style === "owner_operator") {
    y = drawPartyRow(doc, left, y, width, [
      ["Carrier", model.carrierName],
      ["Phone #", model.carrierPhone],
      ["Fax #", ""],
      ["Equipment", model.equipment],
      ["Agreed Amount", formatUsd(model.agreedAmount)],
      ["Load Status", model.loadStatus],
    ]);
  } else {
    y = drawPartyRow(doc, left, y, width, [
      ["Driver", model.driverName],
      ["Mobile #", model.driverPhone],
      ["Email", model.driverEmail],
      ["Equipment", model.equipment],
      ["Truck #", model.truckNumber],
      ["Trailer #", model.trailerNumber],
      ["Load Status", model.loadStatus],
    ]);
  }

  y = drawStop(doc, left, y + 10, width, model.shipper);
  y = drawStop(doc, left, y + 8, width, model.consignee);

  y += 8;
  if (y < 640) {
    doc.font("Helvetica-Bold").fontSize(bodySize).fillColor("#111827").text("Dispatch Notes:", left, y);
    y += 12;
    doc.font("Helvetica").fontSize(Math.max(8, bodySize - 1)).fillColor("#111827");
    doc.text(model.dispatchNotes || " ", left, y, { width, height: 36 });
    y = Math.min(Math.max(y + 40, doc.y + 6), 680);
  }

  if (model.style === "owner_operator" && y < 680) {
    doc.font("Helvetica-Bold").fontSize(9).text("Carrier Pay:", left, y);
    y += 12;
    const haul = formatUsd(model.agreedAmount) || "$0.00 USD";
    doc.font("Helvetica").fontSize(9).text(`Line Haul: ${haul.replace(" USD", "")}   TOTAL: ${haul}`, left, y, {
      width,
      lineBreak: false,
    });
    y += 18;
    if (y < 700) {
      doc.font("Helvetica").fontSize(8);
      drawWriteLine(doc, left, y, 170, "Accepted By");
      drawWriteLine(doc, left + 186, y, 120, "Date");
      drawWriteLine(doc, left + 322, y, 218, "Signature");
      y += 22;
      drawWriteLine(doc, left, y, 150, "Driver Name", model.driverName);
      drawWriteLine(doc, left + 166, y, 120, "Cell #", model.driverPhone);
      drawWriteLine(doc, left + 302, y, 110, "Truck #", model.truckNumber);
      drawWriteLine(doc, left + 428, y, 112, "Trailer #", model.trailerNumber);
    }
  }

  try {
    doc.switchToPage(0);
  } catch {
    // Single-page documents have no extra buffer to switch.
  }
  if (defaults.terms_text) {
    doc.font("Helvetica").fontSize(7).fillColor("#374151");
    doc.text(defaults.terms_text, left, 708, { width, height: 22, lineBreak: true });
  }
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text(defaults.footer_text || "Page 1 of 1", left, 748, { width, align: "center" });
  doc.rect(left, 28, width, 710).strokeColor("#d1d5db").lineWidth(0.4).stroke();
  void right;
}

function drawContactCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>,
): void {
  const rowH = 12;
  doc.rect(x, y, width, rows.length * rowH + 6).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  rows.forEach(([label, value], index) => {
    doc.font("Helvetica").fontSize(7).fillColor("#4b5563");
    doc.text(`${label}:`, x + 4, y + 4 + index * rowH, { width: 58, lineBreak: false });
    doc.font(label === "LOAD #" ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor("#111827");
    doc.text(value || " ", x + 62, y + 4 + index * rowH, { width: width - 68, lineBreak: false });
  });
}

function drawPartyRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  cells: Array<[string, string]>,
): number {
  const col = width / cells.length;
  const headerH = 16;
  const valueH = 22;
  doc.save();
  doc.rect(x, y, width, headerH).fill("#e5e7eb");
  doc.restore();
  cells.forEach(([label], index) => {
    doc.rect(x + index * col, y, col, headerH + valueH).strokeColor("#9ca3af").lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827");
    doc.text(label, x + index * col + 3, y + 4, { width: col - 6 });
    doc.font("Helvetica").fontSize(8);
    doc.text(cells[index][1] || " ", x + index * col + 3, y + headerH + 4, { width: col - 6 });
  });
  return y + headerH + valueH;
}

function drawStop(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  stop: ConfirmationStop,
): number {
  const height = 104;
  doc.rect(x, y, width, height).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(stop.title, x + 6, y + 6);
  doc.font("Helvetica-Bold").fontSize(9).text(stop.name || " ", x + 6, y + 22, { width: 230 });
  doc.font("Helvetica").fontSize(8);
  doc.text(stop.address || " ", x + 6, y + 36, { width: 230 });
  if (stop.phone) doc.text(`Phone: ${stop.phone}`, x + 6, y + 62);

  const gridX = x + 250;
  const rows: Array<[string, string]> = [
    ["Date", stop.date],
    ["Time", stop.time],
    ["Type", stop.type],
    ["Quantity", stop.quantity],
    ["Weight", stop.weight ? `${stop.weight} lbs` : "lbs"],
    ["Purchase Order #", stop.poNumber],
    ["Confirmation number", stop.confirmationNumber],
    [stop.hoursLabel, stop.hours],
    ["Appointment", stop.appointment],
    ["Description", stop.description],
  ];
  rows.forEach(([label, value], index) => {
    const col = index < 5 ? 0 : 1;
    const row = index < 5 ? index : index - 5;
    kv(doc, gridX + col * 150, y + 8 + row * 14, 78, 148, label, value);
  });
  if (stop.extra) {
    doc.font("Helvetica").fontSize(7).text(stop.extra, gridX, y + 96, { width: 280 });
  }
  return y + height;
}

function kv(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  labelW: number,
  width: number,
  label: string,
  value: string,
  emphasize = false,
): void {
  doc.font("Helvetica").fontSize(7).fillColor("#4b5563").text(`${label}:`, x, y, { width: labelW });
  doc.font(emphasize ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#111827");
  doc.text(value || " ", x + labelW, y, { width: width - labelW });
}

function drawWriteLine(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value = "",
): void {
  doc.font("Helvetica").fontSize(8).fillColor("#111827").text(`${label}:`, x, y);
  const labelW = doc.widthOfString(`${label}: `);
  doc.moveTo(x + labelW, y + 10).lineTo(x + width, y + 10).strokeColor("#111827").lineWidth(0.7).stroke();
  if (value) {
    doc.font("Helvetica").fontSize(8).text(value, x + labelW + 2, y - 1, { width: width - labelW - 4 });
  }
}
