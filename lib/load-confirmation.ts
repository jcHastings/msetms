import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { computeOwnerOperatorPay } from "./settlement";
import { formatLocationAddress, formatSchedulingSummary } from "./locations";
import { getLoad, getLocation, getTrailer } from "./queries";
import { listStops, type LoadStop } from "./stops";
import { formatInternalRelayLines, formatRelayLane } from "./relays";
import { listRelays, relayForDriver } from "./relay-store";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
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
  internalLegs: string;
  reeferSetpoint: string;
  reeferMode: string;
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

function formatStopAddress(stop: LoadStop): string {
  const cityState = [stop.city.trim(), stop.state.trim()].filter(Boolean).join(", ");
  const cityZip = [cityState, stop.zip.trim()].filter(Boolean).join(" ");
  return [stop.street.trim(), cityZip].filter(Boolean).join(", ");
}

function confirmationParty(
  stop: LoadStop | undefined,
  fallbackLocationId: number | null,
  laneFallback = "",
) {
  const location = getLocation(stop?.location_id ?? fallbackLocationId ?? 0);
  if (location) {
    return {
      name: location.name,
      address: formatLocationAddress(location),
      phone: location.phone,
      hours: location.hours,
      extra: location.scheduling_notes,
      appointment: location.scheduling_type === "appointment" ? "Yes" : "No",
      location,
    };
  }
  if (!stop) {
    return { name: "", address: laneFallback.trim(), phone: "", hours: "", extra: "", appointment: "", location: null };
  }
  return {
    name: stop.name.trim(),
    address: formatStopAddress(stop) || laneFallback.trim(),
    phone: stop.phone.trim(),
    hours: "",
    extra: [stop.instructions, stop.notes].map((value) => value.trim()).filter(Boolean).join("\n"),
    appointment: "",
    location: null,
  };
}

export function buildConfirmationModel(load: LoadView, company = getCompanyProfile()): ConfirmationModel {
  const stops = listStops(load.id);
  const pickup = stops.find((stop) => stop.kind === "pickup") ?? stops[0];
  const delivery = [...stops].reverse().find((stop) => stop.kind === "delivery") ?? stops[stops.length - 1];
  const shipper = confirmationParty(pickup, load.shipper_location_id, load.origin);
  const consignee = confirmationParty(delivery, load.consignee_location_id, load.destination);
  const style = load.driver_type === "owner_operator" ? "owner_operator" : "company_driver";
  const notes = [
    load.special_instructions,
    load.appointment_notes,
    shipper.location ? `Pickup: ${formatSchedulingSummary(shipper.location)}` : "",
    consignee.location ? `Delivery: ${formatSchedulingSummary(consignee.location)}` : "",
    load.notes,
  ]
    .filter(Boolean)
    .join("\n");
  const trailer = load.trailer_id ? getTrailer(load.trailer_id) : null;
  const reefer = resolveReeferSpec({
    reefer_setpoint_f: load.reefer_setpoint_f ?? trailer?.reefer_setpoint_f ?? null,
    temperature_f: load.temperature_f,
    reefer_mode: load.reefer_mode,
    special_instructions: load.special_instructions,
    equipment: load.equipment || equipmentLabel(load),
    truck_type: load.truck_type,
    trailer_type: trailer?.type ?? load.trailer_type,
  });
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
      name: shipper.name,
      address: shipper.address,
      phone: shipper.phone,
      date: formatMdY(pickup?.window_start || load.pickup_start),
      time: formatClock(pickup?.window_start || load.pickup_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: pickup?.reference.trim() || load.po_number,
      confirmationNumber: pickup?.confirmation.trim() || load.reference_number,
      extra: shipper.extra,
      hoursLabel: "Shipping Hours",
      hours: shipper.hours,
      appointment: shipper.appointment || appointmentLabel(load.appointment_notes),
      description: load.commodity,
    },
    consignee: {
      title: "Consignee 1",
      name: consignee.name,
      address: consignee.address,
      phone: consignee.phone,
      date: formatMdY(delivery?.window_start || load.delivery_start),
      time: formatClock(delivery?.window_start || load.delivery_start),
      type: "",
      quantity: "",
      weight: load.weight != null ? String(load.weight) : "",
      poNumber: delivery?.reference.trim() || load.po_number,
      confirmationNumber: delivery?.confirmation.trim() || load.reference_number,
      extra: consignee.extra,
      hoursLabel: "Receiving Hours",
      hours: consignee.hours,
      appointment: consignee.appointment || appointmentLabel(load.appointment_notes),
      description: load.commodity,
    },
    dispatchNotes: notes,
    internalLegs: "",
    reeferSetpoint: reefer.setpointF != null ? formatReeferSetpoint(reefer.setpointF) : "",
    reeferMode: reefer.isReefer ? labelForReeferMode(reefer.mode) || "Continuous" : "",
  };
}

