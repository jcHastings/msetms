/** Company-driver dispatch sheet. No TriumphPay / carrier-pay lines. */
export const DRIVER_CONFIRMATION_TERMS = [
  "Temperature-controlled loads run Continuous. Use two load locks.",
  "Check the setpoint with the shipper before you leave.",
  "Record every seal number on the BOL. Paperwork is required for every PO.",
  "Shortages or damages need a claim number before leaving the receiver.",
  "Notify dispatch one hour before detention starts.",
  "This sheet uses the MS Express load number, not the customer load number.",
  "Receiving load texts is consent to SMS from dispatch.",
].join(" ");

export const CUSTOMER_CONFIRMATION_TERMS =
  "Email invoices and POD to billing@msloads.com. Temperature-controlled loads run Continuous. Shortages or damages need a claim number before the driver leaves the receiver.";

export const BOL_TERMS =
  "Seal numbers and piece counts belong on this BOL. Temperature-controlled freight runs Continuous. Dedicated trailer number stays on this form.";

export const SETTINGS_DOCUMENT_EDITORS = [
  {
    value: "load_confirmation" as const,
    label: "Driver confirmation",
    hint: "Dispatch sheet for company drivers. Internal MSE load number.",
  },
  {
    value: "invoice" as const,
    label: "Invoice",
    hint: "Customer billed-rate invoice. No owner-operator pay.",
  },
  {
    value: "customer_confirmation" as const,
    label: "Customer confirmation",
    hint: "English customer email / confirmation. No driver greeting.",
  },
  {
    value: "bol" as const,
    label: "Bill of Lading",
    hint: "ITS-style BOL terms and footer.",
  },
];
