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
  assert.deepEqual(
    shared.resolveExportSnapshot({
      fileName: "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx",
      fileMtimeMs: Date.parse("2026-10-07T15:00:00.000Z"),
    }),
    { snapshot: "2026-10-07T15:00:00.000Z", source: "mtime" },
  );
  assert.equal(
    shared.resolveExportSnapshot({
      fileName: "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx",
      fileMtimeMs: Date.parse("2026-10-07T15:00:00.000Z"),
      docModified: "2026-10-03T18:22:11Z",
    }).source,
    "xlsx-modified",
  );
  assert.equal(
    shared.resolveExportSnapshot({
      docCreated: "2026-09-29T15:04:00Z",
      fileName: "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx",
    }).source,
    "xlsx-created",
  );
  assert.equal(
    shared.resolveExportSnapshot({
      override: "2026-08-01T00:00:00Z",
      docModified: "2026-10-03T18:22:11Z",
    }).source,
    "override",
  );
  assert.equal(
    shared.resolveExportSnapshot({ fileName: "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx" }).snapshot,
    STALE,
  );
  assert.equal(shared.inactiveTrailerUnit("1520"), "MS1520");
  assert.equal(shared.looksLikeCompanyName("3K3B Trucking LLC"), true);
  assert.equal(shared.looksLikeCompanyName("Lumig Transports LLC"), true);
  assert.equal(shared.looksLikeCompanyName("Steve Eller"), false);
  const companyDriver = shared.matchItsDriver(
    [{ id: 4, name: "Steve Eller", company_name: "3K3B Trucking LLC", active: 1 }],
    "3K3B Trucking LLC",
  );
  assert.equal(companyDriver.via, "company");
  assert.equal(companyDriver.id, 4);
  const uncertain = status.mapLoadRecord({
    "Load #": "1006185",
    Consignee: "May&#039;s, Bozzuto&#039;s, Elite Cold Storage, LLC",
    "Consignee City": "Bronx, Reading, Newark",
    "Consignee St.": "NY, PA",
  });
  assert.equal(uncertain.stops_uncertain, true);
  assert.equal(uncertain.deliveries.length, 3);
  assert.equal(uncertain.deliveries[0]?.name, "May's");
  assert.equal(uncertain.deliveries[1]?.name, "Bozzuto's");
  assert.equal(uncertain.deliveries[2]?.name, "Elite Cold Storage, LLC");
  assert.equal(uncertain.deliveries.some((stop) => stop.name === "LLC" || stop.name === "Inc"), false);
  assert.equal(uncertain.deliveries[0]?.city, "Bronx");
  assert.equal(uncertain.deliveries[1]?.city, "Reading");
  assert.equal(uncertain.deliveries[2]?.city, "Newark");
  assert.equal(uncertain.deliveries[0]?.state, "NY");
  assert.equal(uncertain.deliveries[1]?.state, "PA");
  assert.equal(uncertain.deliveries[2]?.state, "");
  assert.deepEqual(status.splitImportList("NY, CO", "plain"), ["NY", "CO"]);
  assert.deepEqual(status.splitImportList("Elite Cold Storage, LLC, Foo, Inc., Bar, L.L.C."), [
    "Elite Cold Storage, LLC",
    "Foo, Inc.",
    "Bar, L.L.C.",
  ]);
  assert.equal(status.decodeHtmlEntities("May&#039;s &amp; Bozzuto&#039;s"), "May's & Bozzuto's");
  const carried = status.mapLoadRecord({
    "Load #": "1006186",
    Consignee: "Elite Cold Storage, LLC, May&#039;s",
    "Consignee City": "Bronx, Reading",
    "Consignee St.": "NY",
  });
  assert.equal(carried.stops_uncertain, false);
  assert.equal(carried.deliveries.map((stop) => stop.name).join("|"), "Elite Cold Storage, LLC|May's");
  assert.equal(carried.deliveries.map((stop) => `${stop.city} ${stop.state}`).join("|"), "Bronx NY|Reading NY");
  const ampersand = status.mapLoadRecord({
    "Load #": "1006187",
    Consignee: "A &amp; B Cold Storage, LLC",
    "Consignee City": "Bronx",
    "Consignee St.": "NY",
  });
  assert.equal(ampersand.deliveries.length, 1);
  assert.equal(ampersand.deliveries[0]?.name, "A & B Cold Storage, LLC");
  assert.equal(ampersand.stops_uncertain, false);
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
    driver_type: "owner_operator",
    company_name: "3K3B Trucking LLC",
  });
  const ceferino = queries.createDriver({
    name: "Chris Ceferino",
    phone: "555-0102",
    license: "NE2",
    pin: "2222",
    truck_id: null,
    status: "available",
    driver_type: "owner_operator",
    company_name: "Lumig Transports LLC",
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
  for (const loadNumber of ["1006234", "1006239"]) {
    officeLoad({ loadNumber, status: "in_transit", truckId: truck32, updatedAt: "2026-10-05T15:00:00.000Z" });
  }
  officeLoad({
    loadNumber: "1006240",
    status: "in_transit",
    truckId: truck32,
    driverId: eller,
    updatedAt: "2026-10-05T15:00:00.000Z",
  });
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
  assert.equal(stale.rate_filled, 0);
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

  const openKey = "its-import:1008201:unmatched_driver";
  const nobody = sheet([loadRow({ "Load #": "1008201", Status: "Invoiced", "Carrier/Driver": "Nobody Home" })]);
  db.prepare("UPDATE exception_states SET status = 'open', updated_at = ? WHERE exception_key = ?").run("2026-01-15T12:00:00.000Z", openKey);
  const openBefore = db.prepare("SELECT status, reason, until, updated_at FROM exception_states WHERE exception_key = ?").get(openKey) as {
    status: string;
    reason: string;
    until: string;
    updated_at: string;
  };
  const sameOpen = its.importItsRecords(nobody, { apply: true, snapshot: FRESH });
  assert.equal(sameOpen.unchanged, 1);
  const openAfter = db.prepare("SELECT status, reason, until, updated_at FROM exception_states WHERE exception_key = ?").get(openKey) as typeof openBefore;
  assert.deepEqual(openAfter, openBefore);
  db.prepare(
    "UPDATE exception_states SET status = 'resolved', reason = 'office cleared', until = '', updated_at = '2026-02-02T00:00:00.000Z' WHERE exception_key = ?",
  ).run(openKey);
  its.importItsRecords(nobody, { apply: true, snapshot: FRESH });
  const resolvedRow = db.prepare("SELECT status, reason, until, updated_at FROM exception_states WHERE exception_key = ?").get(openKey) as typeof openBefore;
  assert.deepEqual(resolvedRow, {
    status: "resolved",
    reason: "office cleared",
    until: "",
    updated_at: "2026-02-02T00:00:00.000Z",
  });
  db.prepare(
    "UPDATE exception_states SET status = 'snoozed', reason = 'office snoozed', until = '2026-12-01', updated_at = '2026-03-03T00:00:00.000Z' WHERE exception_key = ?",
  ).run(openKey);
  its.importItsRecords(nobody, { apply: true, snapshot: FRESH });
  const snoozedRow = db.prepare("SELECT status, reason, until, updated_at FROM exception_states WHERE exception_key = ?").get(openKey) as typeof openBefore;
  assert.deepEqual(snoozedRow, {
    status: "snoozed",
    reason: "office snoozed",
    until: "2026-12-01",
    updated_at: "2026-03-03T00:00:00.000Z",
  });

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

  const beforePlan = counts();
  const planned = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1008410", Status: "Invoiced", Truck: "35", Trailer: "9", "Carrier/Driver": "David Seecharan" }),
      loadRow({ "Load #": "1008411", Status: "Invoiced", Truck: "35", "Carrier/Driver": "david   seecharan" }),
      loadRow({ "Load #": "1008412", Status: "Invoiced", Truck: "2001", "Carrier/Driver": "David Seecharan" }),
      loadRow({ "Load #": "1008413", Status: "Invoiced", Truck: "21", "Carrier/Driver": "Weston Gates Holdings Inc" }),
      loadRow({ "Load #": "1008414", Status: "On Route", Truck: "32", "Carrier/Driver": "Steve Eller" }),
    ]),
    { apply: false, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(planned.mode, "dry-run");
  assert.equal(planned.added, 5);
  assert.deepEqual(counts(), beforePlan);
  assert.equal(loadId("1008410"), null);
  assert.equal(queries.listTrucks().some((truck) => ["35", "2001", "21"].includes(truck.unit_number)), false);
  assert.equal(queries.listDrivers().some((driver) => driver.name === "David Seecharan" || driver.name === "Weston Gates Holdings Inc"), false);
  const truck35 = planned.inactive_created.trucks.find((plan) => plan.name === "35");
  const truck2001 = planned.inactive_created.trucks.find((plan) => plan.name === "2001");
  const truck21 = planned.inactive_created.trucks.find((plan) => plan.name === "21");
  const seecharan = planned.inactive_created.drivers.find((plan) => plan.name === "David Seecharan");
  const weston = planned.inactive_created.drivers.find((plan) => plan.name === "Weston Gates Holdings Inc");
  assert.deepEqual(truck35?.loads, ["1008410", "1008411"]);
  assert.deepEqual(truck2001?.loads, ["1008412"]);
  assert.deepEqual(truck21?.loads, ["1008413"]);
  assert.equal(planned.inactive_created.trucks.some((plan) => plan.name === "32"), false);
  assert.deepEqual(seecharan?.loads, ["1008410", "1008411", "1008412"]);
  assert.deepEqual(weston?.loads, ["1008413"]);
  assert.equal(planned.inactive_created.drivers.some((plan) => plan.name === "Steve Eller"), false);
  assert.deepEqual(planned.inactive_created.trailers.find((plan) => plan.name === "MS9")?.loads, ["1008410"]);
  const plannedText = its.formatItsImportText(planned);
  assert.match(plannedText, /inactive trucks that would be created:\n {2}21: 1 load\n {2}35: 2 loads\n {2}2001: 1 load/);
  assert.match(plannedText, /inactive drivers that would be created:\n {2}David Seecharan: 3 loads\n {2}Weston Gates Holdings Inc: 1 load/);
  assert.match(plannedText, /inactive trailers that would be created:\n {2}MS9: 1 load/);
  assert.doesNotMatch(plannedText, /Steve Eller/);
  assert.doesNotMatch(plannedText, /^ {2}32: /m);

  const createdPair = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1008420", Status: "Invoiced", Truck: "2000", "Carrier/Driver": "Former One" }),
      loadRow({ "Load #": "1008421", Status: "Invoiced", Truck: "2000", "Carrier/Driver": "former   one" }),
    ]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.deepEqual(createdPair.inactive_created.trucks.find((plan) => plan.name === "2000")?.loads, ["1008420", "1008421"]);
  assert.deepEqual(createdPair.inactive_created.drivers.find((plan) => plan.name === "Former One")?.loads, ["1008420", "1008421"]);
  assert.equal(queries.listTrucks().filter((truck) => truck.unit_number === "2000").length, 1);
  assert.equal(queries.listDrivers().filter((driver) => driver.name === "Former One").length, 1);
  assert.equal(queries.listDrivers().find((driver) => driver.name === "Former One")?.driver_type, "company_driver");
  assert.match(its.formatItsImportText(createdPair), /inactive trucks created:\n {2}2000: 2 loads/);

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
  assert.equal(former?.driver_type, "owner_operator");
  assert.equal(former?.company_name, "Weston Gates Holdings Inc");
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
  assert.equal(stopAfter.city, "Avenel");
  assert.equal(loadField("1008101", "destination"), "Avenel, NJ");
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
  assert.match(help, /--snapshot/);

  const companyKeep = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006240",
        Status: "On Route",
        Truck: "32",
        "Carrier/Driver": "  3K3B   Trucking LLC ",
      }),
    ]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(loadField("1006240", "driver_id"), eller);
  assert.equal(loadField("1006240", "truck_id"), truck32);
  assert.equal(loadStatus("1006240"), "in_transit");
  assert.equal(queries.listDrivers().some((driver) => driver.name === "3K3B Trucking LLC"), false);
  assert.equal(companyKeep.reassignments.some((row) => row.load_number === "1006240"), false);
  assert.equal(companyKeep.inactive_created.drivers.some((plan) => /3k3b/i.test(plan.name)), false);

  const lumigLoads = Array.from({ length: 14 }, (_item, index) => `10093${String(index + 1).padStart(2, "0")}`);
  for (const loadNumber of lumigLoads) {
    officeLoad({
      loadNumber,
      status: "in_transit",
      driverId: eller,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
  }
  const lumigRows = lumigLoads.map((loadNumber, index) =>
    loadRow({
      "Load #": loadNumber,
      Status: "On Route",
      "Carrier/Driver": index === 13 ? "  Lumig   Transports LLC " : "Lumig Transports LLC",
    }),
  );
  const reassigned = its.importItsRecords(sheet(lumigRows), { apply: true, snapshot: FRESH });
  assert.equal(reassigned.reassignments.length, lumigLoads.length);
  assert.equal(reassigned.diff_sample.length <= 12, true);
  for (const loadNumber of lumigLoads) {
    assert.equal(loadField(loadNumber, "driver_id"), ceferino);
    const row = reassigned.reassignments.find((item) => item.load_number === loadNumber);
    assert.equal(row?.kind, "driver");
    assert.equal(row?.from_label, "Steve Eller");
    assert.equal(row?.to_label, "Chris Ceferino");
    assert.match(row?.its ?? "", /Lumig\s+Transports LLC/);
  }
  const reassignedText = its.formatItsImportText(reassigned);
  for (const loadNumber of lumigLoads) {
    assert.match(reassignedText, new RegExp(`${loadNumber} driver: Steve Eller → Chris Ceferino`));
  }
  assert.doesNotMatch(reassignedText, /more reassignment|truncated|\.\.\./);
  const reassignedJson = JSON.parse(JSON.stringify(reassigned)) as { reassignments: unknown[] };
  assert.equal(reassignedJson.reassignments.length, lumigLoads.length);

  officeLoad({
    loadNumber: "1009320",
    status: "in_transit",
    driverId: eller,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const refused = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009320", Status: "On Route", "Carrier/Driver": "Acme Trucking LLC" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(loadField("1009320", "driver_id"), eller);
  assert.equal(queries.listDrivers().some((driver) => driver.name === "Acme Trucking LLC"), false);
  assert.equal(refused.inactive_created.drivers.some((plan) => plan.name === "Acme Trucking LLC"), false);
  assert.equal(refused.reassignments.some((row) => row.load_number === "1009320"), false);
  assert.equal(refused.exception_items.some((item) => item.load_number === "1009320" && item.issue === "unmatched_driver"), true);

  const acme = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009321", Status: "Invoiced", "Carrier/Driver": "Acme Logistics" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  const acmeDriver = queries.listDrivers().find((driver) => driver.name === "Acme Logistics");
  assert.ok(acmeDriver);
  assert.equal(acmeDriver?.driver_type, "owner_operator");
  assert.equal(acmeDriver?.company_name, "Acme Logistics");
  assert.equal(acmeDriver?.active, 0);
  assert.equal(acmeDriver?.status, "off_duty");
  assert.equal(acmeDriver?.division, "MSE");
  assert.equal(loadField("1009321", "driver_id"), acmeDriver?.id);
  assert.deepEqual(acme.inactive_created.drivers.find((plan) => plan.name === "Acme Logistics")?.loads, ["1009321"]);

  const parked = queries.createDriver({
    name: "Parked Hauler",
    phone: "",
    license: "",
    pin: "",
    truck_id: null,
    status: "off_duty",
    active: 0,
    driver_type: "company_driver",
  });
  officeLoad({
    loadNumber: "1009322",
    status: "in_transit",
    driverId: eller,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const parkedImport = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009322", Status: "On Route", "Carrier/Driver": "Parked Hauler" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(loadField("1009322", "driver_id"), eller);
  assert.equal(parkedImport.reassignments.some((row) => row.load_number === "1009322"), false);
  assert.equal(parked, queries.listDrivers().find((driver) => driver.name === "Parked Hauler")?.id);

  const bronxId = officeLoad({
    loadNumber: "1006185",
    status: "in_transit",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  db.prepare("UPDATE loads SET origin = ?, destination = ? WHERE id = ?").run("Kansas City, MO", "Bronx, NY", bronxId);
  db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, street, city, state, zip, phone, window_start, window_end, arrived_at, departed_at)
     VALUES (?, 1, 'delivery', 'May''s', '', 'Bronx', 'NY', '', '', '2026-09-22T08:00:00', '2026-09-22T17:00:00', '2026-09-22T15:00:00.000Z', '')`,
  ).run(bronxId);
  const bronxStopsBefore = scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ?", bronxId);
  const switched = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006185",
        Status: "On Route",
        Consignee: "May&#039;s, Bozzuto&#039;s, Elite Cold Storage, LLC",
        "Consignee City": "Bronx, Reading, Newark",
        "Consignee St.": "NY, PA",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadField("1006185", "destination"), "Bronx, NY");
  assert.equal(loadField("1006185", "origin"), "Kansas City, MO");
  assert.equal(scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ?", bronxId), bronxStopsBefore);
  const bronxStop = db.prepare("SELECT name, city, state, arrived_at FROM load_stops WHERE load_id = ? AND kind = 'delivery'").get(bronxId) as {
    name: string;
    city: string;
    state: string;
    arrived_at: string;
  };
  assert.equal(bronxStop.name, "May's");
  assert.equal(bronxStop.city, "Bronx");
  assert.equal(bronxStop.state, "NY");
  assert.equal(bronxStop.arrived_at, "2026-09-22T15:00:00.000Z");
  assert.equal(switched.exception_items.some((item) => item.load_number === "1006185" && item.issue === "stop_parse_uncertain"), true);

  const blankCityId = loadId("1008101")!;
  const stopCountBefore = scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ?", blankCityId);
  db.prepare("UPDATE load_stops SET city = '' WHERE load_id = ? AND kind = 'delivery'").run(blankCityId);
  const filled = its.importItsRecords(
    sheet([loadRow({ "Load #": "1008101", Status: "Invoiced", Trailer: "1514", "Consignee City": "Newark", "WSF PO": "PO-CHANGED" })]),
    { apply: true, snapshot: FRESH },
  );
  const filledStop = db.prepare("SELECT id, name, city, state, arrived_at FROM load_stops WHERE load_id = ? AND kind = 'delivery'").get(blankCityId) as {
    id: number;
    name: string;
    city: string;
    state: string;
    arrived_at: string;
  };
  assert.equal(filledStop.city, "Newark");
  assert.equal(filledStop.state, "NJ");
  assert.equal(filledStop.name, "Avenel DC");
  assert.equal(filledStop.arrived_at, "2026-09-22T15:04:00.000Z");
  assert.equal(loadField("1008101", "destination"), "Avenel, NJ");
  assert.equal(scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ?", blankCityId), stopCountBefore);
  assert.equal(filled.updated >= 1, true);
  const keepState = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1008101",
        Status: "Invoiced",
        Trailer: "1514",
        "Consignee City": "",
        "Consignee St.": "",
        "WSF PO": "PO-CHANGED",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  const keptStop = db.prepare("SELECT city, state FROM load_stops WHERE id = ?").get(filledStop.id) as { city: string; state: string };
  assert.equal(keptStop.city, "Newark");
  assert.equal(keptStop.state, "NJ");
  assert.equal(keepState.reassignments.length, 0);

  const uncertainNew = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006190",
        Status: "Invoiced",
        Consignee: "May&#039;s, Bozzuto&#039;s, Elite Cold Storage, LLC",
        "Consignee City": "Bronx, Reading, Newark",
        "Consignee St.": "NY, PA",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(uncertainNew.added, 1);
  const newStops = db.prepare("SELECT name, city, state FROM load_stops WHERE load_id = ? AND kind = 'delivery' ORDER BY sequence, id").all(loadId("1006190")) as Array<{
    name: string;
    city: string;
    state: string;
  }>;
  assert.deepEqual(
    newStops.map((stop) => `${stop.name}|${stop.city}|${stop.state}`),
    ["May's|Bronx|NY", "Bozzuto's|Reading|PA", "Elite Cold Storage, LLC|Newark|"],
  );
  assert.equal(newStops.some((stop) => stop.name === "LLC" || stop.name === "Inc"), false);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM exception_states WHERE exception_key = 'its-import:1006190:stop_parse_uncertain'"), 1);
  const uncertainAgain = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006190",
        Status: "Invoiced",
        Consignee: "May&#039;s, Bozzuto&#039;s, Elite Cold Storage, LLC",
        "Consignee City": "Bronx, Reading, Newark",
        "Consignee St.": "NY, PA",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(uncertainAgain.added, 0);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM exception_states WHERE exception_key = 'its-import:1006190:stop_parse_uncertain'"), 1);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ? AND kind = 'delivery'", loadId("1006190")), 3);

  const carriedApply = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006191",
        Status: "Invoiced",
        Consignee: "Elite Cold Storage, LLC, May&#039;s",
        "Consignee City": "Bronx, Reading",
        "Consignee St.": "NY",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(carriedApply.exception_items.some((item) => item.load_number === "1006191" && item.issue === "stop_parse_uncertain"), false);
  const carriedStops = db.prepare("SELECT name, city, state FROM load_stops WHERE load_id = ? AND kind = 'delivery' ORDER BY sequence, id").all(loadId("1006191")) as Array<{
    name: string;
    city: string;
    state: string;
  }>;
  assert.deepEqual(
    carriedStops.map((stop) => `${stop.name}|${stop.city}|${stop.state}`),
    ["Elite Cold Storage, LLC|Bronx|NY", "May's|Reading|NY"],
  );

  const decoded = its.importItsRecords(
    sheet([
      loadRow({
        "Load #": "1006192",
        Status: "Invoiced",
        Consignee: "A &amp; B Cold Storage, LLC",
        "Consignee City": "Bronx",
        "Consignee St.": "NY",
      }),
    ]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(decoded.added, 1);
  const decodedStop = db.prepare("SELECT name FROM load_stops WHERE load_id = ? AND kind = 'delivery'").get(loadId("1006192")) as { name: string };
  assert.equal(decodedStop.name, "A & B Cold Storage, LLC");

  officeLoad({ loadNumber: "1009401", status: "delivered", rate: null, updatedAt: "2026-10-05T15:00:00.000Z" });
  officeLoad({ loadNumber: "1009402", status: "delivered", rate: 2200, updatedAt: "2026-10-05T15:00:00.000Z" });
  const staleRate = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1009401", Status: "On Route", Truck: "41", "Total Billing Rate": "1,850.50" }),
      loadRow({ "Load #": "1009402", Status: "On Route", "Total Billing Rate": "900" }),
    ]),
    { apply: true, snapshot: STALE },
  );
  assert.equal(loadField("1009401", "rate"), 1850.5);
  assert.equal(loadStatus("1009401"), "delivered");
  assert.equal(loadField("1009401", "truck_id"), null);
  assert.equal(loadField("1009402", "rate"), 2200);
  assert.deepEqual(staleRate.rate_filled_loads, ["1009401"]);
  assert.ok(staleRate.skipped_tms_newer_loads.includes("1009401"));
  assert.match(its.formatItsImportText(staleRate), /rate filled on TMS-newer loads: 1\n {2}1009401/);
  const rateUpdates = (loadNumber: string) =>
    db
      .prepare(
        "SELECT action, field, old_value, new_value FROM load_audit WHERE load_number = ? AND action = 'update' AND field = 'rate' ORDER BY id",
      )
      .all(loadNumber) as Array<{ action: string; field: string; old_value: string; new_value: string }>;
  assert.deepEqual(rateUpdates("1009401"), [{ action: "update", field: "rate", old_value: "", new_value: "1850.5" }]);
  assert.deepEqual(rateUpdates("1009402"), []);
  const staleRateAgain = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009401", Status: "On Route", "Total Billing Rate": "1,850.50" })]),
    { apply: true, snapshot: STALE },
  );
  assert.equal(staleRateAgain.rate_filled, 0);
  assert.equal(loadField("1009401", "rate"), 1850.5);
  assert.deepEqual(rateUpdates("1009401"), [{ action: "update", field: "rate", old_value: "", new_value: "1850.5" }]);
  officeLoad({ loadNumber: "1009403", status: "delivered", rate: null, updatedAt: "2026-10-05T15:00:00.000Z" });
  const staleRateDry = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009403", Status: "On Route", "Total Billing Rate": "1,850.50" })]),
    { apply: false, snapshot: STALE },
  );
  assert.equal(staleRateDry.rate_filled, 1);
  assert.equal(loadField("1009403", "rate"), null);
  assert.deepEqual(rateUpdates("1009403"), []);

  const msTrailers = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1003601", Status: "Invoiced", Trailer: "1520" }),
      loadRow({ "Load #": "1003602", Status: "Invoiced", Trailer: "2204" }),
      loadRow({ "Load #": "1003603", Status: "Invoiced", Trailer: "1510" }),
      loadRow({ "Load #": "1003604", Status: "Invoiced", Trailer: "1513" }),
      loadRow({ "Load #": "1003605", Status: "Invoiced", Trailer: "1520" }),
    ]),
    { apply: false, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.deepEqual(msTrailers.inactive_created.trailers.find((plan) => plan.name === "MS1520")?.loads, ["1003601", "1003605"]);
  assert.equal(msTrailers.inactive_created.trailers.some((plan) => plan.name === "1520"), false);
  for (const unit of ["MS2204", "MS1510", "MS1513"]) {
    assert.equal(msTrailers.inactive_created.trailers.some((plan) => plan.name === unit), true);
  }
  const msApplied = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1003601", Status: "Invoiced", Trailer: "1520" }),
      loadRow({ "Load #": "1003602", Status: "Invoiced", Trailer: "2204" }),
      loadRow({ "Load #": "1003603", Status: "Invoiced", Trailer: "1510" }),
      loadRow({ "Load #": "1003604", Status: "Invoiced", Trailer: "1513" }),
      loadRow({ "Load #": "1003605", Status: "Invoiced", Trailer: "1520" }),
    ]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.deepEqual(msApplied.inactive_created.trailers.find((plan) => plan.name === "MS1520")?.loads, ["1003601", "1003605"]);
  const ms1520 = queries.listTrailers().find((trailer) => trailer.unit_number === "MS1520");
  assert.ok(ms1520);
  assert.equal(ms1520?.active, 0);
  assert.equal(ms1520?.status, "out_of_service");
  assert.equal(loadField("1003601", "trailer_id"), ms1520?.id);
  assert.equal(loadField("1003605", "trailer_id"), ms1520?.id);
  assert.equal(msApplied.alias_matches.some((item) => item.load_number === "1003605" && item.its === "1520" && item.tms_unit === "MS1520"), true);
  for (const unit of ["MS2204", "MS1510", "MS1513"]) {
    assert.equal(queries.listTrailers().filter((trailer) => trailer.unit_number === unit).length, 1);
  }
  queries.createTrailer({ unit_number: "MS-1520", type: "reefer", status: "available" });
  const msAmbiguous = its.importItsRecords(
    sheet([loadRow({ "Load #": "1003606", Status: "Invoiced", Trailer: "1520" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(loadField("1003606", "trailer_id"), null);
  assert.equal(msAmbiguous.exception_items.some((item) => item.load_number === "1003606" && item.issue === "ambiguous_trailer"), true);

  const activeAlias = queries.createTrailer({ unit_number: "MS1700", type: "reefer", status: "available" });
  officeLoad({
    loadNumber: "1009701",
    status: "in_transit",
    trailerId: trailer1523.id,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const aliasMove = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009701", Status: "On Route", Trailer: "1700" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadField("1009701", "trailer_id"), activeAlias);
  assert.equal(aliasMove.reassignments.some((row) => row.load_number === "1009701" && row.kind === "trailer" && row.to_label === "MS1700" && row.its === "1700"), true);
  queries.createTrailer({ unit_number: "MS1800", type: "reefer", status: "out_of_service", active: 0 });
  officeLoad({
    loadNumber: "1009702",
    status: "in_transit",
    trailerId: trailer1523.id,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const inactiveAlias = its.importItsRecords(
    sheet([loadRow({ "Load #": "1009702", Status: "On Route", Trailer: "1800" })]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  assert.equal(loadField("1009702", "trailer_id"), trailer1523.id);
  assert.equal(inactiveAlias.reassignments.some((row) => row.load_number === "1009702"), false);

  officeLoad({
    loadNumber: "1003500",
    status: "in_transit",
    truckId: truck32,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  officeLoad({
    loadNumber: "1003599",
    status: "in_transit",
    truckId: truck32,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const countDir = fs.mkdtempSync(path.join(os.tmpdir(), "its-counts-"));
  const countFileA = path.join(countDir, "loads-a.csv");
  const countFileB = path.join(countDir, "loads-b.csv");
  const countLoadsA = ["1003501", "1003502", "1003503", "1003500"];
  const countLoadsB = ["1003504", "1003505", "1003506", "1003599"];
  fs.writeFileSync(
    countFileA,
    csvDocument([...countLoadsA.map((loadNumber) => loadRow({ "Load #": loadNumber, Status: "Invoiced", Truck: "35" })), loadRow({ "Load #": "1003599", Status: "Invoiced", Truck: "99" })]),
  );
  fs.writeFileSync(
    countFileB,
    csvDocument(countLoadsB.filter((loadNumber) => loadNumber !== "1003599").map((loadNumber) => loadRow({ "Load #": loadNumber, Status: "Invoiced", Truck: "35" }))),
  );
  const countDry = its.runItsImportFiles([countFileA, countFileB], { apply: false, createInactiveUnits: true });
  const countApply = its.runItsImportFiles([countFileA, countFileB], { apply: true, createInactiveUnits: true });
  const dry35 = countDry.inactive_created.trucks.find((plan) => plan.name === "35")?.loads ?? [];
  const apply35 = countApply.inactive_created.trucks.find((plan) => plan.name === "35")?.loads ?? [];
  assert.deepEqual(dry35, ["1003501", "1003502", "1003503", "1003504", "1003505", "1003506"]);
  assert.deepEqual(apply35, dry35);
  assert.equal(loadField("1003500", "truck_id"), truck32);
  assert.equal(loadField("1003599", "truck_id"), truck32);
  assert.equal(queries.listTrucks().filter((truck) => truck.unit_number === "35").length, 1);
  assert.equal(queries.listTrucks().some((truck) => truck.unit_number === "99"), false);
  assert.equal(countApply.exception_items.some((item) => item.load_number === "1003599" && item.issue === "unmatched_truck"), true);
  assert.equal(countApply.reassignments.some((row) => row.load_number === "1003500" || row.load_number === "1003599"), false);

  officeLoad({
    loadNumber: "1006224",
    status: "completed",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const dupDir = fs.mkdtempSync(path.join(os.tmpdir(), "its-dup-"));
  const augustFile = path.join(dupDir, "All Loads shipped between 2026-08-01 and 2026-08-22.csv");
  const septemberFile = path.join(dupDir, "All Loads shipped between 2026-09-01 and 2026-09-23.csv");
  fs.writeFileSync(
    augustFile,
    csvDocument([
      loadRow({ "Load #": "1006224", Status: "Completed", "Ship Date": "8/20/2026", "Del Date": "8/22/2026" }),
      loadRow({ "Load #": "1006225", Status: "Completed", "Ship Date": "8/20/2026", "Del Date": "8/22/2026" }),
    ]),
  );
  fs.writeFileSync(
    septemberFile,
    csvDocument([
      loadRow({ "Load #": "1006224", Status: "Delivered", "Ship Date": "9/20/2026", "Del Date": "9/23/2026" }),
      loadRow({ "Load #": "1006225", Status: "Delivered", "Ship Date": "9/20/2026", "Del Date": "9/23/2026" }),
    ]),
  );
  fs.utimesSync(augustFile, new Date("2026-08-22T18:00:00.000Z"), new Date("2026-08-22T18:00:00.000Z"));
  fs.utimesSync(septemberFile, new Date("2026-09-23T18:00:00.000Z"), new Date("2026-09-23T18:00:00.000Z"));
  const duplicate = its.runItsImportFiles([septemberFile, augustFile], { apply: true });
  assert.equal(loadStatus("1006224"), "completed");
  assert.equal(loadStatus("1006225"), "delivered");
  assert.equal(loadField("1006225", "updated_at"), "2026-09-23T18:00:00.000Z");
  const conflict6224 = duplicate.conflicts.find((conflict) => conflict.load_number === "1006224");
  const conflict6225 = duplicate.conflicts.find((conflict) => conflict.load_number === "1006225");
  assert.equal(conflict6224?.chosen_file, path.basename(septemberFile));
  assert.equal(conflict6224?.chosen_snapshot, "2026-09-23T18:00:00.000Z");
  assert.equal(conflict6224?.chosen_status, "Delivered");
  assert.equal(conflict6224?.others[0]?.status, "Completed");
  assert.equal(conflict6224?.others[0]?.file, path.basename(augustFile));
  assert.equal(conflict6225?.chosen_status, "Delivered");
  const duplicateText = its.formatItsImportText(duplicate);
  assert.match(duplicateText, /1006224: chose/);
  assert.match(duplicateText, /Completed/);
  assert.match(duplicateText, /Delivered/);
  assert.match(duplicateText, /1006225: chose/);
  const duplicateAgain = its.runItsImportFiles([septemberFile, augustFile], { apply: true });
  assert.equal(duplicateAgain.added, 0);
  assert.equal(duplicateAgain.updated, 0);
  assert.equal(loadStatus("1006224"), "completed");
  assert.equal(loadStatus("1006225"), "delivered");
  assert.equal(duplicateAgain.skipped_tms_newer_loads.includes("1006225"), false);

  const shapeId = loadId("1006224")!;
  db.prepare(
    `UPDATE loads
     SET status = 'delivered',
         pickup_start = '2026-09-23T08:00:00',
         pickup_end = '2026-09-23T17:00:00',
         delivery_start = '2026-09-25T08:00:00',
         delivery_end = '2026-09-25T17:00:00',
         updated_at = '2026-09-01T00:00:00.000Z'
     WHERE id = ?`,
  ).run(shapeId);
  db.prepare("DELETE FROM load_stops WHERE load_id = ?").run(shapeId);
  db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, street, city, state, zip, phone, window_start, window_end, arrived_at, departed_at)
     VALUES (?, 1, 'pickup', 'Westside Foods', '1 Dock St', 'Kansas City', 'MO', '64101', '', '2026-09-23T08:00:00', '2026-09-23T17:00:00', '', '')`,
  ).run(shapeId);
  db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, street, city, state, zip, phone, window_start, window_end, arrived_at, departed_at)
     VALUES (?, 1, 'delivery', 'Avenel DC', '2 Dock St', 'Avenel', 'NJ', '07001', '', '2026-09-25T08:00:00', '2026-09-25T17:00:00', '', '')`,
  ).run(shapeId);
  const shapeDir = fs.mkdtempSync(path.join(os.tmpdir(), "its-6224-"));
  const julyFile = path.join(shapeDir, "All Loads shipped between 2026-07-01 and 2026-08-31.csv");
  const septemberShape = path.join(shapeDir, "All Loads shipped between 2026-09-01 and 2026-09-25.csv");
  fs.writeFileSync(
    julyFile,
    csvDocument([
      loadRow({
        "Load #": "1006224",
        Status: "Invoiced",
        "Ship Date": "8/22/2026",
        "Del Date": "8/24/2026",
        Shipper: "Alpha Foods, Beta Cold, Gamma DC",
        "Shipper City": "Omaha, Des Moines, Chicago",
        "Shipper St.": "NE, IA, IL",
      }),
    ]),
  );
  fs.writeFileSync(
    septemberShape,
    csvDocument([
      loadRow({
        "Load #": "1006224",
        Status: "Delivered",
        "Ship Date": "9/23/2026",
        "Del Date": "9/25/2026",
      }),
    ]),
  );
  fs.utimesSync(julyFile, new Date("2026-10-02T18:00:00.000Z"), new Date("2026-10-02T18:00:00.000Z"));
  fs.utimesSync(septemberShape, new Date("2026-09-24T18:00:00.000Z"), new Date("2026-09-24T18:00:00.000Z"));
  const shape = its.runItsImportFiles([septemberShape, julyFile], { apply: true });
  assert.equal(shape.conflicts.find((conflict) => conflict.load_number === "1006224")?.chosen_file, path.basename(julyFile));
  assert.equal(loadStatus("1006224"), "completed");
  assert.equal(loadField("1006224", "pickup_start"), "2026-09-23T08:00:00");
  assert.equal(loadField("1006224", "pickup_end"), "2026-09-23T17:00:00");
  assert.equal(loadField("1006224", "delivery_start"), "2026-09-25T08:00:00");
  assert.equal(loadField("1006224", "delivery_end"), "2026-09-25T17:00:00");
  assert.equal(scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ? AND kind = 'pickup'", shapeId), 1);
  assert.equal(scalar("SELECT COUNT(*) AS n FROM load_stops WHERE load_id = ? AND kind = 'delivery'", shapeId), 1);
  const shapePickup = db.prepare("SELECT name, window_start, window_end FROM load_stops WHERE load_id = ? AND kind = 'pickup'").get(shapeId) as {
    name: string;
    window_start: string;
    window_end: string;
  };
  const shapeDelivery = db.prepare("SELECT name, window_start, window_end FROM load_stops WHERE load_id = ? AND kind = 'delivery'").get(shapeId) as {
    name: string;
    window_start: string;
    window_end: string;
  };
  assert.equal(shapePickup.name, "Westside Foods");
  assert.equal(shapePickup.window_start, "2026-09-23T08:00:00");
  assert.equal(shapePickup.window_end, "2026-09-23T17:00:00");
  assert.equal(shapeDelivery.name, "Avenel DC");
  assert.equal(shapeDelivery.window_start, "2026-09-25T08:00:00");
  assert.equal(shapeDelivery.window_end, "2026-09-25T17:00:00");
  assert.equal(
    shape.diff_sample.some(
      (diff) =>
        diff.load_number === "1006224" &&
        (diff.field === "pickup_start" || diff.field === "pickup_end" || diff.field === "delivery_start" || diff.field === "delivery_end"),
    ),
    false,
  );
  const shapeConflict = db.prepare("SELECT status, reason FROM exception_states WHERE exception_key = 'its-import:1006224:duplicate-conflict'").get() as {
    status: string;
    reason: string;
  };
  assert.equal(shapeConflict.status, "open");
  assert.match(shapeConflict.reason, /2026-08-22/);
  assert.match(shapeConflict.reason, /2026-09-23/);
  assert.match(shapeConflict.reason, /3 pickups/);
  assert.match(shapeConflict.reason, /1 pickups/);
  assert.match(shapeConflict.reason, /All Loads shipped between 2026-07-01 and 2026-08-31\.csv/);
  assert.match(shapeConflict.reason, /All Loads shipped between 2026-09-01 and 2026-09-25\.csv/);

  const blankId = officeLoad({ loadNumber: "1006226", status: "delivered", updatedAt: "2026-08-01T00:00:00.000Z" });
  db.prepare("UPDATE loads SET pickup_start = '', pickup_end = '2026-09-23T17:00:00' WHERE id = ?").run(blankId);
  its.importItsRecords(
    sheet([loadRow({ "Load #": "1006226", Status: "Delivered", "Ship Date": "8/22/2026", "Del Date": "8/24/2026" })]),
    { apply: true, snapshot: FRESH },
  );
  assert.equal(loadField("1006226", "pickup_start"), "2026-08-22T08:00:00");
  assert.equal(loadField("1006226", "pickup_end"), "2026-09-23T17:00:00");
  assert.equal(loadField("1006226", "delivery_start"), "2026-09-22T08:00:00");
  assert.equal(loadField("1006226", "delivery_end"), "2026-09-22T17:00:00");

  officeLoad({ loadNumber: "1006093", status: "completed", updatedAt: "2026-08-01T00:00:00.000Z" });
  db.prepare("UPDATE loads SET trailer_number = '1919', trailer_id = NULL WHERE load_number = '1006093'").run();
  const trailerDry = its.importItsRecords(sheet([loadRow({ "Load #": "1006093", Status: "Invoiced", Trailer: "1919" })]), {
    apply: false,
    snapshot: FRESH,
    createInactiveUnits: true,
  });
  assert.equal(trailerDry.inactive_created.trailers.some((plan) => plan.name === "MS1919"), false);
  assert.equal(
    trailerDry.exception_items.some((item) => item.load_number === "1006093" && item.issue === "unmatched_trailer"),
    true,
  );
  const trailerApply = its.importItsRecords(sheet([loadRow({ "Load #": "1006093", Status: "Invoiced", Trailer: "1919" })]), {
    apply: true,
    snapshot: FRESH,
    createInactiveUnits: true,
  });
  assert.equal(trailerApply.inactive_created.trailers.some((plan) => plan.name === "MS1919"), false);
  assert.equal(queries.listTrailers().some((trailer) => trailer.unit_number === "MS1919"), false);
  assert.equal(loadField("1006093", "trailer_number"), "1919");
  assert.equal(loadField("1006093", "trailer_id"), null);
  const trailerException = db
    .prepare("SELECT status, reason FROM exception_states WHERE exception_key = 'its-import:1006093:unmatched_trailer'")
    .get() as { status: string; reason: string };
  assert.equal(trailerException.status, "open");
  assert.equal(
    trailerException.reason,
    'No TMS trailer matches "1919". It only appears on existing completed loads, so no inactive trailer was created.',
  );
  const openTrailerId = officeLoad({ loadNumber: "1006095", status: "in_transit", updatedAt: "2026-08-01T00:00:00.000Z" });
  db.prepare("UPDATE loads SET trailer_number = '1918', trailer_id = NULL WHERE id = ?").run(openTrailerId);
  const linkedNew = its.importItsRecords(
    sheet([
      loadRow({ "Load #": "1006094", Status: "Invoiced", Trailer: "1918" }),
      loadRow({ "Load #": "1006095", Status: "On Route", Trailer: "1918" }),
    ]),
    { apply: true, snapshot: FRESH, createInactiveUnits: true },
  );
  const ms1918 = queries.listTrailers().find((trailer) => trailer.unit_number === "MS1918");
  assert.ok(ms1918);
  assert.equal(ms1918?.active, 0);
  assert.equal(loadField("1006094", "trailer_id"), ms1918?.id);
  assert.equal(loadField("1006094", "trailer_number"), "MS1918");
  assert.equal(loadField("1006095", "trailer_id"), ms1918?.id);
  assert.equal(loadField("1006095", "trailer_number"), "1918");
  assert.equal(linkedNew.inactive_created.trailers.some((plan) => plan.name === "MS1918"), true);
  assert.equal(loadField("1006093", "trailer_number"), "1919");
  assert.equal(loadField("1006093", "trailer_id"), null);

  const { buildXlsxFromGrid } = await import("../lib/xlsx-first-sheet");
  const { strToU8, unzipSync, zipSync } = await import("fflate");
  const xlsxDir = fs.mkdtempSync(path.join(os.tmpdir(), "its-xlsx-"));
  const xlsxPath = path.join(xlsxDir, "All Loads shipped between 2026-09-01 and 2026-09-29.xlsx");
  const headerRow = [...shared.ITS_ALL_LOADS_HEADERS];
  const dataRow = headerRow.map((header) => {
    if (header === "Load #") return "1009901";
    if (header === "Status") return "Invoiced";
    if (header === "Ship Date") return "9/20/2026";
    if (header === "Del Date") return "9/22/2026";
    if (header === "Customer") return "M & S Loads LLC.";
    if (header === "Shipper") return "Westside Foods";
    if (header === "Shipper City") return "Kansas City";
    if (header === "Shipper St.") return "MO";
    if (header === "Consignee") return "Avenel DC";
    if (header === "Consignee City") return "Avenel";
    if (header === "Consignee St.") return "NJ";
    return "";
  });
  const stamped = stampCore(buildXlsxFromGrid([headerRow, dataRow]), "2026-10-03T18:22:11Z", "", strToU8, unzipSync, zipSync);
  fs.writeFileSync(xlsxPath, stamped);
  fs.utimesSync(xlsxPath, new Date("2026-10-07T15:00:00.000Z"), new Date("2026-10-07T15:00:00.000Z"));
  const xlsxRun = its.runItsImportFiles([xlsxPath], { apply: true });
  assert.equal(xlsxRun.file_snapshots[0]?.source, "xlsx-modified");
  assert.equal(xlsxRun.file_snapshots[0]?.snapshot, "2026-10-03T18:22:11.000Z");
  assert.match(its.formatItsImportText(xlsxRun), /2026-10-03T18:22:11.000Z \(xlsx-modified\)/);
  assert.equal(loadField("1009901", "updated_at"), "2026-10-03T18:22:11.000Z");
  const xlsxAgain = its.runItsImportFiles([xlsxPath], { apply: true });
  assert.equal(xlsxAgain.unchanged, 1);
  assert.equal(xlsxAgain.skipped_tms_newer, 0);
  const createdOnly = path.join(xlsxDir, "created-only.xlsx");
  const createdRow = dataRow.map((value, index) => (headerRow[index] === "Load #" ? "1009902" : value));
  fs.writeFileSync(createdOnly, stampCore(buildXlsxFromGrid([headerRow, createdRow]), "", "2026-09-29T15:04:00Z", strToU8, unzipSync, zipSync));
  fs.utimesSync(createdOnly, new Date("2026-10-07T15:00:00.000Z"), new Date("2026-10-07T15:00:00.000Z"));
  const createdRun = its.runItsImportFiles([createdOnly], { apply: false });
  assert.equal(createdRun.file_snapshots[0]?.source, "xlsx-created");
  assert.equal(createdRun.file_snapshots[0]?.snapshot, "2026-09-29T15:04:00.000Z");
  const overrideRun = its.runItsImportFiles([xlsxPath], { apply: false, snapshot: "2026-01-15T00:00:00Z" });
  assert.equal(overrideRun.file_snapshots[0]?.source, "override");
  assert.equal(overrideRun.file_snapshots[0]?.snapshot, "2026-01-15T00:00:00.000Z");
  assert.match(its.formatItsImportText(overrideRun), /2026-01-15T00:00:00.000Z \(override\)/);
  const cliSnapshot = execFileSync(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["scripts/its-import.ts", "--db", dbPath, "--dry-run", "--snapshot", "2026-01-15T00:00:00Z", csvPath],
    { encoding: "utf8" },
  );
  assert.match(cliSnapshot, /2026-01-15T00:00:00.000Z \(override\)/);
  let snapshotExit = 0;
  try {
    execFileSync(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["scripts/its-import.ts", "--db", dbPath, "--snapshot", "yesterday", csvPath],
      { encoding: "utf8" },
    );
  } catch (error) {
    snapshotExit = (error as { status?: number }).status ?? 0;
  }
  assert.equal(snapshotExit, 2);

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

function stampCore(
  buffer: Uint8Array,
  modified: string,
  created: string,
  strToU8: (text: string) => Uint8Array,
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>,
  zipSync: (files: Record<string, Uint8Array>) => Uint8Array,
): Uint8Array {
  const files = unzipSync(buffer);
  files["docProps/core.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${created ? `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` : ""}
${modified ? `<dcterms:modified xsi:type="dcterms:W3CDTF">${modified}</dcterms:modified>` : ""}
</cp:coreProperties>`);
  return zipSync(files);
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
