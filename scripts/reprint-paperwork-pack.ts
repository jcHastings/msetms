import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db";
import { renderConfirmationPdf, type ConfirmationModel, type ConfirmationStop } from "../lib/load-confirmation";
import { renderTmsInvoicePdf, type TmsInvoiceModel } from "../lib/invoice";
import { renderBolPdf, type BolModel } from "../lib/bol";

const outDir = process.env.PAPERWORK_ARTIFACT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const company = {
  company_name: "M&S Loads",
  dispatcher_name: "MS Test",
  dispatcher_phone: "402-302-0097",
  dispatcher_fax: "",
  dispatcher_email: "ana@msloads.com",
  street: "600 E 39th St",
  city: "Hastings",
  state: "NE",
  zip: "68901",
};

function stop(partial: Partial<ConfirmationStop> & Pick<ConfirmationStop, "title" | "name">): ConfirmationStop {
  return {
    address: "",
    phone: "",
    date: "",
    time: "",
    type: "",
    quantity: "",
    weight: "",
    poNumber: "",
    confirmationNumber: "",
    puNumber: "",
    extra: "",
    hoursLabel: "Shipping Hours",
    hours: "",
    appointment: "",
    description: "",
    ...partial,
  };
}

const northBay = stop({
  title: "Shipper 1",
  name: "North Bay Produce - Mascoutah",
  address: "8835 Richard Brauer Rd, Mascoutah, IL 62258",
  phone: "618-566-2222",
  date: "09/02/26",
  time: "2:00 PM",
  quantity: "1440 cases",
  weight: "12000",
  puNumber: "N25504",
  appointment: "Yes",
  description: "Fresh Foods BERRIES",
  extra: "FOOD GRADE TRAILER REQUIRED. LOAD LOCKS ARE REQUIRED. MUST PULP PRODUCT-TAKE TEMP WHEN LOADING.",
});

const awgKc = stop({
  title: "Consignee 1",
  name: "AWG - Kansas City",
  address: "4701 Speaker Road, Kansas City, KS 66106",
  phone: "913-288-1311",
  date: "09/03/26",
  time: "3:00 AM",
  quantity: "960 cases",
  weight: "12000",
  poNumber: "000250476",
  confirmationNumber: "61511545",
  appointment: "Yes",
  description: "Fresh Foods BERRIES",
  hoursLabel: "Receiving Hours",
  extra: "AWG IS BY SET APPT. Appointment required.",
});

const baseConfirm: ConfirmationModel = {
  packet: "internal",
  style: "owner_operator",
  company,
  loadNumber: "MSE-1067",
  shipDate: "09/02/26",
  todayDate: "09/02/26",
  carrierName: "Lumig Transports LLC",
  carrierPhone: "3217709078",
  driverName: "",
  driverPhone: "",
  driverEmail: "",
  equipment: "53' Reefer",
  truckNumber: "",
  trailerNumber: "",
  agreedAmount: 2625,
  customerName: "",
  customerBilling: "",
  customerContact: "",
  customerPhone: "",
  customerEmail: "",
  customerReference: "",
  customerRate: null,
  customerRateLines: [],
  headerCompany: "CB Logistics Group",
  headerDispatcher: "",
  headerPhone: "314-459-1752",
  headerEmail: "",
  loadStatus: "",
  shipper: northBay,
  consignee: awgKc,
  stops: [northBay, awgKc],
  dispatchNotes:
    "MUST PULP PRODUCT-TAKE TEMP WHEN LOADING!!!!....MUST CHECK IN WITH ALL PU#s.....HAVE DRIVERS PAY ALL GATE FEES AND LUMPER FEES AND SUBMIT RECEIPTS FOR REIMBURSEMENT. After-hours tracking 314-459-1752. Keep the air chute clear. Trailer must be clean with no exposed insulation.",
  internalLegs: "",
  reeferSetpoint: "34°F",
  reeferMode: "Continuous",
};

