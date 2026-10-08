/**
 * Fictional broker rate confirmations for the driver redaction tests.
 * No real shippers, rates, or phone numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import PDFDocumentKit from "../../../lib/pdfkit-document";

const outDir = path.join(process.cwd(), "scripts/fixtures/rate-con-redact");

function writePdf(name: string, title: string, draw: (doc: InstanceType<typeof PDFDocumentKit>) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({ size: "LETTER", margin: 48, info: { Title: title } });
    const stream = fs.createWriteStream(path.join(outDir, name));
    doc.pipe(stream);
    draw(doc);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  await writePdf("a-tql-like.pdf", "SECRET-BROKER-META-TQL", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION");
    doc.moveDown(0.4);
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Load #: TQ-44021");
    doc.text("Pickup: Lineage Logistics, 275 Blair Rd, Avenel, NJ 07001");
    doc.text("Pickup window: 08/25/2026 06:00 - 08/25/2026 10:00");
    doc.text("Delivery: Nebraska Cold Storage, 600 E 39th, Hastings, NE 68901");
    doc.text("Delivery window: 08/26/2026 14:00 - 08/26/2026 18:00");
    doc.text("Phone: (402) 555-0199");
    doc.text("PO 778210");
    doc.text("Commodity: Frozen poultry");
    doc.text("Weight: 41,500 lbs");
    doc.text("Temp: 34°F continuous");
    doc.text("Line haul: $2,150.00");
    doc.text("Fuel surcharge: $186.40");
    doc.text("Total: $2,336.40");
    doc.moveDown(0.4);
    doc.text("Detention after 2 hrs. Lumper receipt required.");
    doc.text("Driver must call 60 minutes before arrival.");
  });

  await writePdf("b-ch-robinson-like.pdf", "SECRET-BROKER-META-CHR", (doc) => {
    doc.fontSize(16).text("CARRIER RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: MS Express    Load CH-90881");
    doc.text("Pickup: 100 Packer Rd, Hastings, NE 68901");
    doc.text("Appointment: 09/02/2026 08:30");
    doc.text("Deliver: 355 Food Center Dr, Bronx, NY 10474");
    doc.text("Delivery appointment: 09/03/2026 11:00");
    doc.text("Weight: 39,200 lbs");
    doc.text("Setpoint: -10 F continuous. Two load locks. Seal required.");
    doc.text("Reference RC-90881");
    doc.addPage();
    doc.fontSize(13).text("Accessorials");
    doc.fontSize(11);
    doc.text("Linehaul 2,400.00");
    doc.text("FSC 180.50");
    doc.text("Lumper $125.00");
    doc.text("Detention $50.00");
    doc.text("TONU $250.00");
    doc.text("Layover 125.00");
    doc.text("All-in rate USD 2,755.50");
    doc.text("Rate per mile $2.15/mi");
    doc.text("2.15 per mile");
    doc.text("Quick pay fee 2%. $75 deducted if quick pay is selected.");
    doc.text("Detention after 2 hrs at $50/hr.");
  });

  await writePdf("c-echo-like.pdf", "SECRET-BROKER-META-ECHO", (doc) => {
    doc.fontSize(16).text("Load tender");
    doc.fontSize(11);
    doc.text("Carrier MS Express");
    doc.text("Pickup: Dallas Cold, 400 Commerce St, Dallas, TX 75201");
    doc.text("Deliver: KC Foods, 12 Market St, Kansas City, MO 64101");
    doc.text("Pickup time: 07:30");
    doc.text("PO 123456.00");
    doc.text("Weight 38,000 lbs");
    doc.text("Temp 34°F");
    doc.text("Rate: 2150.00");
    doc.text("FSC 86.50");
    doc.text("Total: 2475");
    doc.text("Carrier Pay: 2100");
    doc.text("Special instructions: lumper on site. Call ahead.");
  });

  await writePdf("d-ms-loads.pdf", "SECRET-BROKER-META-MSLOADS", (doc) => {
    doc.fontSize(16).text("M&S Loads");
    doc.fontSize(11);
    doc.text("Bill to: M&S Loads");
    doc.text("Carrier: MS Express");
    doc.text("Load MS-55110");
    doc.text("Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901");
    doc.text("Pickup 10/02/2026 09:00");
    doc.text("Delivery: Westside Foods, 355 Food Center Dr, Bronx, NY 10474");
    doc.text("Phone (531) 555-0144");
    doc.text("Ref MS-55110");
    doc.text("Commodity: Boxed beef");
    doc.text("Weight: 42,000 lbs");
    doc.text("Reefer setpoint 34°F continuous");
    doc.text("Rate: $1,875.00");
    doc.text("Fuel surcharge $140.00");
    doc.text("Amount: 2015.00");
    doc.text("Driver assist unload. Seal the trailer.");
  });

  await writePdf("g-false-positives.pdf", "SECRET-BROKER-META-TRAPS", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Pickup appointment: 10.30");
    doc.text("Delivery time 16:45");
    doc.text("Date 08/25/2026");
    doc.text("Temp: 34°F");
    doc.text("Setpoint -10 F");
    doc.text("PO 123456.00");
    doc.text("Reference 45090");
    doc.text("Weight: 42,500 lbs");
    doc.text("Phone: (402) 555-0199");
    doc.text("Hastings, NE 68901");
    doc.text("Total miles 850");
    doc.text("Detention after 2 hrs");
    doc.text("Load # 106361");
    doc.text("Rate confirmation 106361");
    doc.text("Line haul: $640.00");
  });

  await writePdf("h-ms-brokerage.pdf", "SECRET-BROKER-META-BROKER", (doc) => {
    doc.fontSize(14).text("M&S Loads LLC");
    doc.fontSize(11);
    doc.text("MC-970613");
    doc.text("228 East Route 59 #190, Nanuet, NY 10954");
    doc.text("sam.broker@msloads.com  (845) 555-0170");
    doc.moveDown(0.6);
    doc.fontSize(16).text("LOAD CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901");
    doc.text("Deliver: Westside Foods, 355 Food Center Dr, Bronx, NY 10474");
    doc.text("Weight: 40,000 lbs");
    doc.text("Temp: 34°F");
    doc.moveDown(0.4);
    doc.text("Pay Items");
    doc.text("Flat Rate 1 1,850.00 $ 1,850.00");
    doc.text("Fuel 1 186.50 $ 186.50");
    doc.text("Detention 2 hrs free then $50/hr");
    doc.moveDown(0.4);
    doc.text("Quick pay");
    doc.text("1.5%");
    doc.moveDown(1);
    doc.text("Esti Katz  esti.katz@msloads.com  (845) 555-0171");
    doc.text("Deerfield Beach, FL 33441");
  });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocumentKit({ size: "LETTER", margin: 48, info: { Title: "SECRET-BROKER-META-PARA" } });
    const stream = fs.createWriteStream(path.join(outDir, "i-proportional.pdf"));
    doc.pipe(stream);
    doc.font("Times-Roman").fontSize(12);
    doc.text("RATE CONFIRMATION");
    doc.moveDown(0.4);
    doc.text(
      "Carrier MS Express must arrive at Hastings Packing with the trailer sealed, confirm the PO 778210, hold 34°F, and accept a $15 fee when the scale ticket is missing plus $250/Each for extra pallets before the receiver will sign.",
      { width: 500 },
    );
    doc.moveDown(0.4);
    doc.text("Line haul: $900.00");
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocumentKit({ size: "A4", margin: 48, info: { Title: "SECRET-BROKER-META-A4" } });
    const stream = fs.createWriteStream(path.join(outDir, "j-a4.pdf"));
    doc.pipe(stream);
    doc.fontSize(16).text("RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Pickup: Dallas Cold, 400 Commerce St, Dallas, TX 75201");
    doc.text("Deliver: Omaha Cold, 12 Market St, Omaha, NE 68102");
    doc.text("Line haul: $900.00");
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  await writePdf("k-invoice.pdf", "SECRET-BROKER-META-INVOICE", (doc) => {
    doc.fontSize(16).text("INVOICE");
    doc.fontSize(11);
    doc.text("Bill to: Heartland Foods");
    doc.text("Carrier: MS Express");
    doc.text("Rate: $4,200.00");
  });

  await writePdf("l-customer-confirmation.pdf", "SECRET-BROKER-META-CUST", (doc) => {
    doc.fontSize(16).text("Customer Confirmation");
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901");
    doc.text("Total: $3,100.00");
  });

  const scan = createCanvas(1224, 1584);
  const ctx = scan.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1224, 1584);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText("RATE CONFIRMATION", 80, 140);
  ctx.font = "32px sans-serif";
  ctx.fillText("Pickup: Dallas, TX 75201", 80, 240);
  ctx.fillText("Deliver: Omaha, NE 68102", 80, 300);
  ctx.fillText("Appointment 10.30 AM", 80, 360);
  ctx.fillText("Temp 34 F", 80, 420);
  ctx.fillText("Rate: $999.00", 80, 500);
  ctx.fillText("Weight 40,000 lbs", 80, 560);
  const scanPdf = await PDFDocument.create();
  scanPdf.setTitle("SECRET-BROKER-META-SCAN");
  const image = await scanPdf.embedPng(scan.toBuffer("image/png"));
  const scanPage = scanPdf.addPage([612, 792]);
  scanPage.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  fs.writeFileSync(path.join(outDir, "e-scanned.pdf"), Buffer.from(await scanPdf.save()));

  const formPdf = await PDFDocument.create();
  formPdf.setTitle("SECRET-BROKER-META-FORM");
  const formPage = formPdf.addPage([612, 792]);
  const font = await formPdf.embedFont(StandardFonts.Helvetica);
  const form = formPdf.getForm();
  const field = form.createTextField("carrierPay");
  field.setText("$2,400.00");
  field.addToPage(formPage, { x: 72, y: 700, width: 220, height: 24, font });
  field.updateAppearances(font);
  fs.writeFileSync(path.join(outDir, "f-form-field.pdf"), Buffer.from(await formPdf.save()));

  console.log(`Wrote fixtures in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
