/**
 * CB Logistics 106361 page whose unpdf extract matches office:
 * a bare Attn: label, then a leftover person line after Carrier / Hastings /
 * our company name. Do not glue Attn and the person onto one line.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function buildCb106361Pdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);

  const left = 48;
  let y = 760;

  const header = [
    "CB Logistics Group",
    "LOAD NUMBER 106361",
    "2704 Adobe Drive",
    "Imperial, MO 63052 106361",
    "MC: 1326420 P: 314-459-1752 F: 9/2/2026",
    "Carrier:",
    "Attn:",
    "(402) 302-0097Ph/Fax: Truck: 42",
    "Driver: Chris",
    "Reference: Cell: 3217709078",
    "Trailer: MS1519",
    "M&S LOADS LLC",
    "HASTINGS, NE",
    "JoJo Schwartz",
    "DISPATCH CONFIRMATION",
  ];
  for (const line of header) {
    const size = line === "DISPATCH CONFIRMATION" ? 13 : line === "CB Logistics Group" ? 12 : 9;
    const face = line === "DISPATCH CONFIRMATION" || line === "CB Logistics Group" ? bold : font;
    page.drawText(line, { x: left, y, size, font: face, color: ink });
    y -= line === "DISPATCH CONFIRMATION" ? 22 : 13;
  }
  y -= 8;

  page.drawText("Pieces: 1440   Pallets: 6   Act Wgt: 12000   Temp: 34   Flat  3,500.00", {
    x: left,
    y,
    size: 9,
    font,
    color: ink,
  });
  y -= 22;

  const stops = [
    "Stop 1: Pickup (PU)",
    "Date/Time: 9/2, 14:00 - 14:00",
    "Location: North Bay Produce - Mascoutah, 8835 Richard Brauer Road, Mascoutah, IL 62258",
    "Reference: PU# N25504",
    "Notes: PU# N25504 (1440 CASES)",
    "Directions: FOOD GRADE TRAILER REQUIRED, CLEAN,DRY,ODOR FREE PRE-COOLED AT 34° CONTINUOUS UPON ARRIVAL AND DURATION OF TRIP. STRICT LOADING APPTS, LATE TRUCKS CAN BE BUMPED TO A WORK IN. DRIVER MUST VERIFY COUNTS SHIPPED AND AT EACH DELIVERY- MATCH YOUR BOL'S. LOAD LOCKS ARE REQUIRED TO SECURE THE LOAD. DETENTION IS NOT PAID HERE. $100 fine for missing Pickup/Delivery appointment.",
    "",
    "Stop 2: Delivery (Del)",
    "Date/Time: 9/3, 03:00 - 03:00",
    "Location: AWG - Kansas City, 4701 Speaker Road, Kansas City, KS 66106",
    "Notes: CONF# 61511545 PO# 000250476 ( 960 CASES)",
    "Directions: AWG IS BY SET APPT DRIVER TO VERIFY COUNTS RECEIVED, AWG DOES NOT PAY DETENTION, CALL IF BEING DETAINED.",
    "",
    "Stop 3: Delivery (Del)",
    "Date/Time: 9/4, 21:00 - 21:00",
    "Location: AWG - Norfolk, 1301 W Omaha Ave, Norfolk, NE 68701",
    "Notes: CONF#61713982 PO# 110247187 (480 CASES)",
    "Directions: AWG IS BY SET APPT DRIVER TO VERIFY COUNTS RECEIVED, AWG DOES NOT PAY DETENTION, CALL IF BEING DETAINED.",
    "",
    "Commodity: Fresh Foods   Description: BERRIES   Pieces: 1,440   Weight: 12,000",
    "",
    "MUST PULP PRODUCT-TAKE TEMP WHEN LOADING!!!!....MUST CHECK IN WITH ALL PU#s.....HAVE DRIVERS PAY ALL GATE FEES AND LUMPER FEES AND SUBMIT RECEIPTS FOR REIMBURSEMENT",
    "Driver must be able to communicate via phone call/text message with after-hours tracking at 314-459-1752.",
    "Driver must have load locks, arrive to shipper precooled to 34 degrees, run 34 degrees continuous.",
    "Driver must count cases and make sure they match the BOL at the shipper and after every delivery.",
  ];
  for (const line of stops) {
    if (!line) {
      y -= 8;
      continue;
    }
    const size = 8;
    const words = line.split(" ");
    let row = "";
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 516 && row) {
        page.drawText(row, { x: left, y, size, font, color: ink });
        y -= 11;
        row = word;
      } else {
        row = next;
      }
    }
    if (row) {
      page.drawText(row, { x: left, y, size, font, color: ink });
      y -= 11;
    }
  }

  return pdf.save();
}

export async function writeCb106361Pdf(dest = path.join(process.cwd(), "scripts/fixtures/cb-logistics-106361.pdf")) {
  const bytes = await buildCb106361Pdf();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  return dest;
}

const invoked = process.argv[1]?.includes("build-cb-106361-pdf");
if (invoked) {
  writeCb106361Pdf(process.argv[2])
    .then((dest) => {
      console.log(dest);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
