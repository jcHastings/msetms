/**
 * Paystub upload: parser, name match, token auth, duplicates, and driver access.
 * Fixture PDFs use made-up names. No live calls.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-paystub-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.SESSION_SECRET = "paystub-test-session-secret";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.TMS_SCRIPT_DRIVER_ID;
delete process.env.PAYSTUB_UPLOAD_TOKEN;

const TOKEN = "paystub-test-token";

async function renderStub(lines: string[]): Promise<Buffer> {
  const PDFDocument = (await import("../lib/pdfkit-document")).default;
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 72 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(12);
    for (const line of lines) doc.text(line);
    doc.end();
  });
}

function pdfFile(name: string, bytes: Buffer): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

async function main(): Promise<void> {
  const shared = await import("../lib/paystub-shared");
  assert.deepEqual(shared.personNameTokens("Haul, Casey M."), ["casey", "haul"]);
  assert.deepEqual(shared.personNameTokens("CASEY J. HAUL"), ["casey", "haul"]);
  assert.equal(shared.namesMatchExact("Haul, Casey M.", "Casey Haul"), true);
  assert.equal(shared.namesMatchExact("Casey J. Haul", "Casey Haul"), true);
  assert.equal(shared.namesMatchExact("O'Neil, Pat", "Pat ONeil"), true);
  assert.equal(shared.namesMatchExact("Pat Local", "Casey Haul"), false);
  assert.equal(shared.namesMatchExact("Haul", "Casey Haul"), false);

  const drivers = [
    { id: 1, name: "Casey Haul", driverType: "company_driver" },
    { id: 2, name: "Jordan Miles", driverType: "company_driver" },
    { id: 3, name: "Riley North", driverType: "owner_operator" },
    { id: 4, name: "Pat Local", driverType: "company_driver" },
  ];
  assert.equal(shared.matchPaystubEmployee("Haul, Casey M.", drivers).driverId, 1);
  assert.equal(shared.matchPaystubEmployee("CASEY J. HAUL", drivers).state, "matched");
  const partial = shared.matchPaystubEmployee("Haul", drivers);
  assert.equal(partial.state, "low_confidence");
  assert.equal(partial.driverId, null);
  const owner = shared.matchPaystubEmployee("Riley North", drivers);
  assert.equal(owner.state, "owner_operator");
  assert.equal(owner.driverId, null);
  const twins = shared.matchPaystubEmployee("Casey Haul", [
    ...drivers,
    { id: 9, name: "Casey Haul", driverType: "company_driver" },
  ]);
  assert.equal(twins.state, "low_confidence");
  assert.equal(twins.driverId, null);
  const companyWins = shared.matchPaystubEmployee("Riley North", [
    ...drivers,
    { id: 8, name: "Riley North", driverType: "company_driver" },
  ]);
  assert.equal(companyWins.state, "matched");
  assert.equal(companyWins.driverId, 8);

  const labeled = shared.parsePaystubText(
    ["Employee name: Haul, Casey M.", "Pay date: 10/03/2026", "Pay period: 09/21/2026 - 09/27/2026", "Gross pay: $1,840.00 YTD $22,080.00", "Net pay: $1,412.55"].join("\n"),
  );
  assert.equal(labeled.employeeName, "Haul, Casey M.");
  assert.equal(labeled.payDate, "2026-10-03");
  assert.equal(labeled.periodStart, "2026-09-21");
  assert.equal(labeled.periodEnd, "2026-09-27");
  assert.equal(labeled.gross, "1840.00");
  assert.equal(labeled.net, "1412.55");

  const stacked = shared.parsePaystubText(
    ["Employee", "Jordan Miles", "Check date", "October 3, 2026", "Pay period", "September 21, 2026 - September 27, 2026", "Gross earnings", "$900.00", "Net pay", "$700.50"].join("\n"),
  );
  assert.equal(stacked.employeeName, "Jordan Miles");
  assert.equal(stacked.payDate, "2026-10-03");
  assert.equal(stacked.periodStart, "2026-09-21");
  assert.equal(stacked.periodEnd, "2026-09-27");
  assert.equal(stacked.gross, "900.00");
  assert.equal(stacked.net, "700.50");

  const missingMoney = shared.parsePaystubText("Employee name: Casey Haul\nPay date: 10/03/2026\n");
  assert.deepEqual(shared.missingPaystubFields(missingMoney).sort(), ["gross", "net", "period end", "period start"]);

  const low = shared.decidePaystub({
    parsed: { employeeName: "Haul", payDate: "2026-10-03", periodStart: "2026-09-21", periodEnd: "2026-09-27", gross: "10.00", net: "8.00" },
    drivers,
  });
  assert.equal(low.outcome, "needs_review");
  assert.equal(low.attachDriverId, null);
  assert.equal(low.suggestedDriverId, null);

  const caseyPdf = await renderStub([
    "Employee name: Haul, Casey M.",
    "Pay date: 10/03/2026",
    "Pay period: 09/21/2026 - 09/27/2026",
    "Gross pay: $1,840.00",
    "Net pay: $1,412.55",
  ]);
  const jordanPdf = await renderStub([
    "Employee",
    "Jordan Miles",
    "Pay date",
    "10/03/2026",
    "Pay period",
    "09/21/2026 - 09/27/2026",
    "Gross pay",
    "$900.00",
    "Net pay",
    "$700.50",
  ]);
  const unknownPdf = await renderStub([
    "Employee name: Quinn Harper",
    "Pay date: 10/03/2026",
    "Pay period: 09/21/2026 - 09/27/2026",
    "Gross pay: $500.00",
    "Net pay: $400.00",
  ]);
  const partialPdf = await renderStub(["Employee name: Haul", "Pay date: 10/03/2026", "Gross pay: $10.00", "Net pay: $8.00"]);
  const ownerPdf = await renderStub([
    "Employee name: Riley North",
    "Pay date: 10/03/2026",
    "Pay period: 09/21/2026 - 09/27/2026",
    "Gross pay: $2,200.00",
    "Net pay: $2,200.00",
  ]);
  const incompletePdf = await renderStub(["Employee name: Casey Haul", "Pay date: 10/03/2026"]);
  const extracted = shared.parsePaystubText(await (await import("../lib/paystubs")).readPaystubPdfText(caseyPdf));
  assert.equal(extracted.employeeName.includes("Casey"), true, extracted.employeeName);
  assert.equal(extracted.payDate, "2026-10-03");
  assert.equal(extracted.gross, "1840.00");
  assert.equal(extracted.net, "1412.55");

  const dbMod = await import("../lib/db");
  const paystubs = await import("../lib/paystubs");
  assert.equal(paystubs.paystubTokensMatch("abc", "abcd"), false);
  assert.equal(paystubs.paystubTokensMatch("same-token", "same-token"), true);
  const denied = paystubs.authorizePaystubUploadToken(undefined, "anything");
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 503);
  const emptyToken = paystubs.authorizePaystubUploadToken("", TOKEN);
  assert.equal(emptyToken.ok, false);
  if (!emptyToken.ok) assert.equal(emptyToken.status, 503);
  const missingBearer = paystubs.authorizePaystubUploadToken(TOKEN, "");
  assert.equal(missingBearer.ok, false);
  if (!missingBearer.ok) assert.equal(missingBearer.status, 401);
  const wrongBearer = paystubs.authorizePaystubUploadToken(TOKEN, "nope");
  assert.equal(wrongBearer.ok, false);
  if (!wrongBearer.ok) assert.equal(wrongBearer.status, 401);
  assert.equal(paystubs.authorizePaystubUploadToken(TOKEN, TOKEN).ok, true);
  const now = new Date().toISOString();
  const insert = dbMod.getDb().prepare(
    `INSERT INTO drivers (name, email, driver_type, company_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const caseyId = Number(insert.run("Casey Haul", "casey.haul@example.test", "company_driver", "", now, now).lastInsertRowid);
  const jordanId = Number(insert.run("Jordan Miles", "", "company_driver", "", now, now).lastInsertRowid);
  const ownerId = Number(insert.run("Riley North", "riley@northline.example", "owner_operator", "Northline Trucking", now, now).lastInsertRowid);
  assert.ok(caseyId && jordanId && ownerId);

  const upload = await import("../app/api/paystubs/upload/route");
  paystubs.setPaystubUploadTokenForTests(undefined);
  const disabled = await upload.POST(new Request("http://localhost/api/paystubs/upload", { method: "POST" }));
  assert.equal(disabled.status, 503);
  assert.match(await disabled.text(), /disabled/i);

  paystubs.setPaystubUploadTokenForTests(TOKEN);
  const missingAuth = await upload.POST(new Request("http://localhost/api/paystubs/upload", { method: "POST" }));
  assert.equal(missingAuth.status, 401);
  const wrongAuth = await upload.POST(
    new Request("http://localhost/api/paystubs/upload", { method: "POST", headers: { authorization: "Bearer nope" } }),
  );
  assert.equal(wrongAuth.status, 401);
  assert.equal((await wrongAuth.json()).error.includes(TOKEN), false);

  async function post(files: File[], extra?: (form: FormData) => void) {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    extra?.(form);
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    };
    try {
      const response = await upload.POST(
        new Request("http://localhost/api/paystubs/upload", {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}` },
          body: form,
        }),
      );
      const body = await response.json();
      assert.equal(logs.some((line) => line.includes(TOKEN)), false);
      return { status: response.status, body };
    } finally {
      console.log = original;
    }
  }

  const first = await post([pdfFile("casey-haul.pdf", caseyPdf), pdfFile("jordan-miles.pdf", jordanPdf)]);
  assert.equal(first.status, 200);
  const caseyResult = first.body.files.find((file: { file: string }) => file.file === "casey-haul.pdf");
  const jordanResult = first.body.files.find((file: { file: string }) => file.file === "jordan-miles.pdf");
  assert.equal(caseyResult.status, "stored");
  assert.equal(caseyResult.driverId, caseyId);
  assert.equal(jordanResult.status, "stored");
  assert.equal(jordanResult.driverId, jordanId);
  assert.equal(caseyResult.net, "1412.55");

  const again = await post([pdfFile("casey-haul.pdf", caseyPdf)]);
  assert.equal(again.body.files[0].status, "duplicate");
  assert.equal(again.body.files[0].existingId, caseyResult.paystubId);

  const sameDay = await renderStub([
    "Employee name: Casey Haul",
    "Pay date: 10/03/2026",
    "Pay period: 09/21/2026 - 09/27/2026",
    "Gross pay: $1,840.00",
    "Net pay: $1,500.00",
  ]);
  const flagged = await post([pdfFile("casey-second.pdf", sameDay)]);
  assert.equal(flagged.body.files[0].status, "duplicate");
  const flaggedRow = dbMod.getDb().prepare("SELECT driver_id, status FROM paystubs WHERE id = ?").get(flagged.body.files[0].paystubId) as {
    driver_id: number | null;
    status: string;
  };
  assert.equal(flaggedRow.status, "needs_review");
  assert.equal(flaggedRow.driver_id, null);

  const review = await post([
    pdfFile("quinn.pdf", unknownPdf),
    pdfFile("partial.pdf", partialPdf),
    pdfFile("owner.pdf", ownerPdf),
    pdfFile("incomplete.pdf", incompletePdf),
    pdfFile("notes.txt", Buffer.from("not a pdf")),
  ]);
  const byName = Object.fromEntries(review.body.files.map((file: { file: string }) => [file.file, file]));
  assert.equal(byName["quinn.pdf"].status, "needs_review");
  assert.equal(byName["quinn.pdf"].driverId, null);
  assert.equal(byName["partial.pdf"].status, "needs_review");
  assert.equal(byName["partial.pdf"].matchState, "low_confidence");
  assert.equal(byName["owner.pdf"].status, "needs_review");
  assert.equal(byName["owner.pdf"].matchState, "owner_operator");
  assert.equal(byName["incomplete.pdf"].status, "needs_review");
  assert.equal(byName["incomplete.pdf"].matchState, "incomplete");
  assert.equal(byName["notes.txt"].status, "error");
  for (const name of ["quinn.pdf", "partial.pdf", "owner.pdf", "incomplete.pdf"]) {
    const row = dbMod.getDb().prepare("SELECT driver_id FROM paystubs WHERE id = ?").get(byName[name].paystubId) as { driver_id: number | null };
    assert.equal(row.driver_id, null, name);
  }

  const quinnFixedPdf = await renderStub([
    "Employee name: Quinn Harper",
    "Pay date: 10/10/2026",
    "Pay period: 09/28/2026 - 10/04/2026",
    "Gross pay: $500.00",
    "Net pay: $400.00",
    "Memo: hand assign",
  ]);
  const overridden = await post([pdfFile("quinn-fixed.pdf", quinnFixedPdf)], (form) => {
    form.set(
      "overrides",
      JSON.stringify([
        {
          file: "quinn-fixed.pdf",
          driver_id: jordanId,
          pay_date: "2026-10-10",
          period_start: "2026-09-28",
          period_end: "2026-10-04",
          gross: "500.00",
          net: "400.00",
        },
      ]),
    );
  });
  assert.equal(overridden.body.files[0].status, "stored");
  assert.equal(overridden.body.files[0].driverId, jordanId);

  const ownerForcedPdf = await renderStub([
    "Employee name: Riley North",
    "Pay date: 10/17/2026",
    "Pay period: 10/05/2026 - 10/11/2026",
    "Gross pay: $2,200.00",
    "Net pay: $2,200.00",
    "Memo: do not attach",
  ]);
  const ownerForced = await post([pdfFile("owner-forced.pdf", ownerForcedPdf)], (form) => {
    form.set("driver_id", String(ownerId));
  });
  assert.equal(ownerForced.body.files[0].status, "needs_review");
  assert.equal(ownerForced.body.files[0].matchState, "owner_operator");

  const huge = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(shared.PAYSTUB_MAX_PDF_BYTES)]);
  const tooBig = await post([pdfFile("huge.pdf", huge)]);
  assert.equal(tooBig.body.files[0].status, "error");
  assert.match(tooBig.body.files[0].reason, /15 MB/);

  process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";
  const previewRoute = await import("../app/api/paystubs/preview/route");
  const commitRoute = await import("../app/api/paystubs/commit/route");
  const viewerPreview = await previewRoute.POST(new Request("http://localhost/api/paystubs/preview", { method: "POST" }));
  const viewerCommit = await commitRoute.POST(new Request("http://localhost/api/paystubs/commit", { method: "POST" }));
  assert.equal(viewerPreview.status, 403);
  assert.match(await viewerPreview.text(), /View-only access/);
  assert.equal(viewerCommit.status, 403);
  assert.match(await viewerCommit.text(), /View-only access/);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;

  process.env.TMS_SCRIPT_DRIVER_ID = String(caseyId);
  const listRoute = await import("../app/api/driver/paystubs/route");
  const pdfRoute = await import("../app/api/driver/paystubs/[id]/pdf/route");
  const ownList = await listRoute.GET(new Request("http://localhost/api/driver/paystubs"));
  const ownBody = await ownList.json();
  assert.equal(ownList.status, 200);
  assert.equal(ownBody.paystubs[0].netPay, "1412.55");
  assert.equal(ownBody.paystubs.some((row: { netPay: string }) => row.netPay === "700.50"), false);
  const otherList = await listRoute.GET(new Request(`http://localhost/api/driver/paystubs?driverId=${jordanId}`));
  assert.equal(otherList.status, 403);
  const foreignPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(jordanResult.paystubId) }),
  });
  assert.equal(foreignPdf.status, 403);
  const queuedPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(byName["quinn.pdf"].paystubId) }),
  });
  assert.equal(queuedPdf.status, 403);
  const missingPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: "999999" }),
  });
  assert.equal(missingPdf.status, 404);
  const ownPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(caseyResult.paystubId) }),
  });
  assert.equal(ownPdf.status, 200);
  assert.equal(ownPdf.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await ownPdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  const storedPath = paystubs.paystubFilePath(
    (dbMod.getDb().prepare("SELECT stored_name FROM paystubs WHERE id = ?").get(caseyResult.paystubId) as { stored_name: string }).stored_name,
  );
  assert.equal(storedPath?.includes(`${path.sep}public${path.sep}`), false);
  assert.equal(storedPath?.includes(`${path.sep}uploads${path.sep}paystubs${path.sep}`), true);

  const roots = ["app", "lib", "components", "scripts"];
  const banned = /api\.gusto\.com|gusto-demo\.com|GUSTO_CLIENT_|GUSTO_ENV|GUSTO_REDIRECT_URI|GUSTO_API_VERSION|\/oauth\/token|\/oauth\/authorize/;
  for (const root of roots) {
    const stack = [path.join(process.cwd(), root)];
    while (stack.length) {
      const current = stack.pop() as string;
      if (!fs.existsSync(current)) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith(`${path.sep}scripts${path.sep}paystub-test.ts`)) {
          const source = fs.readFileSync(full, "utf8");
          assert.doesNotMatch(source, banned, full);
        }
      }
    }
  }
  const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(example, /^PAYSTUB_UPLOAD_TOKEN=$/m);
  assert.doesNotMatch(example, /GUSTO_CLIENT_/);
  const uploadSource = fs.readFileSync(path.join(process.cwd(), "app/api/paystubs/upload/route.ts"), "utf8");
  assert.doesNotMatch(uploadSource, /console\.(log|info|debug|warn|error)/);

  paystubs.setPaystubUploadTokenForTests(null);
  console.log("paystub tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
