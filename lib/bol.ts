import PDFDocument from "./pdfkit-document";
import { getDb } from "./db";
import { formatLocationAddress } from "./locations";
import { getLoad, getLocation } from "./queries";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { HASTINGS_OFFICE, companyLogoPath, getCompanySettings, withOfficeAddress } from "./settings";
import type { LoadView } from "./types";
import {
  BOL_PAPERWORK_NAME,
  type BolDraft,
  type BolItemDraft,
  bolFacingLoadNumber,
  bolItemTotals,
  defaultBolDraft,
  filledBolItems,
  formatBolDate,
  formatBolMoney,
  formatBolTotal,
  normalizeBolDraft,
} from "./bol-shared";

export type { BolDraft, BolItemDraft } from "./bol-shared";
export {
  BOL_PAPERWORK_NAME,
  bolFacingLoadNumber,
  bolItemTotals,
  filledBolItems,
  formatBolDate,
  normalizeBolDraft,
} from "./bol-shared";

export type BolParty = {
  name: string;
  address: string;
  phone: string;
};

export type BolModel = BolDraft & {
  carrierName: string;
  carrierAddress: string;
  carrierPhone: string;
};

function formatItsAddress(location: { street: string; city: string; state: string; zip: string }): string {
  const cityState = [location.city.trim(), location.state.trim()].filter(Boolean).join(", ");
  return [location.street.trim(), cityState, location.zip.trim()].filter(Boolean).join(", ");
}

function partyFromLocation(
  locationId: number | null,
  fallbackName: string,
): BolParty {
  const location = locationId ? getLocation(locationId) : null;
  if (!location) {
    return { name: fallbackName, address: fallbackName, phone: "" };
  }
  return {
    name: location.name,
    address: formatItsAddress(location) || formatLocationAddress(location),
    phone: location.phone ?? "",
  };
}

function defaultItemFromLoad(load: LoadView): BolItemDraft {
  const hasPallets = load.pallet_count != null;
  const hasCases = load.case_count != null;
  return {
    pieces: hasPallets ? String(load.pallet_count) : hasCases ? String(load.case_count) : "",
    description: load.commodity.trim(),
    weightLbs: load.weight != null ? String(load.weight) : "",
    type: hasPallets ? "pallets" : hasCases ? "cases" : "",
    nmfc: "",
    hm: load.hazmat ? "Yes" : "No",
    classCode: load.commodity_class.trim(),
  };
}

export function buildBolDraftFromLoad(load: LoadView): BolDraft {
  const shipper = partyFromLocation(load.shipper_location_id, load.origin);
  const consignee = partyFromLocation(load.consignee_location_id, load.destination);
  const reefer = resolveReeferSpec({
    reefer_setpoint_f: load.reefer_setpoint_f,
    temperature_f: load.temperature_f,
    reefer_mode: load.reefer_mode,
    special_instructions: load.special_instructions,
    equipment: load.equipment,
    truck_type: load.truck_type,
    trailer_type: load.trailer_type,
  });
  const item = defaultItemFromLoad(load);
  const hasItem = Boolean(item.pieces || item.description || item.weightLbs || item.type || item.classCode || item.hm === "Yes");
  return {
    ...defaultBolDraft(),
    bolNumber: load.load_number,
    loadNumber: bolFacingLoadNumber(load),
    driverName: load.driver_name ?? "",
    originName: shipper.name,
    originAddress: shipper.address,
    originPhone: shipper.phone,
    destName: consignee.name,
    destAddress: consignee.address,
    destPhone: consignee.phone,
    poNumber: load.po_number.trim(),
    trailerNumber: (load.trailer_unit || load.trailer_number || "").trim(),
    shipDate: formatBolDate(load.pickup_start),
    deliveryDate: formatBolDate(load.delivery_start),
    reeferSetpoint: reefer.setpointF != null ? String(reefer.setpointF) : "",
    reeferMode: reefer.isReefer ? labelForReeferMode(reefer.mode) || "Continuous" : "Continuous",
    seals: load.seal_numbers.trim(),
    declaredValue: load.declared_value != null ? load.declared_value.toFixed(2) : "0.00",
    items: hasItem ? [item] : [defaultBolDraft().items[0]],
  };
}

