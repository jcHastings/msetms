import fs from "node:fs";
import path from "node:path";
import { renderConfirmationPdf, type ConfirmationModel } from "../lib/load-confirmation";

const outDir = path.join(process.cwd(), "public", "samples");
fs.mkdirSync(outDir, { recursive: true });

const company = {
  company_name: "MS EXPRESS",
  dispatcher_name: "MS Test",
  dispatcher_phone: "402-302-0097",
  dispatcher_fax: "",
  dispatcher_email: "ana@msloads.com",
  street: "",
  city: "",
  state: "",
  zip: "",
};

const emptyCustomer = {
  packet: "internal" as const,
  customerName: "",
  customerBilling: "",
  customerContact: "",
  customerPhone: "",
  customerEmail: "",
  customerReference: "",
  customerRate: null,
  customerRateLines: [],
  headerCompany: "",
  headerDispatcher: "",
  headerPhone: "",
  headerEmail: "",
};

const ooSample: ConfirmationModel = {
  ...emptyCustomer,
  style: "owner_operator",
  company,
  loadNumber: "1006149",
  shipDate: "08/21/2026",
  todayDate: "08/23/2026",
  carrierName: "3K3B Trucking LLC",
  carrierPhone: "402-913-6316",
  driverName: "",
  driverPhone: "",
  driverEmail: "",
  equipment: "53' Reefer",
  truckNumber: "",
  trailerNumber: "",
  agreedAmount: 2975,
  loadStatus: "On Route",
  shipper: {
    title: "Shipper 1",
    name: "Lineage Logistics - Avenel",
    address: "275 Blair rd, Avenel, NJ, 07001",
    phone: "732-340-1600",
    date: "08/21/2026",
    time: "",
    type: "",
    quantity: "",
    weight: "",
    poNumber: "",
    confirmationNumber: "O341180225",
    puNumber: "",
    extra: "",
    hoursLabel: "Shipping Hours",
    hours: "",
    appointment: "No",
    description: "",
  },
  consignee: {
    title: "Consignee 1",
    name: "Nebraska Cold Storage Inc",
    address: "600 E 39th St, Hastings, NE, 68901",
    phone: "402-461-4442",
    date: "08/23/2026",
    time: "",
    type: "",
    quantity: "",
    weight: "",
    poNumber: "",
    confirmationNumber: "",
    puNumber: "",
    extra: "Released 1073675, CRLU1221060 SG2-019",
    hoursLabel: "Receiving Hours",
    hours: "",
    appointment: "Yes",
    description: "",
  },
  stops: [],
  dispatchNotes: "",
  internalLegs: "",
  reeferSetpoint: "",
  reeferMode: "",
};
ooSample.stops = [ooSample.shipper, ooSample.consignee];

const companySample: ConfirmationModel = {
  ...emptyCustomer,
  style: "company_driver",
  company,
  loadNumber: "1006151",
  shipDate: "08/22/2026",
  todayDate: "08/23/2026",
  carrierName: "",
  carrierPhone: "",
  driverName: "Christopher Howell",
  driverPhone: "316-882-2773",
  driverEmail: "christopher.m.howell2@gmail.com",
  equipment: "53' Reefer",
  truckNumber: "Assign Later",
  trailerNumber: "Assign Later",
  agreedAmount: null,
  loadStatus: "Dispatched",
  shipper: {
    title: "Shipper 1",
    name: "Tyson-Amarillo",
    address: "5000 FM1912, Amarillo, TX, 79120",
    phone: "806-335-1531",
    date: "08/22/2026",
    time: "",
    type: "",
    quantity: "",
    weight: "",
    poNumber: "49404 286713",
    confirmationNumber: "",
    puNumber: "",
    extra: "",
    hoursLabel: "Shipping Hours",
    hours: "",
    appointment: "No",
    description: "",
  },
  consignee: {
    title: "Consignee 1",
    name: "Omaha Steaks - 9203",
    address: "9203 F Street, Omaha, NE, 68127",
    phone: "",
    date: "08/24/2026",
    time: "11:30",
    type: "",
    quantity: "",
    weight: "",
    poNumber: "Omaha 56736 8/24 Conf # 42583",
    confirmationNumber: "",
    puNumber: "",
    extra: "",
    hoursLabel: "Receiving Hours",
    hours: "",
    appointment: "No",
    description: "",
  },
  stops: [],
  dispatchNotes: "",
  internalLegs: "",
  reeferSetpoint: "",
  reeferMode: "",
};
companySample.stops = [companySample.shipper, companySample.consignee];

async function main(): Promise<void> {
  const oo = await renderConfirmationPdf(ooSample);
  const companyPdf = await renderConfirmationPdf(companySample);
  fs.writeFileSync(path.join(outDir, "sample-load-confirmation-oo.pdf"), oo);
  fs.writeFileSync(path.join(outDir, "sample-load-confirmation-company.pdf"), companyPdf);
  console.log("Wrote sample load confirmation PDFs under public/samples");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
