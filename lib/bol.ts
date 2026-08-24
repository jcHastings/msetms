import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { formatLocationAddress } from "./locations";
import { equipmentLabel, formatMdY } from "./load-confirmation";
import { getLoad, getLocation } from "./queries";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults } from "./settings";
import type { LoadView } from "./types";

export type BolParty = {
  name: string;
  address: string;
  phone: string;
};

export type BolModel = {
  title: string;
  footer: string;
  terms: string;
  fontSize: number;
  companyName: string;
  companyAddress: string;
  loadNumber: string;
  date: string;
  shipper: BolParty;
  consignee: BolParty;
  commodity: string;
  pieces: string;
  weight: string;
  equipment: string;
  truck: string;
  trailer: string;
  driver: string;
  reeferSetpoint: string;
  reeferMode: string;
  specialInstructions: string;
  poNumber: string;
  referenceNumber: string;
};

export function buildBolModel(load: LoadView): BolModel {
  const defaults = getDocumentDefaults("bol");
  const company = getCompanyProfile();
  const shipperLoc = load.shipper_location_id ? getLocation(load.shipper_location_id) : null;
  const consigneeLoc = load.consignee_location_id ? getLocation(load.consignee_location_id) : null;
  const reefer = resolveReeferSpec({
    reefer_setpoint_f: load.reefer_setpoint_f,
    reefer_mode: load.reefer_mode,
    special_instructions: load.special_instructions,
    equipment: load.equipment || equipmentLabel(load),
    truck_type: load.truck_type,
    trailer_type: load.trailer_type,
  });
  const pieces = [
    load.pallet_count != null ? `${load.pallet_count} pallets` : "",
    load.case_count != null ? `${load.case_count} cases` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    title: defaults.header_text.trim() || "Bill of Lading",
    footer: defaults.footer_text.trim(),
    terms: defaults.terms_text.trim(),
    fontSize: defaults.font_size || 10,
    companyName: company.company_name,
    companyAddress: formatCompanyAddress(getCompanySettings()),
    loadNumber: load.load_number,
    date: formatMdY(load.pickup_start) || formatMdY(new Date().toISOString()),
    shipper: {
      name: shipperLoc?.name || load.origin,
      address: shipperLoc ? formatLocationAddress(shipperLoc) : load.origin,
      phone: shipperLoc?.phone ?? "",
    },
    consignee: {
      name: consigneeLoc?.name || load.destination,
      address: consigneeLoc ? formatLocationAddress(consigneeLoc) : load.destination,
      phone: consigneeLoc?.phone ?? "",
    },
    commodity: load.commodity,
    pieces,
    weight: load.weight != null ? String(load.weight) : "",
    equipment: equipmentLabel(load) || load.equipment || "",
    truck: load.truck_unit ?? "",
    trailer: load.trailer_unit || load.trailer_number || "",
    driver: load.driver_name ?? "",
    reeferSetpoint: reefer.setpointF != null ? formatReeferSetpoint(reefer.setpointF) : "",
    reeferMode: reefer.isReefer ? labelForReeferMode(reefer.mode) || "Continuous" : "",
    specialInstructions: load.special_instructions,
    poNumber: load.po_number,
    referenceNumber: load.reference_number,
  };
}

export async function generateBolPdf(loadId: number): Promise<{ buffer: Buffer; filename: string; model: BolModel }> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const model = buildBolModel(load);
  const buffer = await renderBolPdf(model);
  return { buffer, filename: `${load.load_number}-BOL.pdf`, model };
}

export async function renderBolPdf(model: BolModel): Promise<Buffer> {
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawBol(doc, model);
    doc.end();
  });
  return keepFirstPage(raw);
}

async function keepFirstPage(buffer: Buffer): Promise<Buffer> {
  const { PDFDocument: PdfLib } = await import("pdf-lib");
  const pdf = await PdfLib.load(buffer);
  while (pdf.getPageCount() > 1) {
    pdf.removePage(pdf.getPageCount() - 1);
  }
  return Buffer.from(await pdf.save());
}

