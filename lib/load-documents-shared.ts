/** Client-safe catalog for Ascend-style defaulted load documents. */

export type DefaultedDocKey =
  | "bol"
  | "bol_signatures"
  | "bol_blind"
  | "bol_third_party"
  | "carrier_confirmation"
  | "carrier_confirmation_blind"
  | "customer_confirmation"
  | "draft_invoice";

export type DefaultedDocumentRow = {
  key: DefaultedDocKey;
  stopId: number | null;
  title: string;
  source: string;
  description: string;
  attachedTo: string;
  status: "generated" | "ready";
  attachmentId: number | null;
  createdAt: string | null;
  filename: string;
};

export const DEFAULTED_DOC_DESCRIPTIONS: Record<Exclude<DefaultedDocKey, "bol_third_party">, string> = {
  bol: "Master BOL with every pickup and delivery on the load, plus signature areas for the consignor, consignee, and driver.",
  bol_signatures:
    "Master BOL with every stop and signature areas at each pickup and delivery for the consignor, consignee, and driver.",
  bol_blind:
    "Blind BOL with destination cities only — no street address, phone, or consignee name. Signature areas for the consignor, consignee, and driver.",
  carrier_confirmation: "Carrier confirmation to be sent to the carrier for acceptance and signature.",
  carrier_confirmation_blind:
    "Blind carrier confirmation without detailed street addresses, to be sent for acceptance and signature.",
  customer_confirmation: "Sent to the customer to verify agreed-upon terms, including payment.",
  draft_invoice: "Draft customer invoice to be sent for payment after the load is delivered.",
};

export function thirdPartyBolDescription(): string {
  return "Contains the details of the load, including the 3rd party biller address and signature areas for the shipper and carrier.";
}

export function defaultedFilename(loadNumber: string, key: DefaultedDocKey, stopId?: number | null): string {
  const safe = loadNumber.trim() || "load";
  if (key === "bol") return `${safe}-BOL-master.pdf`;
  if (key === "bol_signatures") return `${safe}-BOL-signatures.pdf`;
  if (key === "bol_blind") return `${safe}-BOL-blind.pdf`;
  if (key === "bol_third_party") return `${safe}-BOL-3rd-${stopId ?? "lane"}.pdf`;
  if (key === "carrier_confirmation") return `${safe}-carrier-confirmation.pdf`;
  if (key === "carrier_confirmation_blind") return `${safe}-carrier-confirmation-blind.pdf`;
  if (key === "customer_confirmation") return `${safe}-customer-confirmation.pdf`;
  return `${safe}-draft-invoice.pdf`;
}

export function isVariantBolName(name: string): boolean {
  return /-BOL-(signatures|blind|3rd|master)-?/i.test(name);
}

export function cityStateOnly(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && /\d/.test(parts[0])) return parts.slice(1).join(", ");
  return address.trim();
}

/** Customer rate confirmation / invoice — dispatcher only. Never on the driver app. */
export function isCustomerRateDocument(file: { kind: string; original_name?: string }): boolean {
  if (file.kind === "rate_con" || file.kind === "invoice") return true;
  const name = String(file.original_name ?? "").toLowerCase();
  return name.includes("customer-confirmation") || name.includes("customer_confirmation");
}

/** How the TMS classifies a stored load file for invoice-send attach. */
export type InvoiceMailDocRole =
  | "invoice"
  | "customer_confirmation"
  | "customer_supporting"
  | "driver_facing"
  | "excluded";

const INVOICE_MAIL_CUSTOMER_KINDS = new Set([
  "bol",
  "pod",
  "lumper",
  "scale_ticket",
  "temp_log",
  "photo_trailer",
  "photo_product",
  "photo_seals",
  "claim",
  "rate_con",
]);

const INVOICE_MAIL_DRIVER_KINDS = new Set(["carrier_invoice", "ifta", "fuel_receipt"]);

const DRIVER_FACING_DEFAULTED = new Set<DefaultedDocKey>([
  "carrier_confirmation",
  "carrier_confirmation_blind",
]);

const CUSTOMER_SUPPORTING_DEFAULTED = new Set<DefaultedDocKey>([
  "bol",
  "bol_signatures",
  "bol_blind",
  "bol_third_party",
]);

/** Map a stored filename onto the defaulted-document role the TMS uses. */
export function defaultedDocKeyFromFilename(name: string): DefaultedDocKey | null {
  const lower = String(name ?? "").toLowerCase();
  if (lower.includes("carrier-confirmation-blind") || lower.includes("carrier_confirmation_blind")) {
    return "carrier_confirmation_blind";
  }
  if (lower.includes("carrier-confirmation") || lower.includes("carrier_confirmation")) {
    return "carrier_confirmation";
  }
  if (lower.includes("customer-confirmation") || lower.includes("customer_confirmation")) {
    return "customer_confirmation";
  }
  if (lower.includes("draft-invoice") || lower.includes("draft_invoice")) return "draft_invoice";
  if (/-bol-signatures/i.test(lower)) return "bol_signatures";
  if (/-bol-blind/i.test(lower)) return "bol_blind";
  if (/-bol-3rd/i.test(lower)) return "bol_third_party";
  if (/-bol-master/i.test(lower)) return "bol";
  return null;
}

function isCustomerConfirmationName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("customer-confirmation") || lower.includes("customer_confirmation");
}

/** Secondary safety net — driver/carrier/load-confirmation names that slip past kind. */
export function isDriverFacingFilename(name: string): boolean {
  const lower = String(name ?? "").toLowerCase();
  if (!lower || isCustomerConfirmationName(lower)) return false;
  return (
    /driver[-_\s]?packet|driver[-_\s]?confirmation/.test(lower) ||
    /driver[-_\s]?(rate[-_\s]?con|ratecon)/.test(lower) ||
    /internal[-_\s]?(packet|confirmation)/.test(lower) ||
    /carrier[-_\s]?confirmation/.test(lower) ||
    /rate\s*&\s*load/.test(lower) ||
    /load[-_\s]?confirmation/.test(lower)
  );
}

export function invoiceMailDocumentRole(file: { kind: string; original_name?: string }): InvoiceMailDocRole {
  const name = String(file.original_name ?? "");
  const key = defaultedDocKeyFromFilename(name);
  if (file.kind === "invoice" || key === "draft_invoice") return "invoice";
  if (key === "customer_confirmation") return "customer_confirmation";
  if (key && DRIVER_FACING_DEFAULTED.has(key)) return "driver_facing";
  if (key && CUSTOMER_SUPPORTING_DEFAULTED.has(key)) return "customer_supporting";
  if (INVOICE_MAIL_DRIVER_KINDS.has(file.kind) || isDriverFacingFilename(name)) return "driver_facing";
  if (INVOICE_MAIL_CUSTOMER_KINDS.has(file.kind)) return "customer_supporting";
  return "excluded";
}

/** Optional invoice-email attach list: customer-facing roles only. Invoice PDF is attached separately. */
export function isInvoiceMailCustomerDoc(file: { kind: string; original_name?: string }): boolean {
  const role = invoiceMailDocumentRole(file);
  return role === "customer_confirmation" || role === "customer_supporting";
}

export function attachmentIdFromHref(href: string): number | null {
  const match = href.match(/\/api\/attachments\/(\d+)/);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}
