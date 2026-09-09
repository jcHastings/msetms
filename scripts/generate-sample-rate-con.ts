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

const ascendOut = path.join(process.cwd(), "public", "samples", "sample-ascend-rate-con.pdf");

function writeAscendSample(): Promise<void> {
  const ascend = new PDFDocument({ size: "LETTER", margin: 40 });
  const ascendStream = fs.createWriteStream(ascendOut);
  ascend.pipe(ascendStream);
  ascend.fontSize(16).text("LOAD CONFIRMATION");
  ascend.fontSize(9).text("Powered by AscendTMS.com");
  ascend.moveDown(0.4);
  ascend.fontSize(11);
  ascend.text("Load #");
  ascend.text("45090");
  ascend.text("Date");
  ascend.text("08/23/2026");
  ascend.text("Equipment");
  ascend.text("Reefer");
  ascend.text("Equipment Length");
  ascend.text("53'");
  ascend.text("Weight");
  ascend.text("42500 lbs");
  ascend.text("Commodity");
  ascend.text("FROZEN BEEF");
  ascend.moveDown(0.3);
  ascend.text("Carrier");
  ascend.text("MS EXPRESS");
  ascend.moveDown(0.4);
  ascend.text("Stops / Actions");
  ascend.text("#  Action    Date/Time  Location  Contact");
  ascend.text("1");
  ascend.text("Pickup");
  ascend.text("03/03/25");
  ascend.text("Lineage Logistics - Avenel");
  ascend.text("275 Blair rd");
  ascend.text("Avenel, NJ 07001");
  ascend.text("2");
  ascend.text("Delivery");
  ascend.text("03/05/25");
  ascend.text("Nebraska Cold Storage");
  ascend.text("600 E 39th St");
  ascend.text("Hastings, NE 68901");
  ascend.moveDown(0.4);
  ascend.text("Pay Items");
  ascend.text("Description  Notes  Quantity  Rate  Amount");
  ascend.text("Flat Rate");
  ascend.text("1");
  ascend.text("3200.00");
  ascend.text("$ 3,200.00");
  ascend.text("Total");
  ascend.text("$ 3,200.00");
  ascend.moveDown(0.4);
  ascend.text("Terms of Load");
  ascend.text("Please email invoices to billing@msloads.com with the load number in the subject line.");
  ascend.text("Temperature controlled loads must always run on continuous mode. Never start and stop.");
  ascend.text("Two load locks. Seal required.");
  ascend.fontSize(8).text("Page 1 out of 2    Load #45090 | Powered by AscendTMS.com");
  ascend.end();
  return new Promise((resolve, reject) => {
    ascendStream.on("finish", () => resolve());
    ascendStream.on("error", reject);
  });
}

const brokerOut = path.join(process.cwd(), "public", "samples", "sample-broker-rate-con.pdf");

function writeBrokerSample(): Promise<void> {
  const broker = new PDFDocument({ size: "LETTER", margin: 48 });
  const stream = fs.createWriteStream(brokerOut);
  broker.pipe(stream);
  broker.fontSize(16).text("RXO Carrier Tender");
  broker.fontSize(10).text("This is not an Ascend confirmation.");
  broker.moveDown();
  broker.fontSize(11);
  broker.text("Tender ID  RXO-77241");
  broker.text("Bill-to party  Allen Lund Company");
  broker.text("All-in freight  USD 4,250.00");
  broker.text("Product  Fresh beef trimmings");
  broker.text("Gross lbs  38,400");
  broker.text("Trailer  53 ft refrigerated / continuous");
  broker.text("Setpoint  28 F");
  broker.moveDown();
  broker.text("Collect at");
  broker.text("Hastings Packing");
  broker.text("100 Packer Rd");
  broker.text("Hastings NE 68901");
  broker.text("Appt window  08/21/2026 06:00-10:00");
  broker.text("PU#  HST-441");
  broker.text("Call the yard before arrival.");
  broker.moveDown();
  broker.text("Deliver to");
  broker.text("Westside Foods - KOSHER");
  broker.text("355 Food Center Dr");
  broker.text("Bronx NY 10474");
  broker.text("FCFS  08/24/2026 07:00-15:00");
  broker.text("PO  WSF-8891");
  broker.moveDown();
  broker.text("Second drop");
  broker.text("Kayco Bayonne");
  broker.text("72 New Hook Rd");
  broker.text("Bayonne NJ 07002");
  broker.text("Appointment  08/24/2026 16:00");
  broker.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

main()
  .then(() => writeAscendSample())
  .then(() => writeBrokerSample())
  .then(() => {
    console.log(`Wrote ${out}`);
    console.log(`Wrote ${ascendOut}`);
    console.log(`Wrote ${brokerOut}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
