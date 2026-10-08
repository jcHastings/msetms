/**
 * Driver rate-confirmation redaction.
 * Fixtures are fictional. No live broker documents.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-ratecon-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.SESSION_SECRET = "ratecon-redact-test-secret";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.TMS_SCRIPT_DRIVER_ID;

const FIXTURE_DIR = path.join(process.cwd(), "scripts/fixtures/rate-con-redact");
const CB_FIXTURE = path.join(process.cwd(), "scripts/fixtures/cb-logistics-106361.pdf");
const ARTIFACTS = process.env.RATE_CON_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), "rate-con-artifacts-"));

const READY = [
  "a-tql-like.pdf",
  "b-ch-robinson-like.pdf",
  "c-echo-like.pdf",
  "d-ms-loads.pdf",
  "g-false-positives.pdf",
  "h-ms-brokerage.pdf",
  "i-proportional.pdf",
  "j-a4.pdf",
  "m-shared-address.pdf",
  "n-header-logo.pdf",
  "o-neighbor-tonu.pdf",
  "p-invoice-terms.pdf",
  "q-percent.pdf",
  "r-third-party.pdf",
  "s-ascend-header.pdf",
  "u-tonu-label.pdf",
  "v-msexpress-office.pdf",
  "w-times-sliver.pdf",
  "x-glyph-edges.pdf",
  "y-ascend-subset.pdf",
  "z-tql-cap.pdf",
  "aa-ascend-letters.pdf",
  "ab-tm-scale.pdf",
  "ac-trailing-space.pdf",
  "ad-light-frame.pdf",
  "ae-tab-space.pdf",
  "af-per-mile.pdf",
  "ag-grey-header.pdf",
];

function absentAmounts(name: string): string[] {
  if (name.startsWith("a-")) return ["$2,150.00", "$186.40", "$2,336.40"];
  if (name.startsWith("b-")) return ["$2.15/mi", "$125.00", "$2,755.50", "2,400.00"];
  if (name.startsWith("c-")) return ["2150.00"];
  if (name.startsWith("d-")) return ["$1,875.00", "$140.00"];
  if (name.startsWith("e-")) return ["$999.00"];
  if (name.startsWith("f-")) return ["$2,400.00"];
  if (name.startsWith("g-")) return ["$640.00"];
  if (name.startsWith("h-")) return ["1,850.00", "$ 1,850.00", "186.50", "$50/hr", "1.5%"];
  if (name.startsWith("i-")) return ["$15 fee", "$250/Each", "$900.00"];
  if (name.startsWith("j-")) return ["$900.00"];
  if (name.startsWith("k-")) return ["$4,200.00"];
  if (name.startsWith("l-")) return ["$3,100.00"];
  if (name.startsWith("m-")) return ["$1,100.00", "(845) 555-0148"];
  if (name.startsWith("n-")) return ["$900.00"];
  if (name.startsWith("o-")) return ["$2,150.00"];
  if (name.startsWith("p-")) return ["$800.00"];
  if (name.startsWith("q-")) return ["$100 fine", "$640.00"];
  if (name.startsWith("r-")) return ["$900.00"];
  if (name.startsWith("s-")) return ["$900.00", "(845) 555-0162", "billing@msloads.com"];
  if (name.startsWith("t-")) return ["$500.00"];
  if (name.startsWith("u-")) return ["$75", "$2,150.00"];
  if (name.startsWith("v-")) return ["$900.00"];
  if (name.startsWith("w-")) return ["$100,000", "$250", "$100", "$900.00"];
  if (name.startsWith("x-")) return ["$100,000", "$250", "$100", "$900.00"];
  if (name.startsWith("y-")) return ["$30", "$900.00", "MSLOADS.COM"];
  if (name.startsWith("z-")) return ["$30", "$150", "$900.00"];
  if (name.startsWith("aa-")) return ["$900.00", "BILLING@MSLOADS.COM", "MSLOADS"];
  if (name.startsWith("ab-")) return ["$100,000", "$250", "$100", "$900.00"];
  if (name.startsWith("ac-")) return ["$30", "$150", "$900.00"];
  if (name.startsWith("ad-")) return ["$900.00"];
  if (name.startsWith("ae-")) return ["$900.00", "BILLING@MSLOADS.COM", "MSLOADS"];
  if (name.startsWith("af-")) return ["$2.00", "$50", "$900.00"];
  if (name.startsWith("ag-")) return ["$900.00"];
  return ["$100", "3,500.00"];
}

async function pdfPageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, "legacy/build/pdf.worker.mjs")).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: pathToFileURL(path.join(root, "standard_fonts") + path.sep).href,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const view = page.getViewport({ scale: 1 });
    return { width: view.width, height: view.height };
  } finally {
    await task.destroy();
  }
}

function longestDarkRun(data: Uint8ClampedArray): number {
  let run = 0;
  let longest = 0;
  for (let i = 0; i < data.length; i += 4) {
    const dark = data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200;
    run = dark ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/** `$` sits on this side of the money span, so a stem here is a cut amount rather than the next word. */
function moneyDollarSide(token: string | undefined, side: "left" | "right"): boolean {
  if (!token) return true;
  const dollar = token.indexOf("$");
  if (dollar < 0) return true;
  const onLeft = dollar <= token.length / 2;
  return side === "left" ? onLeft : !onLeft;
}

