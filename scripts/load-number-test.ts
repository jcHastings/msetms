/**
 * New loads take the next all-numeric ITS load number.
 * MSE- numbers stay put. ITS imports keep their own numbers and block a collision.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.TMS_DB_PATH) {
  process.env.TMS_DB_PATH = path.join(os.tmpdir(), `tms-load-number-${process.pid}-${Date.now()}.db`);
}
process.env.TMS_SKIP_SEED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const SEEDED_MSE_LOADS = [
  "MSE-1042",
  "MSE-1043",
  "MSE-1044",
  "MSE-1045",
  "MSE-1046",
  "MSE-1047",
  "MSE-1048",
  "MSE-1049",
  "MSE-1050",
  "MSE-1051",
  "MSE-1052",
  "MSE-1053",
];

function loadInput(customerId: number, extra: { load_number?: string; notes?: string; origin?: string } = {}) {
  return {
    customer_id: customerId,
    origin: extra.origin ?? "Hastings, NE",
    destination: "Avenel, NJ",
    pickup_start: "2026-10-14T18:00:00.000Z",
    pickup_end: "2026-10-14T20:00:00.000Z",
    delivery_start: "2026-10-16T18:00:00.000Z",
    delivery_end: "2026-10-16T20:00:00.000Z",
    weight: 40000,
    commodity: "Frozen",
    rate: 2000,
    notes: extra.notes ?? "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
    load_number: extra.load_number,
  };
}

function itsRow(loadNumber: string, customer = "ITS Foods") {
  return {
    "Load #": loadNumber,
    Status: "Available",
    "Ship Date": "9/20/2026",
    "Del Date": "9/22/2026",
    Customer: customer,
    Shipper: "Westside Foods",
    "Shipper City": "Kansas City",
    "Shipper St.": "MO",
    Consignee: "Avenel DC",
    "Consignee City": "Avenel",
    "Consignee St.": "NJ",
  };
}

function allocateInChild(customerId: number): Promise<string> {
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, [path.join("scripts", "load-number-test.ts")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOAD_NUMBER_WORKER: "1",
        TMS_DB_PATH: process.env.TMS_DB_PATH,
        TMS_SKIP_SEED: "1",
        LOAD_NUMBER_CUSTOMER_ID: String(customerId),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`load number worker exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function workerMain(): Promise<void> {
  const queries = await import("../lib/queries");
  const customerId = Number(process.env.LOAD_NUMBER_CUSTOMER_ID);
  const id = queries.createLoad(loadInput(customerId, { notes: "concurrent" }));
  const load = queries.getLoad(id);
  if (!load) throw new Error("Concurrent load was not saved.");
  process.stdout.write(load.load_number);
}

async function main(): Promise<void> {
  if (process.env.LOAD_NUMBER_WORKER === "1") {
    await workerMain();
    return;
  }

  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const settings = await import("../lib/settings");
  const its = await import("../lib/its-import");
  const { guardFreeLoadNumber, listMseLoadNumbers, LoadNumberCollision, raiseLoadNumberWatermark } = await import(
    "../lib/load-numbers"
  );

  const db = getDb();
  const customerId = queries.createCustomer({ name: "Load Number Foods", billing_notes: "", contacts: [] });
  const mse1042 = queries.createLoad(loadInput(customerId, { load_number: "MSE-1042", notes: "seed shape" }));
  const mse1072 = queries.createLoad(loadInput(customerId, { load_number: "MSE-1072", notes: "rate con tonight" }));
  const mseBefore = listMseLoadNumbers(db);
  assert.deepEqual(mseBefore, ["MSE-1042", "MSE-1072"]);

  db.prepare("UPDATE company_profile SET load_number_next = 1001 WHERE id = 1").run();
  raiseLoadNumberWatermark(db);
  assert.equal(
    settings.peekNextLoadNumber(),
    "1001",
    "MSE-1072 must not advance the ITS sequence",
  );

  queries.createLoad(loadInput(customerId, { load_number: "1006149" }));
  queries.createLoad(loadInput(customerId, { load_number: "1006230" }));
  assert.equal(settings.peekNextLoadNumber(), "1006231");

  const actions = fs.readFileSync(path.join(process.cwd(), "lib", "actions.ts"), "utf8");
  const actionStart = actions.indexOf("export async function createLoadAction");
  const actionEnd = actions.indexOf("export async function", actionStart + 20);
  const actionBody = actions.slice(actionStart, actionEnd);
  assert.match(actionBody, /createLoad\(input\)/);
  assert.doesNotMatch(actionBody, /load_number/);

  const rateConId = queries.createLoad(loadInput(customerId, { notes: "rate con" }));
  assert.equal(queries.getLoad(rateConId)?.load_number, "1006231");
  assert.equal(settings.peekNextLoadNumber(), "1006232");

  const peeked = settings.peekNextLoadNumber();
  queries.createLoad(loadInput(customerId, { load_number: peeked }));
  const skipped = queries.createLoad(loadInput(customerId));
  assert.equal(queries.getLoad(skipped)?.load_number, String(Number(peeked) + 1));

  settings.updateLoadManagementSettings({ load_number_next: 1008000, show_sample_data: true });
  assert.equal(settings.peekNextLoadNumber(), "1008000");
  const reserved = queries.createLoad(loadInput(customerId));
  assert.equal(queries.getLoad(reserved)?.load_number, "1008000");
  settings.updateLoadManagementSettings({ load_number_next: 1000, show_sample_data: true });
  assert.equal(settings.peekNextLoadNumber(), "1008001");

  const officeId = queries.createLoad(
    loadInput(customerId, { load_number: "1009100", origin: "Omaha, NE", notes: "tms rate con" }),
  );
  const collided = its.importItsRecords([itsRow("1009100", "Different ITS Customer")], { apply: true });
  assert.equal(collided.added, 0);
  const sameNumber = db.prepare("SELECT id FROM loads WHERE load_number = ?").all("1009100") as Array<{ id: number }>;
  assert.equal(sameNumber.length, 1);
  assert.equal(sameNumber[0]?.id, officeId);
  assert.ok(Number(settings.peekNextLoadNumber()) > 1009100);

  const imported = its.importItsRecords([itsRow("1009200")], { apply: true });
  assert.equal(imported.added, 1);
  assert.equal(
    (db.prepare("SELECT load_number FROM loads WHERE load_number = ?").get("1009200") as { load_number: string })
      .load_number,
    "1009200",
  );
  assert.equal(settings.peekNextLoadNumber(), "1009201");
  const afterImport = queries.createLoad(loadInput(customerId));
  assert.equal(queries.getLoad(afterImport)?.load_number, "1009201");

  assert.throws(
    () => db.transaction(() => guardFreeLoadNumber(db, "1009200"), "immediate")(),
    LoadNumberCollision,
  );
  db.transaction(() => guardFreeLoadNumber(db, "1009202"), "immediate")();

  const concurrent = await Promise.all([1, 2, 3, 4, 5, 6].map(() => allocateInChild(customerId)));
  assert.equal(new Set(concurrent).size, concurrent.length);
  for (const loadNumber of concurrent) {
    assert.match(loadNumber, /^\d+$/);
    assert.ok(Number(loadNumber) >= 1009202);
  }

  assert.deepEqual(listMseLoadNumbers(db), mseBefore);
  assert.equal(queries.getLoad(mse1042)?.load_number, "MSE-1042");
  assert.equal(queries.getLoad(mse1072)?.load_number, "MSE-1072");
  console.log(`MSE- loads left unchanged in this database: ${mseBefore.join(", ")}`);
  console.log(`Seeded demo loads that stay MSE- until JC renumbers them: ${SEEDED_MSE_LOADS.join(", ")}`);

  closeDb();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