function drawBol(doc: PDFKit.PDFDocument, model: BolModel): void {
  const left = 36;
  const width = 540;
  const pageW = 612;
  const logo = companyLogoPath();
  let logoDrawn = false;
  if (logo) {
    try {
      doc.image(logo, left, 28, { fit: [78, 48] });
      logoDrawn = true;
    } catch {
      // Skip a bad logo rather than failing the BOL.
    }
  }

  doc.font("Helvetica-Bold").fontSize(13);
  let titleSize = 13;
  while (titleSize > 9 && doc.widthOfString(model.title) > pageW - 200) {
    titleSize -= 0.5;
    doc.fontSize(titleSize);
  }
  doc.fillColor("#111827").text(model.title, 0, 36, { width: pageW, align: "center", lineBreak: false });

  const nameY = logoDrawn ? 84 : 62;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#12315c");
  doc.text(model.companyName || "MS Express", left, nameY, { width: 280, lineBreak: false });
  if (model.companyAddress) {
    doc.font("Helvetica").fontSize(7).fillColor("#4b5563").text(model.companyAddress, left, nameY + 14, {
      width: 280,
      height: 18,
      lineBreak: true,
    });
  }

  doc.font("Helvetica").fontSize(8).fillColor("#4b5563");
  doc.text("LOAD #", left + 360, 56, { width: 60, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
  doc.text(model.loadNumber, left + 420, 54, { width: 120, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#4b5563");
  doc.text("Date", left + 360, 74, { width: 60, lineBreak: false });
  doc.font("Helvetica").fontSize(10).fillColor("#111827");
  doc.text(model.date, left + 420, 72, { width: 120, lineBreak: false });

  let y = Math.max(112, nameY + 36);
  y = drawPartyPair(doc, left, y, width, model.shipper, model.consignee);

  y = drawFacts(doc, left, y + 8, width, [
    ["Commodity", model.commodity],
    ["Pieces", model.pieces],
    ["Weight", model.weight],
    ["Equipment", model.equipment],
    ["Truck #", model.truck],
    ["Trailer #", model.trailer],
    ["Driver", model.driver],
  ]);

  if (model.reeferSetpoint || model.reeferMode) {
    y = drawReefer(doc, left, y + 6, width, model.reeferSetpoint, model.reeferMode);
  }

  y = drawLabeledBox(doc, left, y + 8, width, "Special instructions", model.specialInstructions, 48);
  y = drawFacts(doc, left, y + 6, width, [
    ["PO #", model.poNumber],
    ["Ref / rate con #", model.referenceNumber],
  ]);

  y += 10;
  doc.font("Helvetica").fontSize(8);
  drawWriteLine(doc, left, y, 170, "Shipper signature");
  drawWriteLine(doc, left + 186, y, 170, "Driver signature");
  drawWriteLine(doc, left + 372, y, 168, "Date");

  if (model.terms) {
    doc.font("Helvetica").fontSize(7).fillColor("#374151");
    doc.text(model.terms, left, 718, { width, height: 16, lineBreak: true });
  }
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text(model.footer || "Page 1 of 1", left, 752, { width, align: "center", lineBreak: false });
  doc.rect(left, 28, width, 726).strokeColor("#d1d5db").lineWidth(0.4).stroke();
}

function drawPartyPair(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  shipper: BolParty,
  consignee: BolParty,
): number {
  const col = width / 2;
  const height = 78;
  for (const [index, party, title] of [
    [0, shipper, "Shipper"] as const,
    [1, consignee, "Consignee"] as const,
  ]) {
    const left = x + index * col;
    doc.rect(left, y, col, height).strokeColor("#9ca3af").lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827").text(title, left + 6, y + 5, {
      width: col - 12,
      lineBreak: false,
    });
    doc.font("Helvetica-Bold").fontSize(10).text(party.name || " ", left + 6, y + 18, {
      width: col - 12,
      height: 14,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(8).fillColor("#111827").text(party.address || " ", left + 6, y + 34, {
      width: col - 12,
      height: 26,
      lineBreak: true,
    });
    doc.font("Helvetica").fontSize(8).text(party.phone ? `Phone ${party.phone}` : " ", left + 6, y + 62, {
      width: col - 12,
      lineBreak: false,
    });
  }
  return y + height;
}

function drawFacts(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  cells: Array<[string, string]>,
): number {
  const col = width / cells.length;
  const headerH = 14;
  const valueH = 20;
  doc.save();
  doc.rect(x, y, width, headerH).fill("#e5e7eb");
  doc.restore();
  cells.forEach(([label, value], index) => {
    doc.rect(x + index * col, y, col, headerH + valueH).strokeColor("#9ca3af").lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827");
    doc.text(label, x + index * col + 3, y + 3, { width: col - 6, lineBreak: false });
    doc.font("Helvetica").fontSize(8);
    doc.text(value || " ", x + index * col + 3, y + headerH + 3, {
      width: col - 6,
      height: 16,
      lineBreak: false,
    });
  });
  return y + headerH + valueH;
}

function drawReefer(
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

function drawLabeledBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height: number,
): number {
  doc.rect(x, y, width, height).strokeColor("#9ca3af").lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827").text(label, x + 6, y + 4, {
    width: width - 12,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8).text(value || " ", x + 6, y + 16, {
    width: width - 12,
    height: height - 20,
    lineBreak: true,
  });
  return y + height;
}

function drawWriteLine(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string): void {
  doc.moveTo(x, y + 16).lineTo(x + width, y + 16).strokeColor("#9ca3af").lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(7).fillColor("#6b7280").text(label, x, y + 18, { width, lineBreak: false });
}
