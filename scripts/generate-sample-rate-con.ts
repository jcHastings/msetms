import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const out = path.join(process.cwd(), "public", "samples", "sample-rate-con.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });

const doc = new PDFDocument({ size: "LETTER", margin: 54 });
const stream = fs.createWriteStream(out);
doc.pipe(stream);

doc.fontSize(18).text("RATE CONFIRMATION");
doc.moveDown(0.3);
doc.fontSize(11).text("MSE Transport  ·  Broker / Carrier confirmation");
doc.moveDown();
doc.fontSize(11).text("Customer: Delta Cold Storage");
doc.text("Bill To: Delta Cold Storage, 900 Produce Row, Atlanta, GA 30316");
doc.moveDown();
doc.text("Load #: DL-22018");
doc.text("PO #: PO-77841");
doc.text("Ref #: RC-22018");
doc.moveDown();
doc.text("Origin: Atlanta, GA");
doc.text("Destination: Jacksonville, FL");
doc.moveDown();
doc.text("Pickup Window: 08/25/2026 06:00 - 08/25/2026 10:00");
doc.text("Delivery Window: 08/25/2026 16:00 - 08/25/2026 20:00");
doc.moveDown();
doc.text("Commodity: Frozen poultry");
doc.text("Weight: 41500 lbs");
doc.text("Rate: $2,150.00");
doc.text("Equipment: Reefer");
doc.text("Reefer Setpoint: 0 F");
doc.moveDown();
doc.fontSize(12).text("SPECIAL INSTRUCTIONS");
doc.fontSize(11);
doc.text("- Appointment required at delivery; call 60 minutes out");
doc.text("- Lumper receipt required for reimbursement");
doc.text("- Driver assist unload");
doc.text("- Maintain 0F; pulper check at pickup and delivery");
doc.text("- Seals: photograph seal and trailer number");
doc.text("- No touch freight if lumper is on site");

doc.end();

function main() {
  return new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

main()
  .then(() => {
    console.log(`Wrote ${out}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
