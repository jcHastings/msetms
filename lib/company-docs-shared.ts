/**
 * MS Express company document slots. Office uploads; any active MS Express driver
 * can open the current file from Assist. Adding a slot later means adding one row
 * here with `enabled: true` (cab card/IRP, COI, MC authority, IFTA decals are staged).
 */
export type CompanyDocSlotDef = {
  value: string;
  label: string;
  /** Short help for the office card. */
  hint: string;
  required: boolean;
  /** true: several current files at once (insurance cards). false: one current file, uploads replace it. */
  multiple: boolean;
  /** true: a file may be tagged to one truck or trailer unit. */
  unitTaggable: boolean;
  enabled: boolean;
};

export const COMPANY_DOC_SLOT_DEFS: readonly CompanyDocSlotDef[] = [
  {
    value: "ifta_license",
    label: "IFTA license",
    hint: "Fuel tax license drivers show at scales and inspections.",
    required: true,
    multiple: false,
    unitTaggable: false,
    enabled: true,
  },
  {
    value: "insurance_card",
    label: "Insurance cards",
    hint: "Proof of insurance. Add a company card, or tag a card to one truck or trailer.",
    required: true,
    multiple: true,
    unitTaggable: true,
    enabled: true,
  },
  {
    value: "irp_cab_card",
    label: "Cab card (IRP)",
    hint: "Apportioned registration cab card, per truck.",
    required: false,
    multiple: true,
    unitTaggable: true,
    enabled: false,
  },
  {
    value: "coi",
    label: "Certificate of insurance (COI)",
    hint: "Broker and shipper COI.",
    required: false,
    multiple: false,
    unitTaggable: false,
    enabled: false,
  },
  {
    value: "mc_authority",
    label: "MC authority",
    hint: "Operating authority letter.",
    required: false,
    multiple: false,
    unitTaggable: false,
    enabled: false,
  },
  {
    value: "ifta_decals",
    label: "IFTA decals",
    hint: "Decal receipt per truck.",
    required: false,
    multiple: true,
    unitTaggable: true,
    enabled: false,
  },
];

export const COMPANY_DOC_SLOTS = COMPANY_DOC_SLOT_DEFS.filter((slot) => slot.enabled);

/** Company docs belong to MS Express only. M&S Loads documents never live here. */
export const COMPANY_DOC_DIVISION = "MSE";

/** Office warning window before a company doc expires. */
export const COMPANY_DOC_WARN_DAYS = 30;

export function companyDocSlot(value: string): CompanyDocSlotDef | null {
  return COMPANY_DOC_SLOTS.find((slot) => slot.value === value) ?? null;
}

export function companyDocSlotLabel(value: string): string {
  return COMPANY_DOC_SLOT_DEFS.find((slot) => slot.value === value)?.label ?? "Company doc";
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}
