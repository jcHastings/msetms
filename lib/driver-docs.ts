import { isCustomerRateDocument } from "./load-documents-shared";

export const DRIVER_UPLOAD_KINDS = [
  { value: "fuel_receipt", label: "Fuel receipt" },
  { value: "carrier_invoice", label: "Billing" },
  { value: "scale_ticket", label: "Scale ticket" },
  { value: "bol", label: "Bill of Lading" },
  { value: "pod", label: "Proof of Delivery" },
  { value: "lumper", label: "Lumper" },
  { value: "photo_trailer", label: "Trailer photo" },
  { value: "photo_product", label: "Product photo" },
  { value: "photo_seals", label: "Seal photo" },
  { value: "temp_log", label: "Temp log" },
] as const;

export const UNCLASSIFIED_UPLOAD_KIND = "unclassified";

export type DriverUploadKind = (typeof DRIVER_UPLOAD_KINDS)[number]["value"];

export function isDriverUploadKind(value: string): value is DriverUploadKind {
  return DRIVER_UPLOAD_KINDS.some((item) => item.value === value);
}

export function isUnclassifiedUpload(value: string): boolean {
  return value === UNCLASSIFIED_UPLOAD_KIND || !value.trim();
}

export function labelForDriverUploadKind(value: string): string {
  if (isUnclassifiedUpload(value)) return "Needs type";
  return DRIVER_UPLOAD_KINDS.find((item) => item.value === value)?.label ?? "Document";
}

/**
 * Kinds a driver may download. "photos" is the three TMS photo kinds
 * (trailer, product, seals). Office-only and unknown kinds are absent.
 */
export const DRIVER_DOWNLOAD_KINDS = [
  "bol",
  "pod",
  "lumper",
  "photo_trailer",
  "photo_product",
  "photo_seals",
  "temp_log",
  "scale_ticket",
  "fuel_receipt",
  "samsara_still",
  "claim",
] as const;

const DRIVER_DOWNLOAD_KIND_SET = new Set<string>(DRIVER_DOWNLOAD_KINDS);

export function isDriverDownloadKind(value: string): boolean {
  return DRIVER_DOWNLOAD_KIND_SET.has(value);
}

/** Assigned drivers still cannot download customer confirmations, even under an allow-listed kind. */
export function driverMayDownloadAttachment(file: { kind: string; original_name?: string }): boolean {
  if (!isDriverDownloadKind(file.kind)) return false;
  if (isCustomerRateDocument(file)) return false;
  return true;
}
