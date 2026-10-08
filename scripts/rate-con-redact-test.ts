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
const ARTIFACTS = "/opt/cursor/artifacts/rate-con";

const READY = [
  "a-tql-like.pdf",
  "b-ch-robinson-like.pdf",
  "c-echo-like.pdf",
  "d-ms-loads.pdf",
  "g-false-positives.pdf",
];

function absentAmounts(name: string): string[] {
  if (name.startsWith("a-")) return ["$2,150.00", "$186.40", "$2,336.40"];
  if (name.startsWith("b-")) return ["$2.15/mi", "$125.00", "$2,755.50", "2,400.00"];
  if (name.startsWith("c-")) return ["2150.00"];
  if (name.startsWith("d-")) return ["$1,875.00", "$140.00"];
  if (name.startsWith("e-")) return ["$999.00"];
  if (name.startsWith("f-")) return ["$2,400.00"];
  if (name.startsWith("g-")) return ["$640.00"];
  return ["$100", "3,500.00"];
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
  assert.equal(money.textHasExtractableMoney("Temp 34°F PO 123456.00 at 10.30"), false);
  assert.equal(money.textHasExtractableMoney("Total $2,150.00"), true);

  const { buildDriverRateCon, redactStoredRateCon, shutdownDriverRateConOcr } = await import("../lib/rate-con-redact");
  const { extractText } = await import("unpdf");
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const cases = [
    ...READY.map((name) => ({ name, file: path.join(FIXTURE_DIR, name), ready: true })),
    { name: "e-scanned.pdf", file: path.join(FIXTURE_DIR, "e-scanned.pdf"), ready: false },
    { name: "f-form-field.pdf", file: path.join(FIXTURE_DIR, "f-form-field.pdf"), ready: false },
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
  assert.equal(foreign.status, 403);
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
  assert.equal(apiOther.status, 403);
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
