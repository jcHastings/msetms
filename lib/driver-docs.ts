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

/**
 * Needs-type and Billing stay visible only for the driver who uploaded them.
 * Office copies of those kinds stay hidden.
 */
const DRIVER_OWN_UPLOAD_KINDS = new Set<string>(["unclassified", "carrier_invoice"]);

/** Fallback stored when a driver route uploads and the audit actor is still System. */
const DRIVER_ROUTE_UPLOADER = "driver";

const DRIVER_RETYPE_BLOCKED_KINDS = new Set<string>([
  "rate_con",
  "invoice",
  "carrier_invoice",
  "other",
  "ifta",
]);

function uploaderKey(value: string): string {
  return value.trim().toLowerCase();
}

export function isDriverRouteUploader(uploadedBy: string): boolean {
  return uploaderKey(uploadedBy) === DRIVER_ROUTE_UPLOADER;
}

/** `uploaded_by` is the driver-route sentinel or a driver's name. There is no separate source column. */
export function attachmentUploadedByADriver(uploadedBy: string, driverNames: Iterable<string>): boolean {
  if (isDriverRouteUploader(uploadedBy)) return true;
  const uploaded = uploaderKey(uploadedBy);
  if (!uploaded) return false;
  for (const name of driverNames) {
    if (uploaderKey(name) === uploaded) return true;
  }
  return false;
}

export function isOwnDriverUpload(file: { uploaded_by?: string }, driver: { name: string }): boolean {
  const uploadedBy = String(file.uploaded_by ?? "");
  return isDriverRouteUploader(uploadedBy) || uploaderKey(uploadedBy) === uploaderKey(driver.name);
}

/** Same rule as the download check, plus this driver's own Needs-type and Billing uploads. */
export function driverMaySeeAttachment(
  file: { kind: string; original_name?: string; uploaded_by?: string },
  driver: { name: string },
): boolean {
  if (isCustomerRateDocument(file)) return false;
  if (driverMayDownloadAttachment(file)) return true;
  if (!DRIVER_OWN_UPLOAD_KINDS.has(file.kind)) return false;
  return isOwnDriverUpload(file, driver);
}

/** A driver may set a new kind only on an unclassified file a driver uploaded, and only to an allow-listed kind. */
export function driverMayRetypeAttachment(
  file: { kind: string; original_name?: string; uploaded_by?: string },
  nextKind: string,
  driverNames: Iterable<string>,
): boolean {
  const current = file.kind.trim();
  if (current !== UNCLASSIFIED_UPLOAD_KIND || DRIVER_RETYPE_BLOCKED_KINDS.has(current)) return false;
  if (isCustomerRateDocument(file)) return false;
  if (!attachmentUploadedByADriver(String(file.uploaded_by ?? ""), driverNames)) return false;
  const next = nextKind.trim();
  if (!isDriverDownloadKind(next) || DRIVER_RETYPE_BLOCKED_KINDS.has(next)) return false;
  if (isCustomerRateDocument({ kind: next, original_name: file.original_name })) return false;
  return true;
}
