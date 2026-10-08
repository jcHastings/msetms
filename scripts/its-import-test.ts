import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const dbPath = path.join(os.tmpdir(), `tms-its-import-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_DATA_DIR = path.dirname(dbPath);

const FRESH = "2026-10-07T23:59:59.999Z";
const STALE = "2026-09-29T23:59:59.999Z";
const FORBIDDEN = [
  "lib/integrations/quickbooks.ts",
  "lib/integrations/mail.ts",
  "lib/integrations/twilio.ts",
  "lib/integrations/whatsapp.ts",
  "lib/load-mail.ts",
  "lib/auto-invoice.ts",
  "lib/alert-rules.ts",
];

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function walkImports(file: string, seen = new Set<string>()): void {
  const abs = path.resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  const rel = path.relative(process.cwd(), abs);
  assert.ok(!FORBIDDEN.includes(rel), `${rel} is reachable from the ITS importer`);
  const text = fs.readFileSync(abs, "utf8");
  for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const next = resolveSpec(abs, match[1] ?? "");
    if (next) walkImports(next, seen);
  }
}

async function main(): Promise<void> {
  walkImports("lib/its-import.ts");
  walkImports("lib/load-import.ts");
  walkImports("scripts/its-import.ts");
  const importerSource = fs.readFileSync(path.join(process.cwd(), "lib/its-import.ts"), "utf8");
  assert.doesNotMatch(importerSource, /sendLoadToQuickbooks|sendBillToQuickbooks|sendMail|sendTwilioSms|sendWhatsAppMessage|maybeAutoInvoiceLoad|sendDriverLoadMail|sendCustomerInvoiceMail|createAlertRule/);
  assert.doesNotMatch(importerSource, /integrations\/quickbooks|integrations\/mail|integrations\/twilio|integrations\/whatsapp|load-mail|auto-invoice|alert-rules/);

  const shared = await import("../lib/its-import-shared");
  const status = await import("../lib/load-import-shared");
  assert.equal(shared.ITS_ALL_LOADS_HEADERS.length, 28);
  assert.equal(shared.ITS_ALL_LOADS_HEADERS[0], "Load #");
  assert.equal(shared.ITS_ALL_LOADS_HEADERS[22], "Carrier/Driver");
  assert.equal(shared.ITS_ALL_LOADS_HEADERS[25], "Total Billing Rate");
  assert.equal(shared.ITS_ALL_LOADS_HEADERS[27], "Equipment Type");
  assert.equal(status.lookupItsStatus("On Route"), "in_transit");
  assert.equal(status.lookupItsStatus("Invoiced Paid"), "completed");
  assert.equal(status.lookupItsStatus("Invoiced"), "completed");
  assert.equal(status.lookupItsStatus("Dispatched"), "dispatched");
  assert.equal(status.lookupItsStatus("Delivered"), "delivered");
  assert.equal(status.lookupItsStatus("not a status"), null);
  assert.match(status.itsStatusMapMarkdown(), /\| on route \| in_transit \|/);
  assert.equal(status.mapImportedLoadStatus("On Route"), "in_transit");
  assert.equal(
    shared.resolveExportSnapshot({
      fileName: "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx",
      fileMtimeMs: Date.parse("2026-10-07T15:00:00.000Z"),
    }),
    STALE,
  );
  assert.equal(shared.matchItsUnit([{ id: 1, unit_number: "MS1514" }], "1514", { msAlias: true }).via, "ms_alias");
  assert.equal(shared.matchItsUnit([{ id: 1, unit_number: "MS1514" }], "1514", { msAlias: false }).via, "unmatched");
  assert.equal(
    shared.matchItsUnit(
      [
        { id: 1, unit_number: "MS1514" },
        { id: 2, unit_number: "MS-1514" },
      ],
      "1514",
      { msAlias: true },
    ).via,
    "ambiguous",
  );
  assert.equal(shared.matchItsDriver([{ id: 4, name: "Steve Eller" }], "  steve   eller ").via, "exact");

  const queries = await import("../lib/queries");
  const its = await import("../lib/its-import");
  const { getDb, closeDb } = await import("../lib/db");
  const { listExceptionInbox } = await import("../lib/exceptions");

  const fetches: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetches.push(url);
    if (/quickbooks|intuit|twilio|smtp/i.test(url)) throw new Error(`importer called the network: ${url}`);
    return originalFetch(input, init);
  };

  const qbo = await import("../lib/integrations/quickbooks");
  const mail = await import("../lib/integrations/mail");
  const twilio = await import("../lib/integrations/twilio");
  const whatsapp = await import("../lib/integrations/whatsapp");
  const autoInvoice = await import("../lib/auto-invoice");
  const calls = { qbo: 0, mail: 0, sms: 0, whatsapp: 0, invoice: 0 };
  const track = <T extends object>(ns: T, method: keyof T, bucket: keyof typeof calls) => {
    const original = ns[method];
    if (typeof original !== "function") return;
    try {
      (ns as Record<string, unknown>)[method as string] = (...args: unknown[]) => {
        calls[bucket] += 1;
        return (original as (...inner: unknown[]) => unknown).apply(ns, args);
      };
    } catch {
      // ESM live bindings can be read-only. The import walk and sent_mail counts still trip the wire.
    }
  };
  track(qbo, "sendLoadToQuickbooks", "qbo");
  track(qbo, "sendBillToQuickbooks", "qbo");
  track(mail, "sendMail", "mail");
  track(twilio, "sendTwilioSms", "sms");
  track(whatsapp, "sendWhatsAppMessage", "whatsapp");
  track(autoInvoice, "maybeAutoInvoiceLoad", "invoice");

  const db = getDb();
  const customerId = queries.createCustomer({ name: "M & S Loads LLC.", billing_notes: "", contacts: [] });
  const truck32 = queries.createTruck({ unit_number: "32", type: "sleeper", capacity_lbs: 44000, status: "available" });
  const truck41 = queries.createTruck({ unit_number: "41", type: "sleeper", capacity_lbs: 44000, status: "available" });
  queries.createTrailer({ unit_number: "MS1523", type: "reefer", status: "available" });
  const trailer1514 = queries.createTrailer({ unit_number: "MS1514", type: "reefer", status: "available" });
  const eller = queries.createDriver({
    name: "Steve Eller",
    phone: "555-0101",
    license: "NE1",
    pin: "1111",
    truck_id: null,
    status: "available",
    driver_type: "company_driver",
  });

  const counts = () => ({
    loads: scalar("SELECT COUNT(*) AS n FROM loads"),
    stops: scalar("SELECT COUNT(*) AS n FROM load_stops"),
    trucks: scalar("SELECT COUNT(*) AS n FROM trucks"),
    trailers: scalar("SELECT COUNT(*) AS n FROM trailers"),
    drivers: scalar("SELECT COUNT(*) AS n FROM drivers"),
    exceptions: scalar("SELECT COUNT(*) AS n FROM exception_states"),
    attachments: scalar("SELECT COUNT(*) AS n FROM attachments"),
    settlements: scalar("SELECT COUNT(*) AS n FROM settlements"),
    mail: scalar("SELECT COUNT(*) AS n FROM sent_mail"),
    notifications: scalar("SELECT COUNT(*) AS n FROM user_notifications"),
  });

  function scalar(sql: string, ...params: Array<string | number>): number {
    return (db.prepare(sql).get(...params) as { n: number }).n;
  }

  function officeLoad(input: {
    loadNumber: string;
    status: string;
    truckId?: number | null;
    trailerId?: number | null;
    driverId?: number | null;
    rate?: number | null;
    updatedAt: string;
  }): number {
    const id = queries.createLoad({
      load_number: input.loadNumber,
      customer_id: customerId,
      origin: "Kansas City, MO",
      destination: "Avenel, NJ",
      pickup_start: "2026-09-20T08:00:00",
      pickup_end: "2026-09-20T17:00:00",
      delivery_start: "2026-09-22T08:00:00",
      delivery_end: "2026-09-22T17:00:00",
      weight: null,
      commodity: "",
      rate: input.rate ?? null,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: `PO-${input.loadNumber}`,
      po_number: `PO-${input.loadNumber}`,
      reefer_setpoint_f: null,
      trailer_number: "",
      trailer_id: input.trailerId ?? null,
      status: input.status,
      truck_id: input.truckId ?? null,
      driver_id: input.driverId ?? null,
      equipment: "reefer_53",
      customer_reference: `PO-${input.loadNumber}`,
    });
    db.prepare("UPDATE loads SET updated_at = ? WHERE id = ?").run(input.updatedAt, id);
    return id;
  }

  const trailer1523 = queries.listTrailers().find((trailer) => trailer.unit_number === "MS1523")!;
  officeLoad({
    loadNumber: "1006230",
    status: "delivered",
    trailerId: trailer1523.id,
    updatedAt: "2026-10-05T15:00:00.000Z",
  });
  for (const loadNumber of ["1006234", "1006239", "1006240"]) {
    officeLoad({ loadNumber, status: "in_transit", truckId: truck32, updatedAt: "2026-10-05T15:00:00.000Z" });
  }
  officeLoad({
    loadNumber: "1006241",
    status: "at_delivery",
    truckId: truck32,
    updatedAt: "2026-10-05T15:00:00.000Z",
  });
  db.prepare("UPDATE loads SET trailer_number = 'MS1523' WHERE load_number = '1006230'").run();

  const stale = its.importItsRecords(sheet([
    loadRow({ "Load #": "1006230", Status: "On Route", Trailer: "" }),
    loadRow({ "Load #": "1006234", Status: "On Route", Truck: "32" }),
    loadRow({ "Load #": "1006239", Status: "On Route", Truck: "32" }),
    loadRow({ "Load #": "1006240", Status: "On Route", Truck: "32" }),
    loadRow({ "Load #": "1006241", Status: "Dispatched", Truck: "41" }),
  ]), { apply: true, snapshot: STALE });
  assert.deepEqual(stale.skipped_tms_newer_loads.sort(), ["1006230", "1006234", "1006239", "1006240", "1006241"]);
  assert.equal(stale.added, 0);
  assert.equal(stale.updated, 0);
  assert.equal(loadStatus("1006230"), "delivered");
  assert.equal(loadField("1006230", "trailer_id"), trailer1523.id);
  for (const loadNumber of ["1006234", "1006239", "1006240"]) assert.equal(loadStatus(loadNumber), "in_transit");
  assert.equal(loadStatus("1006241"), "at_delivery");
  assert.equal(loadField("1006241", "truck_id"), truck32);
  assert.notEqual(loadField("1006241", "truck_id"), truck41);

  const onRoute = its.importItsRecords(sheet([loadRow({ "Load #": "1008001", Status: "On Route", Truck: "32", "Carrier/Driver": "steve  eller" })]), {
    apply: true,
    snapshot: FRESH,
  });
  assert.equal(onRoute.added, 1);
  assert.equal(loadStatus("1008001"), "in_transit");
  assert.equal(loadField("1008001", "driver_id"), eller);
  assert.notEqual(loadStatus("1008001"), "available");

  const assignLaterId = loadId("1008001")!;
  const keptTruck = loadField("1008001", "truck_id");
  const keptDriver = loadField("1008001", "driver_id");
  const assignLater = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008001", Status: "On Route", Truck: "Assign Later", Trailer: "Assign Later", "Carrier/Driver": "Assign Later" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(assignLater.updated, 0);
  assert.equal(loadField("1008001", "truck_id"), keptTruck);
  assert.equal(loadField("1008001", "driver_id"), keptDriver);
  assert.equal(assignLaterId, loadId("1008001"));

  const alias = its.importItsRecords(sheet([loadRow({ "Load #": "1008101", Status: "Invoiced", Trailer: "1514" })]), {
    apply: true,
    snapshot: FRESH,
  });
  assert.equal(alias.added, 1);
  assert.equal(loadField("1008101", "trailer_id"), trailer1514);
  assert.equal(alias.alias_matches.some((item) => item.load_number === "1008101" && item.tms_unit === "MS1514"), true);

  queries.createTrailer({ unit_number: "MS-1514", type: "reefer", status: "available" });
  const ambiguous = its.importItsRecords(sheet([loadRow({ "Load #": "1008102", Status: "Invoiced", Trailer: "1514" })]), {
    apply: true,
    snapshot: FRESH,
  });
  assert.equal(loadField("1008102", "trailer_id"), null);
  assert.equal(ambiguous.exception_items.some((item) => item.load_number === "1008102" && item.issue === "ambiguous_trailer"), true);

  const noAlias = its.importItsRecords(sheet([loadRow({ "Load #": "1008103", Status: "Invoiced", Trailer: "1616" })]), {
    apply: true,
    snapshot: FRESH,
    msTrailerAlias: false,
  });
  queries.createTrailer({ unit_number: "MS1616", type: "reefer", status: "available" });
  assert.equal(loadField("1008103", "trailer_id"), null);
  assert.equal(noAlias.exception_items.some((item) => item.issue === "unmatched_trailer"), true);
  assert.equal(queries.listTrailers().some((trailer) => trailer.unit_number === "MS1616"), true);

  const unmatched = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008201", Status: "Invoiced", "Carrier/Driver": "Nobody Home" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadField("1008201", "driver_id"), null);
  assert.equal(unmatched.exception_items.filter((item) => item.issue === "unmatched_driver" && item.load_number === "1008201").length, 1);
  const again = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008201", Status: "Invoiced", "Carrier/Driver": "Nobody Home" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
  assert.equal(again.unchanged, 1);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM exception_states WHERE exception_key = 'its-import:1008201:unmatched_driver'"), 1);
  const inbox = listExceptionInbox().items.filter((item) => item.loadNumber === "1008201" && item.kind === "its_import");
  assert.equal(inbox.length, 1);
  assert.match(inbox[0]?.title ?? "", /unmatched driver/);

  const rated = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008301", Status: "Invoiced", "Total Billing Rate": "1,850.50" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(rated.added, 1);
  assert.equal(loadField("1008301", "rate"), 1850.5);
  officeLoad({ loadNumber: "1008302", status: "completed", rate: 2200, updatedAt: "2026-08-01T00:00:00.000Z" });
  const keepRate = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008302", Status: "Invoiced", "Total Billing Rate": "900" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadField("1008302", "rate"), 2200);
  assert.equal(keepRate.diff_sample.some((diff) => diff.field === "rate" && diff.load_number === "1008302"), false);
  const noRate = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008303", Status: "Invoiced", "Total Billing Rate": "500" })]),
    { apply: true, snapshot: FRESH, importRate: false },
  );
  assert.equal(noRate.added, 1);
  assert.equal(loadField("1008303", "rate"), null);

  const beforeInactive = counts();
  const inactiveOff = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008401", Status: "Invoiced", Truck: "35", "Carrier/Driver": "David Seecharan" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: false },
  );
  assert.equal(loadField("1008401", "truck_id"), null);
  assert.equal(loadField("1008401", "driver_id"), null);
  assert.equal(queries.listTrucks().some((truck) => truck.unit_number === "35"), false);
  assert.equal(queries.listDrivers().some((driver) => driver.name === "David Seecharan"), false);
  assert.equal(inactiveOff.exception_items.some((item) => item.issue === "unmatched_truck"), true);
  assert.equal(inactiveOff.exception_items.some((item) => item.issue === "unmatched_driver"), true);

  const truck32Status = queries.getTruck(truck32)?.status;
  const inactiveOn = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1008402", Status: "Invoiced", Truck: "38", "Carrier/Driver": "Weston Gates Holdings Inc" }),
    ]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(inactiveOn.added, 1);
  const retired = queries.listTrucks().find((truck) => truck.unit_number === "38");
  const former = queries.listDrivers().find((driver) => driver.name === "Weston Gates Holdings Inc");
  assert.ok(retired);
  assert.equal(retired?.active, 0);
  assert.equal(retired?.status, "out_of_service");
  assert.equal(loadField("1008402", "truck_id"), retired?.id);
  assert.ok(former);
  assert.equal(former?.active, 0);
  assert.equal(former?.status, "off_duty");
  assert.equal(loadField("1008402", "driver_id"), former?.id);
  assert.equal(inactiveOn.exception_items.some((item) => item.load_number === "1008402"), false);
  assert.equal(queries.getTruck(truck32)?.status, truck32Status);
  assert.ok(counts().trucks > beforeInactive.trucks);

  const patchedId = loadId("1008101")!;
  const stopBefore = db.prepare("SELECT id, arrived_at FROM load_stops WHERE load_id = ? AND kind = 'delivery'").get(patchedId) as {
    id: number;
    arrived_at: string;
  };
  db.prepare("UPDATE load_stops SET arrived_at = ?, departed_at = ? WHERE id = ?").run(
    "2026-09-22T15:04:00.000Z",
    "2026-09-22T16:10:00.000Z",
    stopBefore.id,
  );
  db.prepare(
    "UPDATE loads SET qbo_invoice_id = 'qbo-1', qbo_sent_at = '2026-09-25T00:00:00.000Z', tms_invoice_number = '1006', updated_at = ? WHERE id = ?",
  ).run("2026-08-01T00:00:00.000Z", patchedId);
  db.prepare(
    `INSERT INTO attachments (load_id, kind, original_name, stored_name, mime_type, uploaded_by, created_at)
     VALUES (?, 'pod', 'pod.pdf', 'pod.pdf', 'application/pdf', 'office', ?)`,
  ).run(patchedId, "2026-09-22T18:00:00.000Z");
  db.prepare(
    `INSERT INTO settlements (driver_id, load_id, amount, status, paid_at, created_at) VALUES (?, ?, 100, 'open', '', ?)`,
  ).run(eller, patchedId, "2026-09-22T18:00:00.000Z");
  const cityChange = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008101", Status: "Invoiced", Trailer: "1514", "Consignee City": "Newark", "WSF PO": "PO-CHANGED" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(cityChange.updated, 1);
  assert.equal(cityChange.diff_sample.some((diff) => diff.load_number === "1008101" && diff.field === "po_number"), true);
  const stopAfter = db.prepare("SELECT id, city, arrived_at, departed_at FROM load_stops WHERE id = ?").get(stopBefore.id) as {
    id: number;
    city: string;
    arrived_at: string;
    departed_at: string;
  };
  assert.equal(stopAfter.id, stopBefore.id);
  assert.equal(stopAfter.city, "Newark");
  assert.equal(stopAfter.arrived_at, "2026-09-22T15:04:00.000Z");
  assert.equal(stopAfter.departed_at, "2026-09-22T16:10:00.000Z");
  assert.equal(loadField("1008101", "qbo_sent_at"), "2026-09-25T00:00:00.000Z");
  assert.equal(loadField("1008101", "tms_invoice_number"), "1006");
  assert.equal(scalar("SELECT COUNT(*) AS n FROM attachments WHERE load_id = ?", patchedId), 1);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM settlements WHERE load_id = ?", patchedId), 1);

  officeLoad({ loadNumber: "1008501", status: "delivered", updatedAt: "2026-08-01T00:00:00.000Z" });
  const held = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008501", Status: "Dispatched", "WSF PO": "PO-FRESH" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadStatus("1008501"), "delivered");
  assert.equal(loadField("1008501", "po_number"), "PO-FRESH");
  assert.equal(held.skipped_tms_newer, 0);

  const repeatFile = sheet([loadRow({ "Load #": "1008601", Status: "Delivered", Truck: "32" })]);
  const first = its.importItsRecords(repeatFile, { apply: true, snapshot: FRESH });
  assert.equal(first.added, 1);
  const stamp = loadField("1008601", "updated_at");
  const second = its.importItsRecords(repeatFile, { apply: true, snapshot: FRESH });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(loadField("1008601", "updated_at"), stamp);
  assert.equal(loadStatus("1008601"), "delivered");

  const bad = its.importItsRecords(sheet([loadRow({ "Load #": "1008701", Status: "Invoiced", "Ship Date": "not-a-date" })]), {
    apply: true,
    snapshot: FRESH,
  });
  assert.equal(loadId("1008701"), null);
  assert.equal(bad.exception_items.some((item) => item.issue === "unparsable_row"), true);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM exception_states WHERE exception_key = 'its-import:1008701:unparsable_row'"), 1);

  const beforeDry = counts();
  const dry = its.importItsRecords(sheet([loadRow({ "Load #": "1008801", Status: "Invoiced" })]), {
    apply: false,
    snapshot: FRESH,
  });
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.added, 1);
  assert.deepEqual(counts(), beforeDry);
  assert.equal(loadId("1008801"), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "its-export-"));
  const csvPath = path.join(dir, "All Loads shipped between 2026-09-01 and 2026-09-29.csv");
  fs.writeFileSync(csvPath, csvDocument([loadRow({ "Load #": "1008901", Status: "On Route" })]));
  const cli = execFileSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["scripts/its-import.ts", "--db", dbPath, "--dry-run", csvPath],
    { encoding: "utf8" },
  );
  assert.match(cli, /ITS import dry-run/);
  assert.match(cli, /skipped: TMS newer/);
  assert.match(cli, /ITS_IMPORT_JSON/);
  const json = JSON.parse(cli.slice(cli.indexOf("ITS_IMPORT_JSON") + "ITS_IMPORT_JSON".length));
  assert.equal(json.mode, "dry-run");
  assert.equal(json.added, 1);
  assert.equal(loadId("1008901"), null);
  const help = execFileSync(path.join(process.cwd(), "node_modules", ".bin", "tsx"), ["scripts/its-import.ts", "--help"], {
    encoding: "utf8",
  });
  assert.match(help, /npx tsx scripts\/its-import\.ts \[--db <path>\] \[--dry-run \| --apply\]/);

  assert.equal(calls.qbo, 0);
  assert.equal(calls.mail, 0);
  assert.equal(calls.sms, 0);
  assert.equal(calls.whatsapp, 0);
  assert.equal(calls.invoice, 0);
  assert.equal(fetches.filter((url) => /quickbooks|intuit|twilio|smtp/i.test(url)).length, 0);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM sent_mail"), 0);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM user_notifications"), 0);

  console.log(its.formatItsImportText(dry));
  closeDb();
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  globalThis.fetch = originalFetch;
  console.log("its-import tests passed");
}

function csvDocument(lines: string[]): string {
  const { ITS_ALL_LOADS_HEADERS } = require("../lib/its-import-shared") as typeof import("../lib/its-import-shared");
  return [ITS_ALL_LOADS_HEADERS.join(","), ...lines].join("\n");
}

function sheet(lines: string[]): Array<Record<string, unknown>> {
  const { recordsFromLoadSheetText } = require("../lib/load-import-shared") as typeof import("../lib/load-import-shared");
  return recordsFromLoadSheetText(csvDocument(lines));
}

function loadRow(values: Record<string, string | number>): string {
  const { ITS_ALL_LOADS_HEADERS } = require("../lib/its-import-shared") as typeof import("../lib/its-import-shared");
  const defaults: Record<string, string> = {
    "Load #": "",
    "Tie Sheet": "",
    "WSF PO": "",
    SALT: "",
    Transfer: "",
    Avenel: "",
    "Salt/Spice": "",
    "Work Order #": "",
    Status: "Invoiced",
    "Ship Date": "9/20/2026",
    "Del Date": "9/22/2026",
    Customer: "M & S Loads LLC.",
    Shipper: "Westside Foods",
    "Shipper City": "Kansas City",
    "Shipper St.": "MO",
    "Shipper PO Numbers": "",
    Consignee: "Avenel DC",
    "Consignee City": "Avenel",
    "Consignee St.": "NJ",
    "Consignee PO Numbers": "",
    Truck: "",
    Trailer: "",
    "Carrier/Driver": "",
    "Line Haul": "",
    "(currency)": "USD",
    "Total Billing Rate": "",
    "Equipment Type": "53' Reefer",
  };
  return ITS_ALL_LOADS_HEADERS.map((header) => {
    const value = values[header] ?? defaults[header] ?? "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",");
}

function loadId(loadNumber: string): number | null {
  const { getDb } = require("../lib/db") as typeof import("../lib/db");
  const row = getDb().prepare("SELECT id FROM loads WHERE load_number = ?").get(loadNumber) as { id: number } | undefined;
  return row?.id ?? null;
}

function loadStatus(loadNumber: string): string {
  return String(loadField(loadNumber, "status") ?? "");
}

function loadField(loadNumber: string, field: string): string | number | null {
  const { getDb } = require("../lib/db") as typeof import("../lib/db");
  const row = getDb().prepare(`SELECT ${field} AS value FROM loads WHERE load_number = ?`).get(loadNumber) as
    | { value: string | number | null }
    | undefined;
  return row?.value ?? null;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
