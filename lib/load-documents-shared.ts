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
  bol: "Contains the details of the load and includes signature areas for the consignor, consignee, and driver on the load.",
  bol_signatures:
    "Contains the details of the load and includes stop-level signature areas for the consignor, consignee, and driver.",
  bol_blind: "The Blind BOL for this load without street or phone on pickups and deliveries.",
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
  if (key === "bol") return `${safe}-BOL.pdf`;
  if (key === "bol_signatures") return `${safe}-BOL-signatures.pdf`;
  if (key === "bol_blind") return `${safe}-BOL-blind.pdf`;
  if (key === "bol_third_party") return `${safe}-BOL-3rd-${stopId ?? "lane"}.pdf`;
  if (key === "carrier_confirmation") return `${safe}-carrier-confirmation.pdf`;
  if (key === "carrier_confirmation_blind") return `${safe}-carrier-confirmation-blind.pdf`;
  if (key === "customer_confirmation") return `${safe}-customer-confirmation.pdf`;
  return `${safe}-draft-invoice.pdf`;
}

export function isVariantBolName(name: string): boolean {
  return /-BOL-(signatures|blind|3rd)-?/i.test(name);
}

export function cityStateOnly(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && /\d/.test(parts[0])) return parts.slice(1).join(", ");
  return address.trim();
}

export function attachmentIdFromHref(href: string): number | null {
  const match = href.match(/\/api\/attachments\/(\d+)/);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}
