import fs from "node:fs";
import path from "node:path";
import { renderTmsInvoicePdf, type TmsInvoiceModel } from "../lib/invoice";

const model: TmsInvoiceModel = {
  invoiceNumber: "INV-MSE-1055",
  loadNumber: "MSE-1055",
  customerName: "M & S Loads LLC.",
  date: "08/28/26",
  poNumber: "",
  customerReference: "",
  lane: "Hastings, NE → Harlan, IA",
  lines: [{ name: "Flat Rate", description: "", amount: 1400, qty: 1, rate: 1400 }],
  total: 1400,
  companyName: "M&S Loads",
  companyLegalName: "M&S Loads LLC",
  companyAddress: "600 E 39th St, Hastings, NE 68901",
  companyPhone: "402-302-0097",
  companyEmail: "ar@msloads.com",
  weight: "41,500 lb",
  miles: "209.1",
  customerStreet: "",
  customerCityStateZip: "",
  customerPhone: "",
  customerContact: "JC",
  customerContactPhone: "",
  terms: "Net 30",
  dueDate: "09/27/26",
  dispatcherName: "",
  companyDocket: "",
  publicNotes: "",
  stops: [
    {
      sequence: 1,
      kind: "Pickup",
      window: "08/27/26 8:00 AM",
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
      window: "08/28/26 8:00 AM – 5:00 PM",
      name: "ESSENTIA PROTEIN SOLUTIONS",
      street: "1347 Highway 44",
      city: "Harlan",
      state: "IA",
      zip: "51537",
      phone: "",
      reference: "",
      cargo: "",
    },
  ],
};

async function main(): Promise<void> {
  const pdf = await renderTmsInvoicePdf(model);
  const outDir = process.env.PAPERWORK_ARTIFACT_DIR || "/opt/cursor/artifacts";
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, "inv-mse1055-invoice.pdf");
  fs.writeFileSync(pdfPath, pdf);
  console.log(`Wrote ${pdfPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