async function assertClearBoxEdges(
  png: Buffer,
  boxes: Array<{ left: number; top: number; w: number; h: number; kind: string; token?: string }>,
): Promise<void> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const stemAt = (x: number, y0: number, height: number): number => {
    if (x < 0 || x >= image.width) return 0;
    return longestDarkRun(ctx.getImageData(x, y0, 1, height).data);
  };
  for (const box of boxes) {
    const y0 = Math.max(0, Math.floor(box.top + box.h * 0.28));
    const y1 = Math.min(image.height - 1, Math.ceil(box.top + box.h * 0.78));
    const height = Math.max(1, y1 - y0);
    const edges: Array<{ x: number; side: "left" | "right" }> = [
      { x: Math.floor(box.left) - 1, side: "left" },
      { x: Math.ceil(box.left + box.w), side: "right" },
    ];
    for (const edge of edges) {
      const longest = stemAt(edge.x, y0, height);
      if (longest < 4) continue;
      // The side away from `$` can sit against the next letter. A stem that
      // continues for another column is that letter; a stem with blank beside
      // it is a cut glyph OCR will miss.
      const strict = box.kind !== "money" || moneyDollarSide(box.token, edge.side);
      if (!strict) {
        const dir = edge.side === "left" ? -1 : 1;
        if (stemAt(edge.x + dir, y0, height) >= 4 || stemAt(edge.x + dir * 2, y0, height) >= 4) continue;
      }
      const label = box.token ? `${box.kind} ${JSON.stringify(box.token)}` : box.kind;
      assert.fail(`${label} ink touches a box edge at x=${edge.x} (${longest} px stem)`);
    }
  }
}

async function ocrPng(png: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { cachePath: path.join(os.tmpdir(), "tms-tesseract") });
  await worker.setParameters({ tessedit_pageseg_mode: "11" });
  const recognized = await worker.recognize(png);
  await worker.terminate();
  return String(recognized.data.text ?? "");
}

async function renderOriginalPng(buffer: Buffer): Promise<Buffer | null> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, "legacy/build/pdf.worker.mjs")).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: pathToFileURL(path.join(root, "standard_fonts") + path.sep).href,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvas,
      viewport,
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    }).promise;
    return canvas.toBuffer("image/png");
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

