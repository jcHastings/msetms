export const BOL_FREIGHT_CHARGES = ["Prepaid", "Collect", "3rd Party"] as const;
export type BolFreightCharges = (typeof BOL_FREIGHT_CHARGES)[number];

export const BOL_COD_FEES = ["Prepaid", "Collect"] as const;
export type BolCodFee = (typeof BOL_COD_FEES)[number];

export const BOL_HM_OPTIONS = ["No", "Yes"] as const;
export type BolHm = (typeof BOL_HM_OPTIONS)[number];

export const BOL_REEFER_MODES = ["Continuous", "Start/Stop"] as const;

export const BOL_PAPERWORK_NAME = "M & S Loads LLC - MS Express";
export const BOL_THIRD_PARTY_OPTIONS = ["", BOL_PAPERWORK_NAME] as const;

export type BolItemDraft = {
  pieces: string;
  description: string;
  weightLbs: string;
  type: string;
  nmfc: string;
  hm: BolHm;
  classCode: string;
};

export type BolDraft = {
  bolNumber: string;
  loadNumber: string;
  thirdParty: string;
  driverName: string;
  freightCharges: BolFreightCharges;
  originName: string;
  originAddress: string;
  originPhone: string;
  destName: string;
  destAddress: string;
  destPhone: string;
  emergencyPhone: string;
  codAmount: string;
  codFee: BolCodFee;
  declaredValue: string;
  notes: string;
  poNumber: string;
  trailerNumber: string;
  shipDate: string;
  deliveryDate: string;
  reeferSetpoint: string;
  reeferMode: string;
  seals: string;
  items: BolItemDraft[];
};

export function emptyBolItem(): BolItemDraft {
  return {
    pieces: "",
    description: "",
    weightLbs: "",
    type: "",
    nmfc: "",
    hm: "No",
    classCode: "",
  };
}

export function defaultBolDraft(): BolDraft {
  return {
    bolNumber: "",
    loadNumber: "",
    thirdParty: "",
    driverName: "",
    freightCharges: "Prepaid",
    originName: "",
    originAddress: "",
    originPhone: "",
    destName: "",
    destAddress: "",
    destPhone: "",
    emergencyPhone: "",
    codAmount: "0.00",
    codFee: "Prepaid",
    declaredValue: "0.00",
    notes: "",
    poNumber: "",
    trailerNumber: "",
    shipDate: "",
    deliveryDate: "",
    reeferSetpoint: "",
    reeferMode: "Continuous",
    seals: "",
    items: [emptyBolItem()],
  };
}

export function formatBolDate(iso: string): string {
  const match = String(iso ?? "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function bolFacingLoadNumber(load: {
  load_number?: string | null;
  customer_reference?: string | null;
  reference_number?: string | null;
}): string {
  const internal = String(load.load_number ?? "").trim();
  for (const value of [load.customer_reference, load.reference_number]) {
    const text = String(value ?? "").trim();
    if (text && text !== internal) return text;
  }
  return "";
}

export function normalizeBolItem(value: unknown): BolItemDraft {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const hm = String(row.hm ?? "No") === "Yes" ? "Yes" : "No";
  return {
    pieces: String(row.pieces ?? "").trim(),
    description: String(row.description ?? "").trim(),
    weightLbs: String(row.weightLbs ?? "").trim(),
    type: String(row.type ?? "").trim(),
    nmfc: String(row.nmfc ?? "").trim(),
    hm,
    classCode: String(row.classCode ?? "").trim(),
  };
}

export function normalizeBolDraft(value: unknown): BolDraft {
  const base = defaultBolDraft();
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const freight = String(row.freightCharges ?? base.freightCharges);
  const codFee = String(row.codFee ?? base.codFee);
  const items = Array.isArray(row.items) && row.items.length > 0 ? row.items.map(normalizeBolItem) : [emptyBolItem()];
  const reeferMode = String(row.reeferMode ?? base.reeferMode).trim();
  return {
    ...base,
    bolNumber: String(row.bolNumber ?? "").trim(),
    loadNumber: String(row.loadNumber ?? "").trim(),
    thirdParty: String(row.thirdParty ?? "").trim(),
    driverName: String(row.driverName ?? "").trim(),
    freightCharges: BOL_FREIGHT_CHARGES.includes(freight as BolFreightCharges)
      ? (freight as BolFreightCharges)
      : "Prepaid",
    originName: String(row.originName ?? "").trim(),
    originAddress: String(row.originAddress ?? "").trim(),
    originPhone: String(row.originPhone ?? "").trim(),
    destName: String(row.destName ?? "").trim(),
    destAddress: String(row.destAddress ?? "").trim(),
    destPhone: String(row.destPhone ?? "").trim(),
    emergencyPhone: String(row.emergencyPhone ?? "").trim(),
    codAmount: String(row.codAmount ?? "0.00").trim() || "0.00",
    codFee: BOL_COD_FEES.includes(codFee as BolCodFee) ? (codFee as BolCodFee) : "Prepaid",
    declaredValue: String(row.declaredValue ?? "0.00").trim() || "0.00",
    notes: String(row.notes ?? "").trim(),
    poNumber: String(row.poNumber ?? "").trim(),
    trailerNumber: String(row.trailerNumber ?? "").trim(),
    shipDate: String(row.shipDate ?? "").trim(),
    deliveryDate: String(row.deliveryDate ?? "").trim(),
    reeferSetpoint: String(row.reeferSetpoint ?? "").trim(),
    reeferMode: reeferMode === "Start/Stop" || reeferMode === "start_stop" ? "Start/Stop" : "Continuous",
    seals: joinBolSeals(Array.isArray(row.seals) ? row.seals : splitBolSeals(String(row.seals ?? ""))),
    items,
  };
}