export function buildConfirmationForLoad(
  loadId: number,
  options: { packet?: "customer" | "internal"; driverId?: number } = {},
): ConfirmationModel {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const model = buildConfirmationModel(load);
  if (options.packet !== "internal") return model;
  const relays = listRelays(load.id);
  const yours = options.driverId ? relayForDriver(load.id, options.driverId) : null;
  const lines = [
    yours ? `Your leg: ${formatRelayLane(yours.pickup, yours.delivery)}` : "",
    formatInternalRelayLines(relays),
  ].filter(Boolean);
  return { ...model, internalLegs: lines.join("\n") };
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

function confirmationTitle(model: ConfirmationModel, headerText: string): string {
  const custom = headerText.trim();
  const stock = "Rate & Load Confirmation";
  if (custom && custom !== stock) return custom;
  return model.style === "company_driver" ? "Load Confirmation" : stock;
}

function drawConfirmation(doc: PDFKit.PDFDocument, model: ConfirmationModel): void {
  const pageW = 612;
  const left = 36;
  const width = 540;
  const defaults = getDocumentDefaults("load_confirmation");
  const bodySize = defaults.font_size || 10;
  const title = confirmationTitle(model, defaults.header_text);
  const contactRows: Array<[string, string]> = [
    ["Dispatcher", model.company.dispatcher_name],
    ["Phone #", model.company.dispatcher_phone],
    ["Fax #", model.company.dispatcher_fax],
    ["Email", model.company.dispatcher_email],
    ["LOAD #", model.loadNumber],
    ["Ship Date", model.shipDate],
    ["Today's Date", model.todayDate],
  ];

  const logo = companyLogoPath();
  let logoDrawn = false;
  if (logo) {
    try {
      doc.image(logo, left, 28, { fit: [78, 48] });
      logoDrawn = true;
    } catch {
      // Skip a bad logo file rather than failing the confirmation.
    }
  }

  // Title is page-centered on its own line. The dispatcher card starts below that
  // baseline so "Dispatcher" never sits on the title and the title is not shoved left.
  doc.font("Helvetica-Bold").fontSize(13);
  let titleSize = 13;
  while (titleSize > 9 && doc.widthOfString(title) > pageW - 160) {
    titleSize -= 0.5;
    doc.fontSize(titleSize);
  }
  doc.fillColor("#111827").text(title, 0, 38, { width: pageW, align: "center", lineBreak: false });

  doc.font("Helvetica").fontSize(8);
  const emailW = doc.widthOfString(model.company.dispatcher_email || " ");
  const cardW = Math.min(200, Math.max(168, 70 + emailW));
  const cardX = left + width - cardW;
  const cardY = 56;
  const cardH = drawContactCard(doc, cardX, cardY, cardW, contactRows);

  const nameWidth = Math.max(120, cardX - left - 10);
  const nameY = logoDrawn ? 84 : 74;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#12315c");
  doc.text(model.company.company_name || "M&S", left, nameY, { width: nameWidth, lineBreak: false });
  const address = formatCompanyAddress(getCompanySettings());
  if (address) {
    doc.font("Helvetica").fontSize(7).fillColor("#4b5563").text(address, left, nameY + 14, {
      width: nameWidth,
      height: 18,
      lineBreak: true,
    });
  }

  let y = Math.max(148, cardY + cardH + 10);

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

  if (model.reeferSetpoint || model.reeferMode) {
    y = drawReeferBar(doc, left, y + 6, width, model.reeferSetpoint, model.reeferMode);
  }

  y = drawStop(doc, left, y + 10, width, model.shipper);
  y = drawStop(doc, left, y + 8, width, model.consignee);

  y += 8;
  if (y < 620) {
    doc.font("Helvetica-Bold").fontSize(bodySize).fillColor("#111827").text("Dispatch Notes:", left, y, {
      lineBreak: false,
    });
    y += 12;
    doc.font("Helvetica").fontSize(Math.max(8, bodySize - 1)).fillColor("#111827");
    const notesH = model.style === "owner_operator" ? 28 : 40;
    doc.text(model.dispatchNotes || " ", left, y, { width, height: notesH, lineBreak: true });
    y = Math.min(y + notesH + 6, model.style === "owner_operator" ? 650 : 700);
    if (model.internalLegs && y < 700) {
      doc.font("Helvetica-Bold").fontSize(Math.max(8, bodySize - 1)).text("Internal legs (not billed):", left, y, {
        lineBreak: false,
      });
      y += 11;
      doc.font("Helvetica").fontSize(Math.max(7, bodySize - 2)).text(model.internalLegs, left, y, {
        width,
        height: 28,
        lineBreak: true,
      });
      y += 30;
    }
  }

  if (model.style === "owner_operator" && y < 668) {
    doc.font("Helvetica-Bold").fontSize(9).text("Carrier Pay:", left, y, { lineBreak: false });
    y += 12;
    const haul = formatUsd(model.agreedAmount) || "$0.00 USD";
    doc.font("Helvetica").fontSize(9).text(`Line Haul: ${haul.replace(" USD", "")}   TOTAL: ${haul}`, left, y, {
      width,
      lineBreak: false,
    });
    y += 16;
    if (y < 690) {
      doc.font("Helvetica").fontSize(8);
      drawWriteLine(doc, left, y, 170, "Accepted By");
      drawWriteLine(doc, left + 186, y, 120, "Date");
      drawWriteLine(doc, left + 322, y, 218, "Signature");
      y += 20;
      if (y < 712) {
        drawWriteLine(doc, left, y, 150, "Driver Name", model.driverName);
        drawWriteLine(doc, left + 166, y, 120, "Cell #", model.driverPhone);
        drawWriteLine(doc, left + 302, y, 110, "Truck #", model.truckNumber);
        drawWriteLine(doc, left + 428, y, 112, "Trailer #", model.trailerNumber);
      }
    }
  }

  try {
    doc.switchToPage(0);
  } catch {
    // Single-page documents have no extra buffer to switch.
  }
  if (defaults.terms_text) {
    doc.font("Helvetica").fontSize(7).fillColor("#374151");
    doc.text(defaults.terms_text, left, 718, { width, height: 16, lineBreak: true });
  }
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text(defaults.footer_text || "Page 1 of 1", left, 752, { width, align: "center", lineBreak: false });
  doc.rect(left, 28, width, 726).strokeColor("#d1d5db").lineWidth(0.4).stroke();
}

function drawContactCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>,
): number {
  const rowH = 12;
  const height = rows.length * rowH + 6;
  doc.rect(x, y, width, height).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  rows.forEach(([label, value], index) => {
    doc.font("Helvetica").fontSize(7).fillColor("#4b5563");
    doc.text(`${label}:`, x + 4, y + 4 + index * rowH, { width: 52, lineBreak: false });
    doc.font(label === "LOAD #" ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor("#111827");
    doc.text(value || " ", x + 56, y + 4 + index * rowH, {
      width: width - 62,
      height: 10,
      lineBreak: false,
    });
  });
  return height;
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
    doc.text(label, x + index * col + 3, y + 4, { width: col - 6, lineBreak: false });
    doc.font("Helvetica").fontSize(8);
    doc.text(cells[index][1] || " ", x + index * col + 3, y + headerH + 4, {
      width: col - 6,
      height: 16,
      lineBreak: false,
    });
  });
  return y + headerH + valueH;
}

function drawReeferBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  setpoint: string,
  mode: string,
): number {
  const height = 20;
  doc.save();
  doc.rect(x, y, width, height).fill("#dbeafe");
  doc.restore();
  doc.rect(x, y, width, height).strokeColor("#1d4ed8").lineWidth(0.7).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#1e3a8a");
  doc.text("REEFER", x + 6, y + 6, { width: 52, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#111827");
  const parts = [
    setpoint ? `Setpoint ${setpoint}` : "",
    mode ? `Mode: ${mode}` : "",
  ].filter(Boolean);
  if (parts.length) {
    doc.text(parts.join("     "), x + 62, y + 6, { width: width - 70, lineBreak: false });
  }
  return y + height;
}

function drawStop(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  stop: ConfirmationStop,
): number {
  const height = 108;
  doc.rect(x, y, width, height).strokeColor("#9ca3af").lineWidth(0.6).stroke();
  const leftW = 220;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(stop.title, x + 6, y + 6, {
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(9).text(stop.name || " ", x + 6, y + 22, {
    width: leftW - 8,
    height: 12,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8);
  doc.text(stop.address || " ", x + 6, y + 36, { width: leftW - 8, height: 22 });
  if (stop.phone) {
    doc.text(`Phone: ${stop.phone}`, x + 6, y + 62, { width: leftW - 8, lineBreak: false });
  }

  const gridX = x + leftW;
  const colW = (width - leftW) / 2;
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
    const wide = /hours/i.test(label);
    kv(doc, gridX + col * colW, y + 8 + row * 14, wide ? 74 : 70, wide ? colW + 8 : colW - 4, label, value);
  });
  if (stop.extra) {
    doc.font("Helvetica").fontSize(7).text(stop.extra, x + 6, y + height - 12, {
      width: width - 12,
      height: 10,
      lineBreak: false,
    });
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
  doc.font("Helvetica").fontSize(7).fillColor("#4b5563").text(`${label}:`, x, y, {
    width: labelW,
    height: 10,
    lineBreak: false,
  });
  doc.font(emphasize ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor("#111827");
  doc.text(value || " ", x + labelW, y, {
    width: Math.max(36, width - labelW),
    height: 10,
    lineBreak: false,
  });
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
