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

  await writePdf("m-shared-address.pdf", "SECRET-BROKER-META-SHARED", (doc) => {
    doc.fontSize(14).text("M&S Loads LLC", 48, 64);
    doc.fontSize(11);
    doc.text("MC-970613", 48, 84);
    doc.text("228 East Route 59 #190, Nanuet, NY 10954", 48, 108);
    doc.text("Reefer", 400, 108);
    doc.text("53'", 490, 108);
    doc.text("Phone: (845) 555-0148", 48, 126);
    doc.text("Date: 08/25/2026", 48, 160);
    doc.text("Temperature: 34°F", 280, 160);
    doc.fontSize(16).text("LOAD CONFIRMATION", 48, 190);
    doc.fontSize(11);
    doc.text("Carrier: MS Express", 48, 220);
    doc.text("Office: 402-302-0097", 48, 238);
    doc.text("Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901", 48, 262);
    doc.text("Phone: (531) 555-0144", 48, 280);
    doc.text("Weight: 40,000 lbs", 48, 298);
    doc.text("Line haul: $1,100.00", 48, 322);
    doc.text("Maria Lopez (M & S LOADS LLC.)", 48, 700);
  });

  const logo = createCanvas(320, 48);
  const logoCtx = logo.getContext("2d");
  logoCtx.fillStyle = "#ffffff";
  logoCtx.fillRect(0, 0, 320, 48);
  logoCtx.fillStyle = "#111111";
  logoCtx.font = "bold 28px sans-serif";
  logoCtx.fillText("MSLOADSLOGO", 8, 34);
  const mark = createCanvas(220, 32);
  const markCtx = mark.getContext("2d");
  markCtx.fillStyle = "#ffffff";
  markCtx.fillRect(0, 0, 220, 32);
  markCtx.fillStyle = "#111111";
  markCtx.font = "bold 20px sans-serif";
  markCtx.fillText("SHIPPERMARK", 4, 24);

  await writePdf("n-header-logo.pdf", "SECRET-BROKER-META-LOGO", (doc) => {
    doc.image(logo.toBuffer("image/png"), 48, 40, { width: 160, height: 24 });
    doc.fontSize(14).text("M&S Loads LLC", 240, 46);
    doc.fontSize(11);
    doc.text("MC-970613", 240, 68);
    doc.fontSize(16).text("LOAD CONFIRMATION", 48, 120);
    doc.fontSize(11);
    doc.text("Carrier: MS Express", 48, 150);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 172);
    doc.text("Line haul: $900.00", 48, 200);
    doc.image(mark.toBuffer("image/png"), 48, 460, { width: 140, height: 20 });
  });

  await writePdf("o-neighbor-tonu.pdf", "SECRET-BROKER-META-TONU", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION", 48, 72);
    doc.fontSize(11);
    doc.text("Carrier: MS Express", 48, 110);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 130);
    doc.text("• TONU", 48, 200);
    doc.text("Line haul: $2,150.00", 48, 214);
  });

  await writePdf("p-invoice-terms.pdf", "SECRET-BROKER-META-TERMS", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901");
    doc.text("Line haul: $800.00");
    doc.moveDown();
    doc.text("EMAIL your invoice to billing@example.test within 24 hours.");
    doc.text("Payment is due upon receipt of invoice.");
    doc.text("Sign the bill of lading at delivery.");
  });

  await writePdf("q-percent.pdf", "SECRET-BROKER-META-PERCENT", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: MS Express");
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901");
    doc.text("A $100 fine applies when the seal is broken.");
    doc.text("Deliveries must be 100 percent (100%) on time.");
    doc.text("Line haul: $640.00");
  });

  await writePdf("r-third-party.pdf", "SECRET-BROKER-META-CARRIER", (doc) => {
    doc.fontSize(16).text("ACME FREIGHT");
    doc.fontSize(14).text("RATE CONFIRMATION");
    doc.fontSize(11);
    doc.text("Carrier: M&S Loads");
    doc.text("Phone: 402-302-0097");
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901");
    doc.text("Line haul: $900.00");
  });

  const ascendLogo = createCanvas(360, 52);
  const ascendCtx = ascendLogo.getContext("2d");
  ascendCtx.fillStyle = "#ffffff";
  ascendCtx.fillRect(0, 0, 360, 52);
  ascendCtx.fillStyle = "#111111";
  ascendCtx.font = "bold 26px sans-serif";
  ascendCtx.fillText("M & S LOADS LLC", 8, 34);

  await writePdf("s-ascend-header.pdf", "SECRET-BROKER-META-ASCEND", (doc) => {
    doc.image(ascendLogo.toBuffer("image/png"), 48, 36, { width: 180, height: 26 });
    doc.fontSize(11);
    doc.text("228 East Route 59 Unit 190", 48, 72);
    doc.text("Nanuet, NY 10954", 48, 86);
    doc.text("Docket: MC970613", 48, 100);
    doc.text("Phone: (845) 555-0162", 48, 118);
    doc.text("Carrier Information", 48, 168);
    doc.text("Carrier: MS Express", 48, 186);
    doc.text("Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901", 48, 210);
    doc.text("Line haul: $900.00", 48, 236);
    doc.text("Questions for Maria Lopez (M & S LOADS LLC.)", 48, 640);
    doc.text("Send billing to billing@msloads.com", 48, 658);
  });

  const leftover = createCanvas(280, 48);
  const leftoverCtx = leftover.getContext("2d");
  leftoverCtx.fillStyle = "#ffffff";
  leftoverCtx.fillRect(0, 0, 280, 48);
  leftoverCtx.fillStyle = "#111111";
  leftoverCtx.font = "bold 32px sans-serif";
  leftoverCtx.fillText("Nanuet", 8, 34);

  await writePdf("t-identity-guard.pdf", "SECRET-BROKER-META-GUARD", (doc) => {
    doc.fontSize(11);
    doc.text("228 East Route 59 Unit 190", 48, 72);
    doc.text("Nanuet, NY 10954", 48, 88);
    doc.text("Docket: MC970613", 48, 104);
    doc.text("Carrier: MS Express", 48, 150);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 172);
    doc.text("Line haul: $500.00", 48, 200);
    doc.image(leftover.toBuffer("image/png"), 48, 480, { width: 140, height: 24 });
  });

  await writePdf("u-tonu-label.pdf", "SECRET-BROKER-META-TONU-LABEL", (doc) => {
    doc.fontSize(16).text("RATE CONFIRMATION", 48, 72);
    doc.fontSize(11);
    doc.text("Carrier: MS Express", 48, 110);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 130);
    doc.text("• TONU: $75", 48, 200);
    doc.text("Line haul: $2,150.00", 48, 220);
  });

  const officeLogo = createCanvas(320, 48);
  const officeCtx = officeLogo.getContext("2d");
  officeCtx.fillStyle = "#ffffff";
  officeCtx.fillRect(0, 0, 320, 48);
  officeCtx.fillStyle = "#111111";
  officeCtx.font = "bold 24px sans-serif";
  officeCtx.fillText("MSEXPRESSLOGO", 8, 32);

  await writePdf("v-msexpress-office.pdf", "SECRET-BROKER-META-OFFICE", (doc) => {
    doc.image(officeLogo.toBuffer("image/png"), 48, 36, { width: 180, height: 28 });
    doc.save();
    doc.lineWidth(1.25).moveTo(248, 36).lineTo(248, 68).stroke();
    doc.restore();
    doc.fontSize(14).text("M&S Loads", 250, 48);
    doc.fontSize(11);
    doc.text("600 E 39th St · Hastings, NE 68901", 48, 84);
    doc.text("MC 056299", 48, 100);
    doc.text("402-302-0097", 48, 116);
    doc.text("dispatch@msloads.com", 48, 132);
    doc.fontSize(16).text("RATE CONFIRMATION", 48, 170);
    doc.fontSize(11);
    doc.text("Carrier: M&S Loads DBA MS Express", 48, 200);
    doc.text("Pickup: Omaha Cold, Omaha, NE 68102", 48, 220);
    doc.text("Line haul: $900.00", 48, 248);
  });

  await writePdf("w-times-sliver.pdf", "SECRET-BROKER-META-TIMES", (doc) => {
    doc.font("Times-Roman").fontSize(16).text("RATE CONFIRMATION", 48, 72);
    doc.fontSize(12);
    doc.text("Carrier: MS Express", 48, 110);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 132);
    doc.text("Driver must carry at least $100,000 of cargo insurance.", 48, 180);
    doc.text("Accessorial fines- $250/Each when late.", 48, 204);
    doc.text("Driver is fined $100/each for a missed scan.", 48, 228);
    doc.text("Line haul: $900.00", 48, 256);
  });

  await writePdf("x-glyph-edges.pdf", "SECRET-BROKER-META-GLYPH", (doc) => {
    doc.font("Times-Roman").fontSize(16).text("RATE CONFIRMATION", 48, 48);
    doc.fontSize(12);
    doc.text("228 East Route 59 Unit 190, Nanuet, NY 10954", 48, 78);
    doc.text("10954", 48, 96);
    doc.text("Docket: MC970613", 48, 114);
    doc.text("Carrier: MS Express", 48, 156);
    doc.text("Pickup: Hastings Packing, Hastings, NE 68901", 48, 176);
    doc.text("Sign only if appropriate by M&S Loads LLC.", 48, 214);
    doc.text("Driver must carry at least $100,000 of cargo insurance.", 48, 238);
    doc.text("Accessorial fines- $250/Each when late.", 48, 262);
    doc.text("Driver is fined $100/each for a missed scan.", 48, 286);
    doc.text("Line haul: $900.00", 48, 320);
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