export function splitBolSeals(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const parts = raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [""];
}

export function joinBolSeals(values: Array<string | null | undefined>): string {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function collectBolSealsFromForm(formData: FormData): string {
  const listed = formData
    .getAll("bol_seal")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (listed.length > 0) return joinBolSeals(listed);
  return joinBolSeals(splitBolSeals(String(formData.get("bol_seals") ?? "")));
}

export function parseBolItemsJson(raw: string): BolItemDraft[] {
  if (!raw.trim()) return [emptyBolItem()];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const items = Array.isArray(parsed) ? parsed.map(normalizeBolItem) : [emptyBolItem()];
    return items.length > 0 ? items : [emptyBolItem()];
  } catch {
    return [emptyBolItem()];
  }
}

export function parseBolDraftFromForm(formData: FormData | null | undefined): BolDraft | null {
  if (!formData) return null;
  const hasAny = [...formData.keys()].some((key) => key.startsWith("bol_"));
  if (!hasAny) return null;
  return normalizeBolDraft({
    bolNumber: formData.get("bol_number"),
    loadNumber: formData.get("bol_load_number"),
    thirdParty: formData.get("bol_third_party"),
    driverName: formData.get("bol_driver"),
    freightCharges: formData.get("bol_freight_charges"),
    originName: formData.get("bol_origin_name"),
    originAddress: formData.get("bol_origin_address"),
    originPhone: formData.get("bol_origin_phone"),
    destName: formData.get("bol_dest_name"),
    destAddress: formData.get("bol_dest_address"),
    destPhone: formData.get("bol_dest_phone"),
    emergencyPhone: formData.get("bol_emergency"),
    codAmount: formData.get("bol_cod_amount"),
    codFee: formData.get("bol_cod_fee"),
    declaredValue: formData.get("bol_declared_value"),
    notes: formData.get("bol_notes"),
    poNumber: formData.get("bol_po"),
    trailerNumber: formData.get("bol_trailer"),
    shipDate: formData.get("bol_ship_date"),
    deliveryDate: formData.get("bol_delivery_date"),
    reeferSetpoint: formData.get("bol_reefer_setpoint"),
    reeferMode: formData.get("bol_reefer_mode"),
    seals: collectBolSealsFromForm(formData),
    items: parseBolItemsJson(String(formData.get("bol_items") ?? "")),
  });
}

export function writeBolDraftToForm(form: FormData, draft: BolDraft): void {
  form.set("bol_number", draft.bolNumber);
  form.set("bol_load_number", draft.loadNumber);
  form.set("bol_third_party", draft.thirdParty);
  form.set("bol_driver", draft.driverName);
  form.set("bol_freight_charges", draft.freightCharges);
  form.set("bol_origin_name", draft.originName);
  form.set("bol_origin_address", draft.originAddress);
  form.set("bol_origin_phone", draft.originPhone);
  form.set("bol_dest_name", draft.destName);
  form.set("bol_dest_address", draft.destAddress);
  form.set("bol_dest_phone", draft.destPhone);
  form.set("bol_emergency", draft.emergencyPhone);
  form.set("bol_cod_amount", draft.codAmount);
  form.set("bol_cod_fee", draft.codFee);
  form.set("bol_declared_value", draft.declaredValue);
  form.set("bol_notes", draft.notes);
  form.set("bol_po", draft.poNumber);
  form.set("bol_trailer", draft.trailerNumber);
  form.set("bol_ship_date", draft.shipDate);
  form.set("bol_delivery_date", draft.deliveryDate);
  form.set("bol_reefer_setpoint", draft.reeferSetpoint);
  form.set("bol_reefer_mode", draft.reeferMode);
  form.set("bol_seals", draft.seals);
  form.set("bol_items", JSON.stringify(draft.items));
}

export function filledBolItems(items: BolItemDraft[]): BolItemDraft[] {
  return items.filter(
    (item) =>
      item.pieces ||
      item.description ||
      item.weightLbs ||
      item.type ||
      item.nmfc ||
      item.classCode ||
      item.hm === "Yes",
  );
}

export function parseBolNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function bolItemTotals(items: BolItemDraft[]): { pieces: number; weightLbs: number } {
  return filledBolItems(items).reduce(
    (sum, item) => ({
      pieces: sum.pieces + parseBolNumber(item.pieces),
      weightLbs: sum.weightLbs + parseBolNumber(item.weightLbs),
    }),
    { pieces: 0, weightLbs: 0 },
  );
}

export function formatBolMoney(value: string): string {
  const amount = parseBolNumber(value);
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatBolTotal(value: number): string {
  if (!value) return "";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
