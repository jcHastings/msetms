/** Company-driver dispatch sheet. No TriumphPay / carrier-pay lines. */
export const DRIVER_CONFIRMATION_TERMS = [
  "Terms of load:",
  "1. Temperature-controlled loads must always run on Continuous. Never start and stop.",
  "2. Two load locks are required for all loads. The driver is responsible for the piece count and condition of the load. Loads must be delivered on the due date.",
  "3. Any shortages or damage must be reported to dispatch and must get a claim number before leaving the receiver. Failure to do so the driver is responsible for the load value.",
  "4. Driver must check with the shipper to confirm the temperature setting, and monitor equipment through delivery.",
  "5. DETENTION: Notify dispatch one hour before detention will start. No detention on drop-trailer loads. Times must be marked on the POD.",
  "6. Have paperwork for every PO on this sheet before leaving the shipping dock.",
  "7. All loads must be sealed, with the seal number recorded on the BOL before the driver signs. Keep seal integrity on multi-stop loads and record the new seal on the BOL. Tell dispatch immediately if a seal breaks.",
  "8. Receiving load texts is consent to SMS from dispatch while operating a truck.",
].join("\n");

export const CUSTOMER_CONFIRMATION_TERMS = [
  "Email invoices, the rate confirmation, and proof of delivery to billing@msloads.com.",
  "Include the load number in the subject line.",
  "Temperature-controlled loads run Continuous.",
  "Shortages or damages need a claim number before the driver leaves the receiver.",
].join(" ");

export const BOL_TERMS =
  "Seal numbers and piece counts belong on this BOL. Temperature-controlled freight runs Continuous. Dedicated trailer number stays on this form.";

/** Prior one-line stub. Upgrade it to the numbered driver sheet. */
export const DRIVER_CONFIRMATION_TERMS_STUB =
  "Temperature-controlled loads run Continuous. Use two load locks. Check the setpoint with the shipper before you leave. Record every seal number on the BOL. Paperwork is required for every PO. Shortages or damages need a claim number before leaving the receiver. Notify dispatch one hour before detention starts. Receiving load texts is consent to SMS from dispatch.";

/**
 * Billing lecture belongs on the customer/invoice sheet, never the driver packet.
 * Do not treat the period in billing@msloads.com as a sentence boundary.
 */
export function driverFacingTermsText(terms: string): string {
  return String(terms ?? "")
    .replace(/to\s+ensure\s+prompt\s+payment[,:\s]*/gi, " ")
    .replace(
      /(?:please\s+)?e-?mail\s+(?:your\s+)?invoice(?:s)?(?:\s*,\s*(?:the\s+)?rate confirmation)?(?:\s*,?\s*(?:and|&)\s*(?:proof of delivery|p\.?o\.?d\.?))?(?:\s+to\s+)?billing@msloads\.com\.?/gi,
      " ",
    )
    .replace(/\bbilling:\s*billing@msloads\.com/gi, " ")
    .replace(/(?:include|with)\s+the\s+load\s+number\s+in\s+the\s+subject\s+line\.?/gi, " ")
    .replace(/This sheet uses the MS Express load number[^\n]*?\./gi, " ")
    .replace(/billing@msloads\.com/gi, " ")
    .replace(/(?:please\s+)?e-?mail\s+(?:your\s+)?invoice(?:s)?(?:\s*,\s*(?:the\s+)?rate confirmation)?(?:\s*,?\s*(?:and|&)\s*(?:proof of delivery|p\.?o\.?d\.?))?(?:\s+to\s*)?\.?/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/^[:\s,;]+/g, "")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shouldReplaceStoredTerms(docType: string, current: string): boolean {
  const text = String(current ?? "").trim();
  if (!text) return true;
  if (docType === "load_confirmation") {
    if (/billing@msloads\.com|email invoices/i.test(text)) return true;
    if (/triumph\s*pay/i.test(text)) return true;
    if (/This sheet uses the MS Express load number/i.test(text)) return true;
    if (text === DRIVER_CONFIRMATION_TERMS_STUB) return true;
    if (!/Two load locks are required/i.test(text) && /Use two load locks/i.test(text)) return true;
  }
  if (docType === "customer_confirmation" && /customer portal/i.test(text)) return true;
  return false;
}

export const SETTINGS_DOCUMENT_EDITORS = [
  {
    value: "load_confirmation" as const,
    label: "Driver confirmation",
    hint: "Dispatch sheet the driver receives.",
  },
  {
    value: "invoice" as const,
    label: "Invoice",
    hint: "Customer invoice for the billed rate.",
  },
  {
    value: "customer_confirmation" as const,
    label: "Customer confirmation",
    hint: "Confirmation sent to the customer.",
  },
  {
    value: "bol" as const,
    label: "Bill of Lading",
    hint: "BOL title, terms, and footer.",
  },
];
