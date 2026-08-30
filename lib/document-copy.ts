/** Company-driver dispatch sheet. No TriumphPay / carrier-pay lines. */
export const DRIVER_CONFIRMATION_TERMS = [
  "Terms of load:",
  "1. Temperature-controlled loads must always run on Continuous. Never start and stop.",
  "2. Two load locks are required for all loads. The driver is responsible for the piece count and condition of the load. Loads must be delivered on the due date.",
  "3. Any shortages or damage must be reported to dispatch and must get a claim number before leaving the receiver. Failure to do so the driver is responsible for the load value.",
  "4. Driver must check with the shipper to confirm the temperature setting, and monitor equipment through delivery.",
  "5. DETENTION: Notify dispatch one hour before detention will start. No detention on drop-trailer loads. Times must be marked on the POD.",
  "6. Have paperwork for every PO on this sheet before leaving the shipping dock. This sheet uses the MS Express load number, not the customer load number.",
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
  "Temperature-controlled loads run Continuous. Use two load locks. Check the setpoint with the shipper before you leave. Record every seal number on the BOL. Paperwork is required for every PO. Shortages or damages need a claim number before leaving the receiver. Notify dispatch one hour before detention starts. This sheet uses the MS Express load number, not the customer load number. Receiving load texts is consent to SMS from dispatch.";

export function shouldReplaceStoredTerms(docType: string, current: string): boolean {
  const text = String(current ?? "").trim();
  if (!text) return true;
  if (docType === "load_confirmation") {
    if (/triumph\s*pay/i.test(text)) return true;
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
    hint: "Dispatch sheet for company drivers. Internal MSE load number. No TriumphPay.",
  },
  {
    value: "invoice" as const,
    label: "Invoice",
    hint: "Customer billed-rate invoice. No owner-operator pay. Tags like [load_id] are optional.",
  },
  {
    value: "customer_confirmation" as const,
    label: "Customer confirmation",
    hint: "English customer confirmation. No driver greeting.",
  },
  {
    value: "bol" as const,
    label: "Bill of Lading",
    hint: "ITS-style BOL terms and footer. No 3rd-party BOL or LTL quote.",
  },
];