async function main(): Promise<void> {
  const money = await import("../lib/rate-con-redact-money");
  assert.equal(money.maskMoney("PO 123456.00"), "PO 123456.00");
  assert.equal(money.maskMoney("Temp: 34°F"), "Temp: 34°F");
  assert.equal(money.maskMoney("Setpoint -10 F"), "Setpoint -10 F");
  assert.equal(money.maskMoney("Appointment: 10.30 AM"), "Appointment: 10.30 AM");
  assert.equal(money.maskMoney("Appointment: 10.30"), "Appointment: 10.30");
  assert.equal(money.maskMoney("Weight: 42,500 lbs"), "Weight: 42,500 lbs");
  assert.equal(money.maskMoney("Phone: (402) 555-0199"), "Phone: (402) 555-0199");
  assert.equal(money.maskMoney("Hastings, NE 68901"), "Hastings, NE 68901");
  assert.equal(money.maskMoney("Pickup 08/25/2026 06:00"), "Pickup 08/25/2026 06:00");
  assert.equal(money.maskMoney("Total miles 850"), "Total miles 850");
  assert.equal(money.maskMoney("Detention after 2 hrs"), "Detention after 2 hrs");
  assert.equal(money.maskMoney("Load # 106361"), "Load # 106361");
  assert.equal(money.maskMoney("Rate confirmation 106361"), "Rate confirmation 106361");
  assert.equal(money.maskMoney("Pieces: 1,440"), "Pieces: 1,440");
  assert.match(money.maskMoney("Rate: $2,150.00"), /^Rate: █+$/);
  assert.match(money.maskMoney("Detention after 2 hrs at $50/hr"), /^Detention after 2 hrs at █+$/);
  assert.match(money.maskMoney("2.15 per mile"), /^█+$/);
  assert.match(money.maskMoney("Total: 2475"), /^Total: █+$/);
  assert.match(money.maskMoney("Rate: 2150.00"), /^Rate: █+$/);
  assert.match(money.maskMoney("Quick pay fee 2%"), /^Quick pay fee █+$/);
  assert.doesNotMatch(money.maskMoney("Flat 3,500.00"), /3,500/);
  assert.match(money.maskMoney("$100 fine for missing"), /^█+ fine for missing$/);
  assert.doesNotMatch(money.maskMoney("Flat Rate 1 1,850.00 $ 1,850.00"), /1,850/);
  assert.match(money.maskMoney("Flat Rate 1 1,850.00 $ 1,850.00"), /Flat Rate 1 /);
  assert.doesNotMatch(money.maskMoney("Fuel 1 186.50 $ 186.50"), /186\.50/);
  assert.match(money.maskMoney("Detention 2 hrs free then $50/hr"), /Detention 2 hrs free then /);
  assert.doesNotMatch(money.maskMoney("Detention 2 hrs free then $50/hr"), /\$50/);
  assert.equal(money.maskMoney("1.5%"), "1.5%");
  assert.doesNotMatch(money.maskMoney("1.5%", "Quick pay"), /1\.5/);
  assert.match(money.maskMoney("Appointment 10.30 Rate: 100.00"), /10\.30/);
  assert.doesNotMatch(money.maskMoney("Appointment 10.30 Rate: 100.00"), /100\.00/);
  assert.equal(money.documentIssuedByBrokerage("M&S Loads DBA MS Express"), false);
  assert.equal(money.documentIssuedByBrokerage("M&S Loads LLC\nCarrier: MS Express"), true);
  assert.equal(
    money.documentIssuedByBrokerage("ACME FREIGHT\nRATE CONFIRMATION\nCarrier: M&S Loads DBA MS Express"),
    false,
  );
  assert.equal(money.documentIssuedByBrokerage("ACME FREIGHT\nCarrier: M&S Loads\nPhone: 402-302-0097"), false);
  assert.equal(money.documentIssuedByBrokerage("RATE CONFIRMATION\nBroker: M&S Loads LLC\nCarrier: Other Trucking"), true);
  assert.equal(
    money.documentIssuedByBrokerage("228 East Route 59 Unit 190\nNanuet, NY 10954\nDocket: MC970613\nPhone: (845) 555-0162"),
    true,
  );
  assert.equal(
    money.documentIssuedByBrokerage("M&S Loads\n600 E 39th St · Hastings, NE 68901\nMC 056299\n402-302-0097"),
    false,
  );
  assert.doesNotMatch(money.maskBrokerage("228 East Route 59 Unit 190"), /Unit|190|Route 59/);
  assert.equal(money.brokerageIdentityVisible("Nanuet"), true);
  assert.equal(money.brokerageIdentityVisible("Route 59"), true);
  assert.equal(money.brokerageIdentityVisible("970613"), true);
  assert.equal(money.brokerageIdentityVisible("billing@msloads.com"), true);
  assert.equal(money.brokerageIdentityVisible("Deerfield Beach"), true);
  assert.equal(money.brokerageIdentityVisible("M&S Loads LLC"), true);
  assert.equal(money.brokerageIdentityVisible("M & S LOADS LLC"), true);
  assert.equal(money.brokerageIdentityVisible("M & S Loads"), true);
  assert.equal(money.brokerageIdentityVisible("brokerage & logistics"), true);
  assert.equal(money.brokerageIdentityVisible("845-694-6059"), true);
  assert.equal(money.brokerageIdentityVisible("845.694.6059"), true);
  assert.equal(money.brokerageIdentityVisible("Unit 190"), true);
  assert.equal(money.brokerageIdentityVisible("Nanuet, NY 10954"), true);
  assert.equal(money.brokerageIdentityVisible("M & S Rate Confirmation"), true);
  assert.equal(money.brokerageIdentityVisible("MSLOADS.COM"), true);
  assert.equal(money.brokerageIdentityVisible("ar@msloads.com"), false);
  assert.equal(money.brokerageIdentityVisible("AR@MSLOADS.COM"), false);
  assert.equal(money.brokerageIdentityVisible("billing@msloads.com"), true);
  assert.equal(money.brokerageIdentityVisible("M&S Loads DBA MS Express"), false);
  assert.equal(money.brokerageIdentityVisible("Carrier: M&S Loads DBA MS Express"), false);
  assert.equal(money.documentIsMsExpressCarrier("M&S Loads\n600 E 39th St · Hastings, NE 68901\n402-302-0097"), true);
  assert.equal(money.documentIsMsExpressCarrier("228 East Route 59 Unit 190\nNanuet, NY 10954"), false);
  assert.equal(money.findBareMsLoadsSpans("M&S Loads DBA MS Express").length, 0);
  assert.equal(money.findBareMsLoadsSpans("M&S Loads").length, 1);
  assert.match(money.maskBrokerage("M&S Loads DBA MS Express"), /M&S Loads DBA MS Express/);
  assert.doesNotMatch(money.maskBrokerage("M&S Loads LLC"), /M&S/);
  assert.doesNotMatch(money.maskBrokerage("MC-970613"), /970613/);
  assert.doesNotMatch(money.maskBrokerage("228 East Route 59 #190, Nanuet, NY 10954"), /Nanuet|Route 59|10954/);
  assert.doesNotMatch(money.maskBrokerage("Deerfield Beach, FL 33441"), /Deerfield|33441/);
  const shared = money.maskBrokerage("228 East Route 59 #190, Nanuet, NY 10954  Reefer  53'");
  assert.match(shared, /Reefer/);
  assert.match(shared, /53'/);
  assert.doesNotMatch(shared, /Nanuet|10954|Route 59/);
  assert.equal(money.maskBrokerage("Date: 08/25/2026"), "Date: 08/25/2026");
  assert.equal(money.maskBrokerage("Temperature: 34°F"), "Temperature: 34°F");
  assert.match(money.maskBrokerage("Deerfield Beach, FL 33441   Due Date: 09/01/2026"), /Due Date/);
  assert.match(money.maskBrokerage("Deerfield Beach, FL 33441   Due Date: 09/01/2026"), /09\/01\/2026/);
  assert.doesNotMatch(money.maskBrokerage("Phone: (845) 555-0148", { letterhead: true }), /845/);
  assert.match(money.maskBrokerage("Phone: (845) 555-0148", { letterhead: true }), /Phone/);
  assert.match(money.maskBrokerage("Phone: 402-302-0097", { letterhead: true }), /402-302-0097/);
  assert.equal(money.maskBrokerage("Phone: (531) 555-0144"), "Phone: (531) 555-0144");
  assert.equal(money.maskBrokerage("Esti Katz"), "Esti Katz");
  assert.doesNotMatch(money.maskBrokerage("Maria Lopez (M & S LOADS LLC.)"), /Maria|Lopez|LOADS|[().]/);
  assert.doesNotMatch(money.maskBrokerage("Esti Katz  esti.katz@msloads.com  (845) 555-0170"), /Esti|msloads|845/);
  assert.match(money.maskBrokerage("ar@msloads.com"), /ar@msloads\.com/);
  assert.doesNotMatch(money.maskBrokerage("M & S Rate Confirmation"), /M\s*&\s*S|Rate/);
  assert.doesNotMatch(money.maskBrokerage("EMAILED TO BILLING@MSLOADS.COM We"), /msloads/i);
  assert.match(money.maskBrokerage("EMAILED TO BILLING@MSLOADS.COM We"), /\bWe\b/);
  assert.equal(
    money.maskBrokerage("Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901"),
    "Pickup: Hastings Packing, 100 Packer Rd, Hastings, NE 68901",
  );
  assert.equal(money.textHasExtractableMoney("Temp 34°F PO 123456.00 at 10.30"), false);
  assert.equal(money.textHasExtractableMoney("Total $2,150.00"), true);

  const { buildDriverRateCon, glyphAdvanceStats, ocrDollarLeak, officeOnlyPageReason, redactStoredRateCon, redactionBoxes, shutdownDriverRateConOcr } = await import("../lib/rate-con-redact");
  assert.match(officeOnlyPageReason("INVOICE\nTotal $1"), /invoice/i);
  assert.match(officeOnlyPageReason("Customer Confirmation"), /customer confirmation/i);
  assert.match(officeOnlyPageReason("Bill of Lading"), /bill of lading/i);
  assert.match(officeOnlyPageReason("Invoice # 1001\nTotal $1"), /invoice/i);
  assert.match(officeOnlyPageReason("Invoice No 1001"), /invoice/i);
  assert.equal(officeOnlyPageReason("RATE CONFIRMATION"), "");
  assert.equal(
    officeOnlyPageReason(
      "RATE CONFIRMATION\nEMAIL your invoice to ap@example.test\nPayment upon receipt of invoice.\nSign the bill of lading at delivery.",
    ),
    "",
  );
  assert.equal(ocrDollarLeak("100 percent (100%) on time", "A $100 fine applies"), null);
  assert.equal(ocrDollarLeak("100%", "A $100 fine applies"), null);
  assert.equal(ocrDollarLeak("100", "A $100 fine applies"), "100");
  const { extractText } = await import("unpdf");
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const cases = [
    ...READY.map((name) => ({ name, file: path.join(FIXTURE_DIR, name), ready: true })),
    { name: "e-scanned.pdf", file: path.join(FIXTURE_DIR, "e-scanned.pdf"), ready: false },
    { name: "f-form-field.pdf", file: path.join(FIXTURE_DIR, "f-form-field.pdf"), ready: false },
    { name: "k-invoice.pdf", file: path.join(FIXTURE_DIR, "k-invoice.pdf"), ready: false },
    { name: "l-customer-confirmation.pdf", file: path.join(FIXTURE_DIR, "l-customer-confirmation.pdf"), ready: false },
    { name: "t-identity-guard.pdf", file: path.join(FIXTURE_DIR, "t-identity-guard.pdf"), ready: false },
    { name: "cb-logistics-106361.pdf", file: CB_FIXTURE, ready: true },
  ];

  for (const item of cases) {
    assert.equal(fs.existsSync(item.file), true, item.name);
    const source = fs.readFileSync(item.file);
    const built = await buildDriverRateCon(source);
    assert.ok(built.pdf, `${item.name} produced no driver copy`);
    assert.ok(built.pagePngs.length >= 1, item.name);
    if (item.ready) {
      assert.equal(built.status, "ready", `${item.name} ${built.reason} ${built.verification}`);
      assert.equal(built.verification, "ok", item.name);
      assert.ok(built.amountsFound >= 1, item.name);
    } else {
      assert.equal(built.status, "needs_review", item.name);
      assert.notEqual(built.status, "ready");
    }
    if (item.name.startsWith("e-")) assert.match(built.reason, /Scanned or image-only/);
    if (item.name.startsWith("f-")) assert.match(built.reason, /annotation or form field/);
    if (item.name.startsWith("k-")) assert.match(built.reason, /invoice/i);
    if (item.name.startsWith("l-")) assert.match(built.reason, /customer confirmation/i);
    if (item.name.startsWith("t-")) assert.match(built.reason, /brokerage identity visible/i);
    const raw = built.pdf.toString("latin1");
    assert.equal(raw.includes("SECRET-BROKER-META"), false, item.name);
    assert.doesNotMatch(raw, /\/Annots\s*\[\s*[^\s\]]/, item.name);
    assert.doesNotMatch(raw, /\/AcroForm\b/, item.name);
    assert.equal(raw.includes("<?xpacket"), false, item.name);
    for (const secret of absentAmounts(item.name)) {
      assert.equal(raw.includes(secret), false, `${item.name} still contains ${secret}`);
    }
    const extracted = await extractText(new Uint8Array(built.pdf), { mergePages: true });
    const text = String(extracted.text ?? "");
    assert.equal(money.textHasExtractableMoney(text), false, `${item.name} extractable money: ${text.slice(0, 180)}`);
    assert.doesNotMatch(text, /\$\s*\d/, item.name);
    const before = await renderOriginalPng(source);
    const stem = item.name.replace(/\.pdf$/, "");
    if (before) fs.writeFileSync(path.join(ARTIFACTS, `${stem}-original.png`), before);
    fs.writeFileSync(path.join(ARTIFACTS, `${stem}-driver.png`), built.pagePngs[0]);
    if (built.pagePngs[1]) fs.writeFileSync(path.join(ARTIFACTS, `${stem}-driver-p2.png`), built.pagePngs[1]);
    if (item.name.startsWith("j-") || item.name.startsWith("a-")) {
      const size = await pdfPageSize(built.pdf);
      if (item.name.startsWith("j-")) {
        assert.ok(Math.abs(size.width - 595.28) < 2, `A4 width ${size.width}`);
        assert.ok(Math.abs(size.height - 841.89) < 2, `A4 height ${size.height}`);
      } else {
        assert.ok(Math.abs(size.width - 612) < 2, `letter width ${size.width}`);
        assert.ok(Math.abs(size.height - 792) < 2, `letter height ${size.height}`);
      }
    }
    if (item.name.startsWith("h-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /970613|Nanuet|Deerfield|msloads\.com|Esti|M\s*&\s*S/i, seen.slice(0, 500));
      assert.match(seen, /Hastings|Packing|Bronx|Westside/i, seen.slice(0, 500));
    }
    if (item.name.startsWith("m-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /Reefer/i, seen.slice(0, 800));
      assert.match(seen, /53/, seen.slice(0, 800));
      assert.match(seen, /34/, seen.slice(0, 800));
      assert.match(seen, /2026|08\/25/, seen.slice(0, 800));
      assert.match(seen, /402/, seen.slice(0, 800));
      assert.match(seen, /531|0144/, seen.slice(0, 800));
      assert.match(seen, /Packing|Hast/i, seen.slice(0, 800));
      assert.doesNotMatch(seen, /Nanuet|970613|845|Maria|Lopez|msloads/i, seen.slice(0, 800));
    }
    if (item.name.startsWith("n-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /MSLOADSLOGO/i, seen.slice(0, 800));
      assert.match(seen, /SHIPPERMARK/i, seen.slice(0, 800));
      assert.match(seen, /Packing|Hast/i, seen.slice(0, 800));
    }
    if (item.name.startsWith("o-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /TONU/i, seen.slice(0, 500));
    }
    if (item.name.startsWith("r-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /M\s*&\s*S\s+Loads|M&S/i, seen.slice(0, 500));
      assert.match(seen, /402/, seen.slice(0, 500));
    }
    if (item.name.startsWith("s-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /Nanuet|970613|845|Maria|Lopez|billing@msloads|Route\s*59|Unit\s*190|M\s*&\s*S\s+LOADS/i, seen.slice(0, 900));
      assert.match(seen, /Packing|Hast/i, seen.slice(0, 900));
    }
    if (item.name.startsWith("u-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /TONU/i, seen.slice(0, 500));
    }
    if (item.name.startsWith("v-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /MSEXPRESSLOGO/i, seen.slice(0, 700));
      assert.match(seen, /dispatch|dbspatch|@/i, seen.slice(0, 700));
      assert.match(seen, /402/, seen.slice(0, 700));
      assert.match(seen, /Hast|39th/i, seen.slice(0, 700));
      assert.match(seen, /DBA/i, seen.slice(0, 700));
      assert.doesNotMatch(seen, /M\s*&\s*S\s+Loads(?!\s+DBA)/i, seen.slice(0, 700));
      const { createCanvas, loadImage } = await import("@napi-rs/canvas");
      const frameImage = await loadImage(built.pagePngs[0]);
      const frameCanvas = createCanvas(frameImage.width, frameImage.height);
      const frameCtx = frameCanvas.getContext("2d");
      frameCtx.drawImage(frameImage, 0, 0);
      const frameX = Math.round(248 * 2);
      const frame = frameCtx.getImageData(frameX - 1, 80, 3, 50).data;
      let frameInk = 0;
      for (let i = 0; i < frame.length; i += 4) {
        if (frame[i] < 80 && frame[i + 1] < 80 && frame[i + 2] < 80) frameInk += 1;
      }
      assert.ok(frameInk > 20, `header frame covered beside M&S Loads (${frameInk})`);
    }
    if (item.name.startsWith("w-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 800));
      assert.match(seen, /\bof\b/i, seen.slice(0, 800));
      assert.match(seen, /Each/, seen.slice(0, 800));
      assert.match(seen, /each/, seen.slice(0, 800));
    }
    if (item.name.startsWith("x-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 1200));
      assert.doesNotMatch(seen, /10954/, seen.slice(0, 1200));
      assert.match(seen, /\bby\b/, seen.slice(0, 1200));
      assert.match(seen, /\bof\b/i, seen.slice(0, 1200));
      assert.match(seen, /Each/, seen.slice(0, 1200));
      assert.match(seen, /each/, seen.slice(0, 1200));
    }
    if (item.name.startsWith("y-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 1400));
      assert.doesNotMatch(seen, /M\s*&\s*S/i, seen.slice(0, 1400));
      assert.doesNotMatch(seen, /LLC\./, seen.slice(0, 1400));
      assert.doesNotMatch(seen, /msloads/i, seen.slice(0, 1400));
      assert.doesNotMatch(seen, /ads/i, seen.slice(0, 1400));
      assert.match(seen, /\bThe\b/, seen.slice(0, 1400));
      assert.match(seen, /\bby\b/, seen.slice(0, 1400));
      assert.match(seen, /\bto\b/i, seen.slice(0, 1400));
      assert.match(seen, /\binform\b/i, seen.slice(0, 1400));
    }
    if (item.name.startsWith("z-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 800));
      assert.match(seen, /thereafter,\s*cap/i, seen.slice(0, 800));
    }
    if (item.name.startsWith("aa-") || item.name.startsWith("ab-") || item.name.startsWith("ac-") || item.name.startsWith("ae-") || item.name.startsWith("af-")) {
      const stats = glyphAdvanceStats();
      assert.ok(stats.used > 0, `${item.name} glyph path used ${stats.used}`);
      assert.equal(stats.fallback, 0, `${item.name} glyph fallback ${stats.fallback}`);
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 1400));
      if (item.name.startsWith("aa-")) {
        assert.doesNotMatch(seen, /M\s*&\s*S/i, seen.slice(0, 1400));
        assert.doesNotMatch(seen, /LLC/i, seen.slice(0, 1400));
        assert.doesNotMatch(seen, /msloads/i, seen.slice(0, 1400));
        assert.match(seen, /\bto\b/i, seen.slice(0, 1400));
        assert.match(seen, /\bby\b/, seen.slice(0, 1400));
        assert.match(seen, /\bWe\b/, seen.slice(0, 1400));
      }
      if (item.name.startsWith("ab-")) {
        assert.match(seen, /\bof\b/i, seen.slice(0, 1400));
        assert.match(seen, /Each/, seen.slice(0, 1400));
      }
      if (item.name.startsWith("ac-")) {
        assert.match(seen, /thereafter,\s*cap/i, seen.slice(0, 1400));
      }
      if (item.name.startsWith("ae-")) {
        assert.doesNotMatch(seen, /M\s*&\s*S/i, seen.slice(0, 1400));
        assert.doesNotMatch(seen, /LLC/i, seen.slice(0, 1400));
        assert.doesNotMatch(seen, /msloads/i, seen.slice(0, 1400));
        assert.match(seen, /\bto\b/i, seen.slice(0, 1400));
        assert.match(seen, /\bby\b/, seen.slice(0, 1400));
        assert.match(seen, /\bWe\b/, seen.slice(0, 1400));
      }
      if (item.name.startsWith("af-")) {
        assert.match(seen, /\bTO\b/, seen.slice(0, 1400));
        assert.match(seen, /RELOCATE/, seen.slice(0, 1400));
        assert.match(seen, /\bPAY\b/, seen.slice(0, 1400));
        assert.match(seen, /thereafter/i, seen.slice(0, 1400));
      }
      await assertClearBoxEdges(built.pagePngs[0], redactionBoxes()[0] ?? []);
    }
    if (item.name.startsWith("ad-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.match(seen, /DBA/i, seen.slice(0, 800));
      assert.doesNotMatch(seen, /M\s*&\s*S\s+Loads(?!\s+DBA)/i, seen.slice(0, 800));
      const { createCanvas, loadImage } = await import("@napi-rs/canvas");
      const frameImage = await loadImage(built.pagePngs[0]);
      const frameCanvas = createCanvas(frameImage.width, frameImage.height);
      const frameCtx = frameCanvas.getContext("2d");
      frameCtx.drawImage(frameImage, 0, 0);
      const frameX = Math.round(248 * 2);
      let columns = 0;
      for (let dx = -3; dx <= 4; dx += 1) {
        const column = frameCtx.getImageData(frameX + dx, 80, 1, 40).data;
        let ink = 0;
        for (let i = 0; i < column.length; i += 4) {
          if (column[i] < 250 || column[i + 1] < 250 || column[i + 2] < 250) ink += 1;
        }
        if (ink > 8) columns += 1;
      }
      assert.ok(columns >= 2, `light frame thinned to ${columns} column(s)`);
    }
    if (item.name.startsWith("ag-")) {
      const seen = await ocrPng(built.pagePngs[0]);
      assert.doesNotMatch(seen, /\$/, seen.slice(0, 800));
      assert.match(seen, /due on/i, seen.slice(0, 800));
      assert.match(seen, /Agreed/i, seen.slice(0, 800));
      const money = (redactionBoxes()[0] ?? []).filter((box) => box.kind === "money");
      assert.ok(money.length >= 1, "grey header money box");
      const { createCanvas, loadImage } = await import("@napi-rs/canvas");
      const cellImage = await loadImage(built.pagePngs[0]);
      const cellCanvas = createCanvas(cellImage.width, cellImage.height);
      const cellCtx = cellCanvas.getContext("2d");
      cellCtx.drawImage(cellImage, 0, 0);
      for (const box of money) {
        const x = Math.max(0, Math.floor(box.left) + 2);
        const y = Math.max(0, Math.floor(box.top + box.h * 0.3));
        const w = Math.max(1, Math.floor(box.w) - 4);
        const h = Math.max(1, Math.floor(box.h * 0.4));
        const data = cellCtx.getImageData(x, y, w, h).data;
        let ink = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink += 1;
        }
        assert.equal(ink, 0, `residual ink in the dollar cell (${ink})`);
      }
    }
  }

  const queries = await import("../lib/queries");
  const files = await import("../lib/files");
  const store = await import("../lib/rate-con-redact-store");
  const access = await import("../lib/rate-con-redact-access");
  const { issueDriverApiToken } = await import("../lib/driver-api");

  const customerId = queries.createCustomer({
    name: "M&S Loads",
    billing_notes: "",
    contacts: [],
  });
  const driverA = queries.createDriver({
    name: "Alex Rivera",
    phone: "4025550101",
    email: "alex.rivera@example.test",
    license: "NE-1",
    truck_id: null,
    status: "available",
  });
  const driverB = queries.createDriver({
    name: "Blake Chen",
    phone: "4025550102",
    email: "blake.chen@example.test",
    license: "NE-2",
    truck_id: null,
    status: "available",
  });
  const when = "2026-10-08T14:00:00.000Z";
  const later = "2026-10-09T14:00:00.000Z";
  function makeLoad(driverId: number, number: string): number {
    return queries.createLoad({
      load_number: number,
      customer_id: customerId,
      origin: "Hastings, NE",
      destination: "Dallas, TX",
      pickup_start: when,
      pickup_end: when,
      delivery_start: later,
      delivery_end: later,
      weight: 40000,
      commodity: "Frozen freight",
      rate: 1800,
      notes: "",
      special_instructions: "Keep 34 F",
      appointment_notes: "10.30",
      reference_number: "PO-1",
      po_number: "123456.00",
      reefer_setpoint_f: 34,
      trailer_number: "",
      status: "dispatched",
      truck_id: null,
      driver_id: driverId,
    });
  }
  const loadA = makeLoad(driverA, "MSE-RED-1");
  const loadB = makeLoad(driverB, "MSE-RED-2");
  const original = files.addAttachment({
    loadId: loadA,
    kind: "rate_con",
    originalName: "broker-rate-con.pdf",
    buffer: fs.readFileSync(path.join(FIXTURE_DIR, "a-tql-like.pdf")),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const released = await redactStoredRateCon(original.id);
  assert.equal(released?.status, "ready");
  assert.ok(released?.stored_name);

  const scanned = files.addAttachment({
    loadId: loadA,
    kind: "rate_con",
    originalName: "scan.pdf",
    buffer: fs.readFileSync(path.join(FIXTURE_DIR, "e-scanned.pdf")),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const held = await redactStoredRateCon(scanned.id);
  assert.equal(held?.status, "needs_review");

  const other = files.addAttachment({
    loadId: loadB,
    kind: "rate_con",
    originalName: "other-broker.pdf",
    buffer: fs.readFileSync(path.join(FIXTURE_DIR, "d-ms-loads.pdf")),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const otherCopy = await redactStoredRateCon(other.id);
  assert.equal(otherCopy?.status, "ready");

  const attachmentRoute = await import("../app/api/attachments/[id]/route");
  const redactionRoute = await import("../app/api/rate-con-redactions/[id]/route");
  const apiRoute = await import("../app/api/driver/v1/loads/[id]/rate-confirmation/[redactionId]/route");
  const detailRoute = await import("../app/api/driver/v1/loads/[id]/route");

  async function statusOf(handler: (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>, url: string, params: Record<string, string>): Promise<number> {
    const response = await handler(new Request(url), { params: Promise.resolve(params) });
    return response.status;
  }

  for (const url of [
    `http://localhost/api/attachments/${original.id}`,
    `http://localhost/api/attachments/${original.id}?download=1`,
    `http://localhost/api/attachments/${original.id}?download=1&inline=1`,
  ]) {
    const anon = await statusOf(attachmentRoute.GET, url, { id: String(original.id) });
    assert.ok(anon === 403 || anon === 404, `anon original ${url} → ${anon}`);
    process.env.TMS_SCRIPT_DRIVER_ID = String(driverA);
    const driverStatus = await statusOf(attachmentRoute.GET, url, { id: String(original.id) });
    delete process.env.TMS_SCRIPT_DRIVER_ID;
    assert.ok(driverStatus === 403 || driverStatus === 404, `driver original ${url} → ${driverStatus}`);
  }

  process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";
  const officeOriginal = await attachmentRoute.GET(new Request(`http://localhost/api/attachments/${original.id}`), {
    params: Promise.resolve({ id: String(original.id) }),
  });
  assert.equal(officeOriginal.status, 200);
  assert.match(Buffer.from(await officeOriginal.arrayBuffer()).toString("latin1"), /%PDF/);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;

  assert.equal(
    access.decideRedactionAccess({ redactionId: held!.id, office: false, driverId: driverA }).ok,
    false,
  );
  process.env.TMS_SCRIPT_DRIVER_ID = String(driverA);
  const unreleased = await redactionRoute.GET(new Request(`http://localhost/api/rate-con-redactions/${held!.id}`), {
    params: Promise.resolve({ id: String(held!.id) }),
  });
  assert.equal(unreleased.status, 404);
  const own = await redactionRoute.GET(new Request(`http://localhost/api/rate-con-redactions/${released!.id}?download=1`), {
    params: Promise.resolve({ id: String(released!.id) }),
  });
  assert.equal(own.status, 200);
  const ownBytes = Buffer.from(await own.arrayBuffer());
  const ownText = await extractText(new Uint8Array(ownBytes), { mergePages: true });
  assert.equal(money.textHasExtractableMoney(String(ownText.text ?? "")), false);
  assert.equal(ownBytes.includes("$2,150.00"), false);
  const foreign = await redactionRoute.GET(new Request(`http://localhost/api/rate-con-redactions/${otherCopy!.id}`), {
    params: Promise.resolve({ id: String(otherCopy!.id) }),
  });
  assert.equal(foreign.status, 404);

  const samplePdf = fs.readFileSync(path.join(FIXTURE_DIR, "a-tql-like.pdf"));
  const bol = files.addAttachment({
    loadId: loadA,
    kind: "bol",
    originalName: "signed-bol.pdf",
    buffer: samplePdf,
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const needsType = files.addAttachment({
    loadId: loadA,
    kind: "unclassified",
    originalName: "needs-type.pdf",
    buffer: samplePdf,
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  const carrierBill = files.addAttachment({
    loadId: loadA,
    kind: "carrier_invoice",
    originalName: "carrier-bill.pdf",
    buffer: samplePdf,
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  process.env.TMS_SCRIPT_DRIVER_ID = String(driverA);
  assert.equal(
    await statusOf(attachmentRoute.GET, `http://localhost/api/attachments/${bol.id}`, { id: String(bol.id) }),
    200,
  );
  assert.equal(
    await statusOf(attachmentRoute.GET, `http://localhost/api/attachments/${needsType.id}`, { id: String(needsType.id) }),
    404,
  );
  assert.equal(
    await statusOf(attachmentRoute.GET, `http://localhost/api/attachments/${carrierBill.id}`, { id: String(carrierBill.id) }),
    404,
  );
  delete process.env.TMS_SCRIPT_DRIVER_ID;
  process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";
  const officeNeedsType = await attachmentRoute.GET(new Request(`http://localhost/api/attachments/${needsType.id}`), {
    params: Promise.resolve({ id: String(needsType.id) }),
  });
  assert.equal(officeNeedsType.status, 200);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;
  delete process.env.TMS_SCRIPT_DRIVER_ID;

  const anonCopy = await redactionRoute.GET(new Request(`http://localhost/api/rate-con-redactions/${released!.id}`), {
    params: Promise.resolve({ id: String(released!.id) }),
  });
  assert.ok(anonCopy.status === 403 || anonCopy.status === 404);

  const tokenA = issueDriverApiToken(driverA).token;
  const tokenB = issueDriverApiToken(driverB).token;
  const apiOwn = await apiRoute.GET(new Request("http://localhost/api/driver/v1/rate", { headers: { authorization: `Bearer ${tokenA}` } }), {
    params: Promise.resolve({ id: String(loadA), redactionId: String(released!.id) }),
  });
  assert.equal(apiOwn.status, 200);
  const apiOther = await apiRoute.GET(new Request("http://localhost/api/driver/v1/rate", { headers: { authorization: `Bearer ${tokenA}` } }), {
    params: Promise.resolve({ id: String(loadB), redactionId: String(otherCopy!.id) }),
  });
  assert.equal(apiOther.status, 404);
  const apiHeld = await apiRoute.GET(new Request("http://localhost/api/driver/v1/rate", { headers: { authorization: `Bearer ${tokenA}` } }), {
    params: Promise.resolve({ id: String(loadA), redactionId: String(held!.id) }),
  });
  assert.equal(apiHeld.status, 404);
  const apiAnon = await apiRoute.GET(new Request("http://localhost/api/driver/v1/rate"), {
    params: Promise.resolve({ id: String(loadA), redactionId: String(released!.id) }),
  });
  assert.ok(apiAnon.status === 403 || apiAnon.status === 404);

  const detail = await detailRoute.GET(new Request("http://localhost/api/driver/v1/loads/" + loadA, { headers: { authorization: `Bearer ${tokenA}` } }), {
    params: Promise.resolve({ id: String(loadA) }),
  });
  assert.equal(detail.status, 200);
  const body = (await detail.json()) as {
    attachments: Array<{ id: number; kind: string }>;
    rate_confirmations: Array<{ id: number; name: string; href: string }>;
    customer_name: string;
  };
  assert.equal(body.attachments.some((file) => file.id === original.id || file.kind === "rate_con"), false);
  assert.equal(body.attachments.some((file) => file.kind === "unclassified" || file.kind === "carrier_invoice"), false);
  assert.equal(body.attachments.some((file) => file.id === bol.id && file.kind === "bol"), true);
  assert.equal(JSON.stringify(body.attachments).includes("broker-rate-con"), false);
  assert.equal(body.rate_confirmations.some((row) => row.id === released!.id), true);
  assert.equal(body.rate_confirmations.some((row) => row.id === held!.id), false);
  assert.equal(body.rate_confirmations.some((row) => row.id === otherCopy!.id), false);
  assert.match(body.rate_confirmations[0].name, /Rate confirmation/);
  assert.doesNotMatch(body.rate_confirmations[0].href, /attachments/);
  const detailB = await detailRoute.GET(
    new Request("http://localhost/api/driver/v1/loads/" + loadA, { headers: { authorization: `Bearer ${tokenB}` } }),
    { params: Promise.resolve({ id: String(loadA) }) },
  );
  assert.ok(detailB.status === 403 || detailB.status === 404);

  const backfillSource = files.addAttachment({
    loadId: loadA,
    kind: "rate_con",
    originalName: "already-on-file.pdf",
    buffer: fs.readFileSync(path.join(FIXTURE_DIR, "c-echo-like.pdf")),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const dry = spawnSync("npx", ["tsx", "scripts/backfill-rate-con-redactions.ts"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run/);
  assert.match(dry.stdout, new RegExp(`attachment ${backfillSource.id}`));
  assert.equal(store.getRateConRedactionBySource(backfillSource.id), null);
  const applied = spawnSync("npx", ["tsx", "scripts/backfill-rate-con-redactions.ts", "--apply"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(applied.status, 0, applied.stderr);
  const backfilled = store.getRateConRedactionBySource(backfillSource.id);
  assert.equal(backfilled?.status, "needs_review");
  assert.match(backfilled?.reason ?? "", /Backfill held for office review/);
  process.env.TMS_SCRIPT_DRIVER_ID = String(driverA);
  const backfillFetch = await redactionRoute.GET(new Request(`http://localhost/api/rate-con-redactions/${backfilled!.id}`), {
    params: Promise.resolve({ id: String(backfilled!.id) }),
  });
  delete process.env.TMS_SCRIPT_DRIVER_ID;
  assert.equal(backfillFetch.status, 404);

  const driverPage = fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/rate-confirmation/page.tsx"), "utf8");
  assert.match(driverPage, /Rate confirmation/);
  assert.match(driverPage, /company_name/);
  assert.doesNotMatch(driverPage, /customer_name|formatMoney|rate_con_amount/);
  const loadPage = fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8");
  assert.match(loadPage, /data-driver-rate-confirmation/);
  assert.doesNotMatch(loadPage, /formatMoney\(load\.rate\)/);
  const office = fs.readFileSync(path.join(process.cwd(), "components/rate-con-redaction-panel.tsx"), "utf8");
  assert.match(office, /Release to driver/);
  assert.match(office, /Re-run/);
  assert.match(office, /Keep office-only/);
  assert.match(office, /View redacted copy/);
  const editor = fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8");
  assert.match(editor, /data-rate-con-review-flag/);
  const attachmentSource = fs.readFileSync(path.join(process.cwd(), "app/api/attachments/[id]/route.ts"), "utf8");
  assert.match(attachmentSource, /driver && isCustomerRateDocument/);

  await shutdownDriverRateConOcr();
  console.log("rate-con redaction tests passed");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
