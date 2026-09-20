import fs from "node:fs";
import path from "node:path";
import { driverFacingTermsText } from "../lib/document-copy";
import { renderConfirmationPdf, type ConfirmationModel } from "../lib/load-confirmation";

const lecture =
  ": To ensure prompt payment please EMAIL your invoice, rate confirmation and proof of delivery to billing@msloads.com Equipment: Reefer, 53'. Continuous reefer. Two load locks. Seal required. Billing: billing@msloads.com";

const shipper = {
  title: "Shipper 1",
  name: "Nebraska Cold Storage Inc",
  address: "600 E 39th St\nHastings, NE 68901",
  phone: "(402) 461-4442",
  date: "08/27/26",
  time: "8:00 AM",
  type: "",
  quantity: "",
  weight: "41500",
  poNumber: "",
  confirmationNumber: "",
  puNumber: "",
  extra: "",
  hoursLabel: "Shipping Hours",
  hours: "Mon–Fri 07:00–15:00",
  appointment: "Yes",
  description: "FRESH BEEF",
};

const consignee = {
  title: "Consignee 1",
  name: "ESSENTIA PROTEIN SOLUTIONS",
  address: "2043 Juniper Ave\nHarlan, IA 51537",
  phone: "",
  date: "08/28/26",
  time: "8:00 AM – 5:00 PM",
  type: "",
  quantity: "",
  weight: "41500",
  poNumber: "",
  confirmationNumber: "",
  puNumber: "",
  extra: "",
  hoursLabel: "Receiving Hours",
  hours: "Mon–Fri 08:00–17:00",
  appointment: "No",
  description: "FRESH BEEF",
};

const model: ConfirmationModel = {
  packet: "internal",
  style: "company_driver",
  company: {
    company_name: "MS EXPRESS",
    dispatcher_name: "MS Test",
    dispatcher_phone: "402-302-0097",
    dispatcher_fax: "",
    dispatcher_email: "ana@msloads.com",
    street: "",
    city: "",
    state: "",
    zip: "",
  },
  loadNumber: "MSE-1055",
  shipDate: "08/27/26",
  todayDate: "09/03/26",
  carrierName: "",
  carrierPhone: "",
  driverName: "Kelvin Whaley",
  driverPhone: "555-1004",
  driverEmail: "",
  equipment: "53' Reefer",
  truckNumber: "28",
  trailerNumber: "MS1523",
  agreedAmount: null,
  customerName: "",
  customerBilling: "",
  customerContact: "",
  customerPhone: "",
  customerEmail: "",
  customerReference: "",
  customerRate: null,
  customerRateLines: [],
  headerCompany: "M & S Loads LLC.",
  headerDispatcher: "",
  headerPhone: "",
  headerEmail: "",
  loadStatus: "",
  shipper,
  consignee,
  stops: [shipper, consignee],
  dispatchNotes: driverFacingTermsText(lecture),
  internalLegs: "",
  reeferSetpoint: "26°F",
  reeferMode: "Continuous",
};

async function main(): Promise<void> {
  const pdf = await renderConfirmationPdf(model);
  const outDir = "/opt/cursor/artifacts";
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, "mse1055-driver-confirmation.pdf");
  fs.writeFileSync(pdfPath, pdf);
  console.log(`Wrote ${pdfPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