const customerConfirm: ConfirmationModel = {
  ...baseConfirm,
  packet: "customer",
  agreedAmount: null,
  customerName: "CB Logistics Group",
  customerBilling: "",
  customerContact: "",
  customerPhone: "314-459-1752",
  customerEmail: "",
  customerReference: "106361",
  customerRate: 3500,
  customerRateLines: [{ name: "Flat Rate", amount: 3500 }],
  headerCompany: "CB Logistics Group",
  headerPhone: "314-459-1752",
};

const invoice: TmsInvoiceModel = {
  invoiceNumber: "INV-MSE-1060",
  loadNumber: "MSE-1060",
  customerName: "CB Logistics Group",
  date: "09/01/26",
  poNumber: "",
  customerReference: "106361",
  lane: "Hastings, NE → Harlan, IA",
  lines: [{ name: "Flat Rate", description: "", amount: 1400, qty: 1, rate: 1400 }],
  total: 1400,
  companyName: "M&S Loads",
  companyLegalName: "M&S Loads LLC",
  companyAddress: "600 E 39th St, Hastings, NE 68901",
  companyPhone: "402-302-0097",
  companyEmail: "ar@msloads.com",
  weight: "42,027 lb",
  miles: "212.8",
  customerStreet: "",
  customerCityStateZip: "",
  customerPhone: "314-459-1752",
  customerContact: "",
  terms: "Net 30",
  dueDate: "10/01/26",
  dispatcherName: "",
  companyDocket: "",
  publicNotes: "",
  stops: [
    {
      sequence: 1,
      kind: "Pickup",
      window: "08/31/26 8:00 AM",
      name: "Nebraska Cold Storage Inc",
      street: "600 E 39th St",
      city: "Hastings",
      state: "NE",
      zip: "68901",
      phone: "402-461-4442",
      reference: "",
      cargo: "",
    },
    {
      sequence: 2,
      kind: "Delivery",
      window: "09/01/26 7:00 AM – 09/01/26 4:00 PM",
      name: "Essentia",
      street: "1200 Industrial Rd",
      city: "Harlan",
      state: "IA",
      zip: "51537",
      phone: "",
      reference: "P491409HB",
      cargo: "74782 26",
    },
  ],
};

const bol: BolModel = {
  bolNumber: "MSE-1068",
  loadNumber: "MSE-1068",
  thirdParty: "",
  driverName: "Yoel Feder",
  freightCharges: "Prepaid",
  originName: "Nebraska Cold Storage Inc",
  originAddress: "600 E 39th St, Hastings, NE, 68901",
  originPhone: "402-461-4442",
  destName: "Westside Foods - Main",
  destAddress: "355 Food center dr., Bronx, NY, 10474",
  destPhone: "7188428500",
  emergencyPhone: "",
  codAmount: "0.00",
  codFee: "Prepaid",
  declaredValue: "0.00",
  notes: "",
  poNumber: "",
  referenceNumber: "",
  trailerNumber: "MS1519",
  shipDate: "2026-08-23",
  deliveryDate: "2026-08-25",
  reeferSetpoint: "26",
  reeferMode: "Continuous",
  seals: "",
  items: [
    {
      pieces: "200",
      description: "Fresh beef",
      weightLbs: "1000",
      type: "boxes",
      nmfc: "",
      hm: "No",
      classCode: "",
    },
  ],
  carrierName: "M & S Loads LLC - MS Express",
  carrierAddress: "600 E 39th St, Hastings, NE, 68901",
  carrierPhone: "402-302-0097",
};

async function main(): Promise<void> {
  getDb();
  const files: Array<[string, Buffer]> = [
    ["MSE-1067-driver-packet.pdf", await renderConfirmationPdf(baseConfirm)],
    ["MSE-1067-customer-confirmation.pdf", await renderConfirmationPdf(customerConfirm)],
    ["INV-MSE-1060.pdf", await renderTmsInvoicePdf(invoice)],
    ["MSE-1068-BOL.pdf", await renderBolPdf(bol)],
  ];
  for (const [name, buffer] of files) {
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, buffer);
    console.log(`Wrote ${dest}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
