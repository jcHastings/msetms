import PDFDocument from "pdfkit";
import { getCompanyProfile } from "./company";
import { computeOwnerOperatorPay } from "./settlement";
import { getCustomer, getLoad, getTrailer } from "./queries";
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
  if (load.status === "delivered") return "Delivered";
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
  const style = load.driver_type === "owner_operator" ? "owner_operator" : "company_driver";
  const notes = [load.special_instructions, load.appointment_notes, load.notes].filter(Boolean).join("\n");
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
      name: load.customer_name,
      address: load.origin,
      phone: contact?.phone ?? "",
      date: formatMdY(load.pickup_start),
      time: formatClock(load.pickup_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: load.po_number,
      confirmationNumber: load.reference_number,
      extra: "",
      hoursLabel: "Shipping Hours",
      hours: "",
      appointment: appointmentLabel(load.appointment_notes),
      description: load.commodity,
    },
    consignee: {
      title: "Consignee 1",
      name: load.destination,
      address: load.destination,
      phone: "",
      date: formatMdY(load.delivery_start),
      time: formatClock(load.delivery_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: load.po_number,
      confirmationNumber: load.reference_number,
      extra: "",
      hoursLabel: "Receiving Hours",
      hours: "",
      appointment: appointmentLabel(load.appointment_notes),
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

export function renderConfirmationPdf(model: ConfirmationModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawConfirmation(doc, model);
    doc.end();
  });
}

function drawConfirmation(doc: PDFKit.PDFDocument, model: ConfirmationModel): void {
  const left = 36;
  const width = 540;
  const right = left + width;
  let y = 36;

  const [brand, ...rest] = model.company.company_name.split(" ");
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#12315c").text(brand || "M&S", left, y, { continued: Boolean(rest.length) });
  if (rest.length) {
    doc.font("Helvetica-Bold").fillColor("#6b7c90").text(` ${rest.join(" ")}`);
  }
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14);
  doc.text("Rate & Load Confirmation", left, y + 2, { width, align: "center" });

  const boxX = 332;
  const boxW = 244;
  drawInfoGrid(doc, boxX, y, boxW, [
    ["Dispatcher", model.company.dispatcher_name],
    ["Phone #", model.company.dispatcher_phone],
    ["Fax #", model.company.dispatcher_fax],
    ["Email", model.company.dispatcher_email],
    ["W/O", ""],
  ], [
    ["LOAD #", model.loadNumber],
    ["Ship Date", model.shipDate],
    ["Today's Date", model.todayDate],
  ]);
  y = 132;

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

  y += 12;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Dispatch Notes:", left, y);
  y += 14;
  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  doc.text(model.dispatchNotes || " ", left, y, { width, height: 48 });
  y = Math.max(y + 56, doc.y + 8);

  if (model.style === "owner_operator") {
    doc.font("Helvetica-Bold").fontSize(10).text("Carrier Pay:", left, y);
    y += 14;
    const haul = formatUsd(model.agreedAmount) || "$0.00 USD";
    doc.font("Helvetica").fontSize(10).text(`Line Haul: ${haul.replace(" USD", "")}, `, left, y, { continued: true });
    doc.font("Helvetica-Bold").text(`TOTAL: ${haul}`);
    y += 28;
    doc.font("Helvetica").fontSize(9);
    drawWriteLine(doc, left, y, 170, "Accepted By");
    drawWriteLine(doc, left + 186, y, 120, "Date");
    drawWriteLine(doc, left + 322, y, 218, "Signature");
    y += 28;
    drawWriteLine(doc, left, y, 150, "Driver Name", model.driverName);
    drawWriteLine(doc, left + 166, y, 120, "Cell #", model.driverPhone);
    drawWriteLine(doc, left + 302, y, 110, "Truck #", model.truckNumber);
    drawWriteLine(doc, left + 428, y, 112, "Trailer #", model.trailerNumber);
  }

  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text("Page 1 of 1", left, 760, { width, align: "center" });
  doc.rect(left, 28, width, 720).strokeColor("#d1d5db").lineWidth(0.4).stroke();
  void right;
}

function drawInfoGrid(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  leftRows: Array<[string, string]>,
  rightRows: Array<[string, string]>,
): void {
  const col = width / 2;
  const rowH = 14;
  const rows = Math.max(leftRows.length, rightRows.length);
  doc.rect(x, y, width, rows * rowH + 4).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  leftRows.forEach(([label, value], index) => {
    kv(doc, x + 4, y + 3 + index * rowH, 52, col - 8, label, value);
  });
  rightRows.forEach(([label, value], index) => {
    kv(doc, x + col + 4, y + 3 + index * rowH, 68, col - 8, label, value, true);
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
  const height = 118;
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