export function readSavedBolDraft(load: Pick<LoadView, "bol_json">): BolDraft | null {
  const raw = String(load.bol_json ?? "").trim();
  if (!raw) return null;
  try {
    return normalizeBolDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function bolPrefillForLoad(load: LoadView): BolDraft {
  return readSavedBolDraft(load) ?? buildBolDraftFromLoad(load);
}

export function saveLoadBolDraft(loadId: number, draft: BolDraft): void {
  getDb()
    .prepare("UPDATE loads SET bol_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(draft), new Date().toISOString(), loadId);
}

function carrierBlock(): { name: string; address: string; phone: string } {
  const settings = withOfficeAddress({
    ...getCompanySettings(),
    street: getCompanySettings().street || HASTINGS_OFFICE.street,
    city: getCompanySettings().city || HASTINGS_OFFICE.city,
    state: getCompanySettings().state || HASTINGS_OFFICE.state,
    zip: getCompanySettings().zip || HASTINGS_OFFICE.zip,
  });
  const office = withOfficeAddress({
    street: settings.street,
    city: settings.city,
    state: settings.state,
    zip: settings.zip,
  });
  return {
    name: BOL_PAPERWORK_NAME,
    address: formatItsAddress(office),
    phone: settings.dispatcher_phone.trim() || "402-302-0097",
  };
}

export function buildBolModel(load: LoadView, draft?: BolDraft | null): BolModel {
  const resolved = draft ?? bolPrefillForLoad(load);
  const carrier = carrierBlock();
  return {
    ...resolved,
    carrierName: carrier.name,
    carrierAddress: carrier.address,
    carrierPhone: carrier.phone,
  };
}

export async function generateBolPdf(
  loadId: number,
  draft?: BolDraft | null,
): Promise<{ buffer: Buffer; filename: string; model: BolModel }> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const resolved = draft ?? bolPrefillForLoad(load);
  if (draft) saveLoadBolDraft(loadId, resolved);
  else if (!readSavedBolDraft(load)) saveLoadBolDraft(loadId, resolved);
  const model = buildBolModel(load, resolved);
  const buffer = await renderBolPdf(model);
  return { buffer, filename: `${load.load_number}-BOL.pdf`, model };
}

export async function renderBolPdf(model: BolModel): Promise<Buffer> {
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 28, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawItsBol(doc, model);
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

const INK = "#111111";
const RULE = "#222222";
const HEADER_FILL = "#d8d8d8";
const PAGE_W = 612;
const LEFT = 28;
const WIDTH = 556;

function drawItsBol(doc: PDFKit.PDFDocument, model: BolModel): void {
  drawMsExpressLogo(doc, LEFT, 30);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK);
  doc.text("Bill Of Lading", 0, 34, { width: PAGE_W, align: "center", lineBreak: false });

  const meta = [
    ["Load Number", model.loadNumber],
    ["BOL Number", model.bolNumber],
    ["Ship Date", model.shipDate],
    ["Delivery Date", model.deliveryDate],
    ["P.O. Number", model.poNumber],
    ["Trailer", model.trailerNumber],
    ["Freight Charges", model.freightCharges],
    ["Reefer", formatReeferLine(model.reeferSetpoint, model.reeferMode)],
  ];
  const metaX = 352;
  const metaW = 232;
  const rowH = 14;
  let metaY = 28;
  for (const [label, value] of meta) {
    drawMetaRow(doc, metaX, metaY, metaW, rowH, label, value);
    metaY += rowH;
  }

  let y = Math.max(148, metaY + 8);
  y = drawPartyGrid(doc, LEFT, y, WIDTH, model);

  y = drawItemsTable(doc, LEFT, y + 6, WIDTH, model.items);
  y = drawTotalsRow(doc, LEFT, y, WIDTH, model);
  y = drawNotesAndMoney(doc, LEFT, y + 4, WIDTH, model);
  drawSignatures(doc, LEFT, y + 4, WIDTH);
  doc.font("Helvetica").fontSize(8).fillColor(INK);
  doc.text("Page 1 of 1", LEFT, 748, { width: WIDTH, align: "right", lineBreak: false });
}

function formatReeferLine(setpoint: string, mode: string): string {
  const temp = setpoint.trim();
  const labeled = temp ? (temp.includes("F") ? temp : formatReeferSetpoint(Number.parseFloat(temp)) || `${temp}°F`) : "";
  return [labeled, mode.trim()].filter(Boolean).join(" ");
}

function drawMsExpressLogo(doc: PDFKit.PDFDocument, x: number, y: number): void {
  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, x, y - 2, { fit: [92, 42] });
      return;
    } catch {
      // Fall through to the drawn mark.
    }
  }
  doc.font("Helvetica-Bold").fontSize(18);
  doc.fillColor("#1e4d8c").text("MS", x, y, { lineBreak: false, continued: true });
  doc.fillColor("#0b1b33").text(" E", { lineBreak: false, continued: true });
  doc.fillColor("#c8102e").text("X", { lineBreak: false, continued: true });
  doc.fillColor("#0b1b33").text("PRESS", { lineBreak: false });
}

function drawMetaRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
): void {
  const labelW = 108;
  doc.save();
  doc.rect(x, y, labelW, height).fill(HEADER_FILL);
  doc.restore();
  doc.rect(x, y, labelW, height).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.rect(x + labelW, y, width - labelW, height).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
  doc.text(label, x + 3, y + 3, { width: labelW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(value || " ", x + labelW + 4, y + 3, { width: width - labelW - 8, lineBreak: false });
}

function drawHeaderBar(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, title: string): void {
  doc.save();
  doc.rect(x, y, width, height).fill(HEADER_FILL);
  doc.restore();
  doc.rect(x, y, width, height).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
  doc.text(title, x + 4, y + 3, { width: width - 8, lineBreak: false });
}

function drawPartyBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  name: string,
  address: string,
  phone: string,
  extra = "",
): void {
  const head = 14;
  drawHeaderBar(doc, x, y, width, head, title);
  doc.rect(x, y + head, width, height - head).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  doc.text(name || " ", x + 5, y + head + 5, { width: width - 10, height: 12, lineBreak: false });
  doc.font("Helvetica").fontSize(8);
  doc.text(address || " ", x + 5, y + head + 18, { width: width - 10, height: extra ? 18 : 24, lineBreak: true });
  const lines = [phone.trim() ? `Tel: ${phone.trim()}` : "", extra].filter(Boolean);
  if (lines.length) {
    doc.text(lines.join("   "), x + 5, y + height - 14, { width: width - 10, lineBreak: false });
  }
}

function drawPartyGrid(doc: PDFKit.PDFDocument, x: number, y: number, width: number, model: BolModel): number {
  const gap = 0;
  const col = width / 2;
  const height = 78;
  drawPartyBox(doc, x, y, col, height, "Shipper", model.originName, model.originAddress, model.originPhone);
  drawPartyBox(doc, x + col + gap, y, col, height, "Consignee", model.destName, model.destAddress, model.destPhone);
  drawPartyBox(
    doc,
    x,
    y + height,
    col,
    height,
    "3rd Party Billing",
    model.thirdParty,
    "",
    "",
  );
  drawPartyBox(
    doc,
    x + col + gap,
    y + height,
    col,
    height,
    "Transportation Company",
    model.carrierName,
    model.carrierAddress,
    model.carrierPhone,
    model.driverName ? `Driver: ${model.driverName}` : "",
  );
  return y + height * 2;
}

function drawItemsTable(doc: PDFKit.PDFDocument, x: number, y: number, width: number, items: BolItemDraft[]): number {
  const cols = [
    { key: "pieces", label: "# of pieces", w: 54 },
    { key: "description", label: "Description of the goods, marks, exceptions", w: 196 },
    { key: "weightLbs", label: "Weight in LBS.", w: 72 },
    { key: "type", label: "Type", w: 62 },
    { key: "nmfc", label: "NMFC", w: 52 },
    { key: "hm", label: "HM", w: 40 },
    { key: "classCode", label: "Class", w: 80 },
  ] as const;
  const headerH = 26;
  const rowH = 18;
  const filled = filledBolItems(items);
  const minRows = 6;
  const rows = Math.max(minRows, filled.length);
  let cursor = x;
  doc.save();
  doc.rect(x, y, width, headerH).fill(HEADER_FILL);
  doc.restore();
  for (const col of cols) {
    doc.rect(cursor, y, col.w, headerH).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(col.label, cursor + 2, y + 4, { width: col.w - 4, height: headerH - 6, align: "center" });
    cursor += col.w;
  }
  for (let i = 0; i < rows; i += 1) {
    const item = filled[i];
    const top = y + headerH + i * rowH;
    cursor = x;
    const values = item
      ? [
          item.pieces,
          item.description,
          item.weightLbs,
          item.type,
          item.nmfc,
          item.hm === "Yes" ? "Yes" : "",
          item.classCode,
        ]
      : ["", "", "", "", "", "", ""];
    for (const [index, col] of cols.entries()) {
      doc.rect(cursor, top, col.w, rowH).strokeColor(RULE).lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(INK);
      doc.text(values[index] || " ", cursor + 3, top + 4, {
        width: col.w - 6,
        height: rowH - 6,
        lineBreak: false,
        align: index === 1 ? "left" : "center",
      });
      cursor += col.w;
    }
  }
  return y + headerH + rows * rowH;
}

function drawTotalsRow(doc: PDFKit.PDFDocument, x: number, y: number, width: number, model: BolModel): number {
  const totals = bolItemTotals(model.items);
  const cells = [
    { label: "Total Pieces", value: formatBolTotal(totals.pieces) || (totals.pieces ? String(totals.pieces) : ""), w: 120 },
    { label: "Total Weight", value: totals.weightLbs ? `${formatBolTotal(totals.weightLbs)} LBS.` : "", w: 140 },
    { label: "Seals", value: model.seals, w: 148 },
    { label: "Emergency Response Phone", value: model.emergencyPhone, w: 148 },
  ];
  const height = 28;
  let cursor = x;
  for (const cell of cells) {
    doc.save();
    doc.rect(cursor, y, cell.w, 12).fill(HEADER_FILL);
    doc.restore();
    doc.rect(cursor, y, cell.w, height).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(cell.label, cursor + 3, y + 2, { width: cell.w - 6, lineBreak: false });
    doc.font("Helvetica").fontSize(8);
    doc.text(cell.value || " ", cursor + 3, y + 14, { width: cell.w - 6, lineBreak: false });
    cursor += cell.w;
  }
  return y + height;
}

function drawNotesAndMoney(doc: PDFKit.PDFDocument, x: number, y: number, width: number, model: BolModel): number {
  const leftW = width * 0.52;
  const rightW = width - leftW;
  const height = 88;
  drawHeaderBar(doc, x, y, leftW, 14, "Notes:");
  doc.rect(x, y + 14, leftW, height - 14).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(INK);
  doc.text(model.notes || " ", x + 5, y + 18, { width: leftW - 10, height: height - 24, lineBreak: true });

  const money = [
    ["C.O.D. Amount", formatBolMoney(model.codAmount)],
    ["C.O.D. Fee", model.codFee],
    ["Declared Value", formatBolMoney(model.declaredValue)],
  ];
  const rowH = 18;
  let my = y;
  for (const [label, value] of money) {
    drawMetaRow(doc, x + leftW, my, rightW, rowH, label, value);
    my += rowH;
  }
  doc.save();
  doc.rect(x + leftW, my, rightW, height - money.length * rowH).fill("#f3f3f3");
  doc.restore();
  doc.rect(x + leftW, my, rightW, height - money.length * rowH).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(7).fillColor(INK);
  doc.text("If at consignor's risk, write or stamp here.", x + leftW + 4, my + 8, {
    width: rightW - 8,
    lineBreak: true,
  });
  return y + height;
}

function drawSignatures(doc: PDFKit.PDFDocument, x: number, y: number, width: number): void {
  const cols = width / 4;
  const rowH = 42;
  const top = [
    { title: "Shipper", extra: "Per" },
    { title: "Carrier", extra: "Per" },
    { title: "Date", extra: "Time" },
    { title: "Number Of Pieces Received", extra: "" },
  ];
  const bottom = [
    { title: "Consignee Name", extra: "" },
    { title: "Date", extra: "" },
    { title: "Signature", extra: "" },
    { title: "Number Of Pieces Received", extra: "" },
  ];
  for (const [index, cell] of top.entries()) {
    const left = x + index * cols;
    doc.rect(left, y, cols, rowH).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(cell.title, left + 4, y + 4, { width: cols - 8, lineBreak: false });
    if (cell.extra) {
      doc.font("Helvetica").fontSize(7);
      doc.text(`${cell.extra}:`, left + 4, y + 24, { width: cols - 8, lineBreak: false });
    }
  }
  for (const [index, cell] of bottom.entries()) {
    const left = x + index * cols;
    doc.rect(left, y + rowH, cols, rowH).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK);
    doc.text(cell.title, left + 4, y + rowH + 4, { width: cols - 8, lineBreak: false });
  }
}
