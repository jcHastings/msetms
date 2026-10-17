/**
 * Fuel card aliases, cleaned names, and the truck assignment list.
 * Load records and the profile truck never assign or label a fuel driver.
 * Names in this file are fictional. Live names stay in a file outside git.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DriverWithTruck, TruckWithDriver } from "../lib/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-fuel-driver-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";

function driver(id: number, name: string, truckId: number | null = null): DriverWithTruck {
  return { id, name, truck_id: truckId } as DriverWithTruck;
}

function truck(id: number, unit: string, assigned: number | null = null): TruckWithDriver {
  return { id, unit_number: unit, assigned_driver_id: assigned } as TruckWithDriver;
}

function row(partial: {
  driverName?: string;
  unitNumber?: string;
  occurredAt?: string;
  category?: string;
  prompt?: string;
  driverIdRaw?: string;
}) {
  return {
    driverName: partial.driverName ?? "",
    driverIdRaw: partial.driverIdRaw ?? "",
    unitNumber: partial.unitNumber ?? "",
    prompt: partial.prompt ?? "",
    occurredAt: partial.occurredAt,
    category: partial.category,
  };
}

const mina = driver(1, "Mina Quinn Hale");
const christopher = driver(2, "Christopher Hale");
const nolan = driver(3, "Nolan Ellison");
const alex = driver(4, "Alex Peralta");
const rowan = driver(5, "Rowan Avila");
const mateo = driver(6, "Mateo Navarro");
const lucas = driver(7, "Lucas Marrow");
const ivan = driver(8, "Ivan Petro", 18);
const roster = [mina, christopher, nolan, alex, rowan, mateo, lucas, ivan];
const unit18 = truck(18, "18", ivan.id);

const aliases = [
  { driverId: mina.id, alias: "Mina Q Hale" },
  { driverId: mina.id, alias: "Mina Q" },
  { driverId: christopher.id, alias: "Chris Hale" },
  { driverId: christopher.id, alias: "Fuel Chris Hale" },
  { driverId: christopher.id, alias: "Chris on truck 18" },
  { driverId: alex.id, alias: "Peralta Gomez Santos" },
  { driverId: alex.id, alias: "Peralta Gomez" },
  { driverId: alex.id, alias: "Fuel Peralta Gomez" },
  { driverId: nolan.id, alias: "Fuel Nolan Ellison" },
  { driverId: rowan.id, alias: "Rowan" },
  { driverId: mateo.id, alias: "Mateo" },
];

const assignments = [{ truckId: 18, driverId: nolan.id }];
const backupIds = [lucas.id];

function match(
  partial: Parameters<typeof row>[0],
  extra?: {
    drivers?: DriverWithTruck[];
    trucks?: TruckWithDriver[];
    loads?: Array<{
      truck_id: number;
      driver_id: number;
      status: string;
      pickup_start: string;
      pickup_end: string;
      delivery_start: string;
      delivery_end: string;
    }>;
    aliases?: typeof aliases;
    assignments?: typeof assignments;
    backupDriverIds?: number[];
  },
) {
  return matchFuel(
    row(partial),
    extra?.drivers ?? roster,
    extra?.trucks ?? [unit18],
    extra?.loads ?? [],
    {
      aliases: extra?.aliases ?? aliases,
      assignments: extra?.assignments ?? assignments,
      backupDriverIds: extra?.backupDriverIds ?? backupIds,
    },
  );
}

let matchFuel: typeof import("../lib/fuel").matchFuelDriver;

async function main() {
  const fuel = await import("../lib/fuel");
  matchFuel = fuel.matchFuelDriver;
  const fuelDay = "2026-10-13T15:00:00.000Z";
  const loadForOther = [
    {
      truck_id: 18,
      driver_id: rowan.id,
      status: "in_transit",
      pickup_start: "2026-10-13T12:00:00.000Z",
      pickup_end: "2026-10-13T12:00:00.000Z",
      delivery_start: "2026-10-14T12:00:00.000Z",
      delivery_end: "2026-10-14T18:00:00.000Z",
    },
  ];

  assert.equal(match({ driverName: "Mina Q Hale" }).driverId, mina.id, "alias before cleaned name");
  assert.equal(match({ driverName: "mina q" }).driverId, mina.id);
  assert.equal(match({ driverName: "Fuel Chris Hale" }).driverId, christopher.id);
  assert.equal(match({ driverName: "Chris on truck 18", unitNumber: "19" }).driverId, christopher.id);
  assert.equal(match({ driverName: "Peralta Gomez" }).driverId, alex.id);
  assert.equal(match({ driverName: "Rowan" }).driverId, rowan.id);
  assert.equal(match({ driverName: "Mateo" }).driverId, mateo.id);
  assert.equal(
    match({ driverName: "Peralta Gomez" }, { aliases: [{ driverId: nolan.id, alias: "Peralta Gomez" }] }).driverId,
    nolan.id,
    "an alias wins over a cleaned surname match",
  );

  assert.equal(match({ driverName: "MINA Q. HALE" }, { aliases: [] }).driverId, mina.id);
  assert.equal(match({ driverName: "Mina Q" }, { aliases: [] }).driverId, mina.id);
  assert.equal(match({ driverName: "fuel nolan ellison" }, { aliases: [] }).driverId, nolan.id);
  assert.equal(match({ driverName: "Chris Hale" }, { aliases: [] }).driverId, christopher.id);
  assert.equal(match({ driverName: "Peralta Gomez Santos" }, { aliases: [] }).driverId, alex.id);
  assert.equal(match({ driverName: "Rowan Avilla" }, { aliases: [] }).driverId, rowan.id);
  assert.equal(match({ driverName: "Lukas Marrow" }, { aliases: [] }).driverId, lucas.id);
  assert.equal(match({ driverName: "Lucas Marrow", unitNumber: "18" }).driverId, lucas.id);
  assert.equal(match({ driverName: "Lucas Marrow", unitNumber: "18" }).driverSource, "import_name");

  const ambiguous = match(
    { driverName: "Peralta Gomez", unitNumber: "18" },
    { aliases: [], drivers: [alex, driver(9, "Sam Peralta"), nolan] },
  );
  assert.equal(ambiguous.driverId, nolan.id, "an ambiguous card name uses the truck assignment");
  assert.equal(ambiguous.driverSource, "truck_assignment");
  assert.equal(
    match({ driverName: "Peralta Gomez" }, { aliases: [], assignments: [], drivers: [alex, driver(9, "Sam Peralta")] })
      .driverId,
    null,
  );

  const blank = match({ driverName: "", unitNumber: "18", occurredAt: fuelDay });
  assert.equal(blank.driverId, nolan.id);
  assert.equal(blank.driverSource, "truck_assignment");
  assert.equal(
    match({ driverName: "", unitNumber: "18" }, { assignments: [{ truckId: 18, driverId: lucas.id }] }).driverId,
    null,
    "truck fallback never selects a backup driver",
  );
  assert.equal(
    match({ driverName: "Skip Card", unitNumber: "18", occurredAt: fuelDay }).driverId,
    null,
    "a name that matches nothing stays blank",
  );
  assert.equal(
    match({ driverName: "Mateo", unitNumber: "18" }, { aliases: [] }).driverId,
    null,
    "a bare first name is not a cleaned match and does not take the truck",
  );

  const profileOnly = match(
    { driverName: "", unitNumber: "18" },
    { assignments: [], drivers: [ivan], trucks: [truck(18, "18", ivan.id)] },
  );
  assert.equal(profileOnly.driverId, null, "the profile truck never assigns a fuel driver");
  assert.equal(
    match({ driverName: "", unitNumber: "18" }, { loads: loadForOther, assignments: [] }).driverId,
    null,
    "a load never assigns a fuel driver",
  );
  assert.equal(
    match({ driverName: "Mina Q Hale", unitNumber: "18" }, { loads: loadForOther }).driverId,
    mina.id,
    "a load never overrides a card-name match",
  );
  assert.equal(
    match({ driverName: "Lukas Marrow", unitNumber: "18" }, { loads: loadForOther }).driverId,
    lucas.id,
    "truck fallback never overrides a backup card name",
  );
  assert.equal(
    match({ driverName: "", unitNumber: "18" }, { loads: loadForOther }).driverId,
    nolan.id,
    "the truck assignment wins over a load on the same truck",
  );

  const money = match({
    driverName: "Christopher Hale",
    unitNumber: "18",
    category: "money_code",
    occurredAt: fuelDay,
  });
  assert.equal(money.driverId, null);
  assert.equal(money.driverSource, null);

  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const fuelStore = await import("../lib/fuel-store");
  const aliasesApi = await import("../lib/fuel-card-aliases");
  const { buildFuelCloseout } = await import("../lib/fuel-closeout");
  const { milesFromSamsaraOdometer, milesWindowForWeek } = await import("../lib/miles-source");
  const { listDriverMpg } = await import("../lib/fuel-mpg");
  const { fuelTruckDriverLabel, localWeekRange } = await import("../lib/fuel");
  const { scoreFuelAudit, fuelAuditWindowForWeek, fuelAuditSubject } = await import("../lib/fuel-audit");

  const anchor = new Date("2026-10-14T16:00:00.000Z");
  const week = localWeekRange(anchor);
  const truckId = queries.createTruck({
    unit_number: "18",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    plate: "T18",
    vin: "FUELMATCHVIN000018",
  });
  const ivanId = queries.createDriver({
    name: "Ivan Petro",
    phone: "555-1800",
    license: "IP1",
    truck_id: truckId,
    status: "available",
  });
  const nolanId = queries.createDriver({
    name: "Nolan Ellison",
    phone: "555-1801",
    license: "NE1",
    truck_id: null,
    status: "available",
  });
  const minaId = queries.createDriver({
    name: "Mina Quinn Hale",
    phone: "555-1802",
    license: "MQ1",
    truck_id: null,
    status: "available",
  });
  const lucasId = queries.createDriver({
    name: "Lucas Marrow",
    phone: "555-1803",
    license: "LM1",
    truck_id: null,
    status: "available",
  });
  const rowanId = queries.createDriver({
    name: "Rowan Avila",
    phone: "555-1804",
    license: "RA1",
    truck_id: null,
    status: "available",
  });
  aliasesApi.setFuelBackupDriver(lucasId, true);
  assert.throws(() => aliasesApi.setTruckDriverAssignment(truckId, lucasId), /backup/);
  aliasesApi.setTruckDriverAssignment(truckId, nolanId);
  const otherTruckId = queries.createTruck({
    unit_number: "19",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    plate: "T19",
    vin: "FUELMATCHVIN000019",
  });
  aliasesApi.setTruckDriverAssignment(otherTruckId, nolanId);
  assert.equal(
    aliasesApi.listTruckDriverAssignments().some((item) => item.truckId === truckId),
    false,
    "each driver has one truck",
  );
  aliasesApi.setTruckDriverAssignment(truckId, nolanId);
  assert.equal(
    aliasesApi.listTruckDriverAssignments().some((item) => item.truckId === otherTruckId),
    false,
  );

  const aliasId = aliasesApi.addDriverCardAlias(minaId, "Mina Q");
  aliasesApi.updateDriverCardAlias(aliasId, "Mina Q Hale");
  assert.equal(aliasesApi.listDriverCardAliases(minaId)[0]?.alias, "Mina Q Hale");
  assert.throws(() => aliasesApi.addDriverCardAlias(nolanId, "Mina Q. Hale"), /already saved/);
  const haleId = queries.createDriver({
    name: "Christopher Hale",
    phone: "555-1805",
    license: "CH1",
    truck_id: null,
    status: "available",
  });
  aliasesApi.addDriverCardAlias(haleId, "Chris on truck 18");

  queries.saveTruckOdometer(truckId, { miles: 1000, recordedAt: week.start.toISOString(), source: "samsara" });
  queries.saveTruckOdometer(truckId, { miles: 1600, recordedAt: anchor.toISOString(), source: "samsara" });
  const fuelAt = "2026-10-13T15:00:00.000Z";
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
        prompt_data, dedup_key, created_at, driver_source
      ) VALUES (?, ?, ?, 'ODESSA TX', 80, 4, 320, '', 'closeout-18', 'truck_diesel', '18', '', 'CL-18', '', 'closeout-18', ?, 'import_name')`,
    )
    .run(fuelAt, minaId, truckId, new Date().toISOString());

  const window = milesWindowForWeek(week.startYmd);
  const labeledMiles = milesFromSamsaraOdometer(window);
  const truckMiles = labeledMiles.find((item) => item.truckId === truckId);
  assert.ok(truckMiles);
  assert.equal(truckMiles.driverName, "Mina Quinn Hale");
  assert.equal(truckMiles.driverId, minaId);
  assert.equal(fuelTruckDriverLabel({
    truckId,
    unit: "18",
    fromIso: window.fromIso,
    toIso: window.toIso,
    rows: fuelStore.listFuelTransactions(),
    loads: [
      {
        truck_id: truckId,
        driver_id: rowanId,
        status: "in_transit",
        pickup_start: fuelAt,
        delivery_end: fuelAt,
      },
    ],
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  }).driverName, "Mina Quinn Hale");

  const customerId = queries.createCustomer({ name: "Fuel Match Co", billing_notes: "", contacts: [] });
  queries.createLoad({
    customer_id: customerId,
    load_number: "FM-18",
    origin: "Odessa, TX",
    destination: "Dallas, TX",
    pickup_start: "2026-10-13T12:00:00.000Z",
    pickup_end: "2026-10-13T14:00:00.000Z",
    delivery_start: "2026-10-14T12:00:00.000Z",
    delivery_end: "2026-10-14T18:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "in_transit",
    truck_id: truckId,
    driver_id: rowanId,
  });

  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = NULL, driver_source = '' WHERE dedup_key = 'closeout-18'")
    .run();
  const unlabeled = milesFromSamsaraOdometer(window);
  assert.equal(unlabeled.find((item) => item.truckId === truckId)?.driverName, "Unassigned");
  assert.equal(unlabeled.find((item) => item.truckId === truckId)?.driverId, null);
  const unlabeledCloseout = buildFuelCloseout({
    weekStartYmd: week.startYmd,
    now: anchor,
    rows: fuelStore.listFuelTransactions().filter((item) => item.dedup_key === "closeout-18"),
    miles: unlabeled,
    milesSource: { id: "samsara", label: "Samsara odometer", status: "persisted", note: "test" },
    loads: queries.listLoads({ status: "all" }),
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  });
  assert.equal(unlabeledCloseout.drivers.some((item) => item.driverName === "Ivan Petro"), false);
  assert.equal(unlabeledCloseout.drivers.some((item) => item.driverName === "Rowan Avila"), false);
  assert.equal(unlabeledCloseout.drivers.find((item) => item.unit === "18")?.driverName, "Unassigned");

  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = ?, driver_source = 'import_name' WHERE dedup_key = 'closeout-18'")
    .run(minaId);
  const minaCloseout = buildFuelCloseout({
    weekStartYmd: week.startYmd,
    now: anchor,
    rows: fuelStore.listFuelTransactions().filter((item) => item.dedup_key === "closeout-18"),
    miles: milesFromSamsaraOdometer(window),
    milesSource: { id: "samsara", label: "Samsara odometer", status: "persisted", note: "test" },
    loads: queries.listLoads({ status: "all" }),
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  });
  assert.equal(minaCloseout.drivers.find((item) => item.unit === "18")?.driverName, "Mina Quinn Hale");
  const auditRow = fuelStore.listFuelTransactions().find((item) => item.dedup_key === "closeout-18");
  assert.ok(auditRow);
  assert.equal(fuelAuditSubject(auditRow).driverName, "Mina Quinn Hale");
  const audit = scoreFuelAudit([auditRow], fuelAuditWindowForWeek(week.startYmd), undefined, {
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  });
  assert.equal(audit.flags.some((flag) => flag.driverName === "Ivan Petro" || flag.driverName === "Rowan Avila"), false);

  const mpg = listDriverMpg("week", anchor);
  assert.equal(mpg.rows.find((item) => item.driverId === ivanId)?.truckUnit, "");
  assert.equal(mpg.rows.find((item) => item.driverId === rowanId)?.truckUnit, "");
  assert.equal(mpg.rows.find((item) => item.driverId === minaId)?.driverName, "Mina Quinn Hale");
  assert.equal(mpg.rows.find((item) => item.driverId === minaId)?.truckUnit, "18");
  const rollup = fuelStore.listFuelRollupsForWeek(week.startYmd);
  assert.equal(rollup.find((item) => item.id === minaId)?.name, "Mina Quinn Hale");
  assert.equal(rollup.some((item) => item.name === "Ivan Petro"), false);

  const imported = fuelStore.importFuelFromText(
    [
      "Date,Time,Driver Name,Unit,Category,Gallons,Price,Total,Invoice",
      "10/13/2026,08:00,Lukas Marrow,18,Diesel,10,3.00,30.00,INV-LUKAS",
      "10/13/2026,09:00,Skip Card,18,Diesel,11,3.00,33.00,INV-SKIP",
      "10/13/2026,10:00,,18,Diesel,12,3.00,36.00,INV-BLANK",
    ].join("\n"),
    "card-names.csv",
  );
  assert.deepEqual(imported.errors, []);
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
        prompt_data, dedup_key, created_at, driver_source
      ) VALUES (?, ?, ?, 'ODESSA TX', NULL, NULL, 50, '', 'card-names.csv', 'money_code', '18', 'Mina Quinn Hale', 'INV-MONEY', '', 'inv-money', ?, '')`,
    )
    .run(fuelAt, null, truckId, new Date().toISOString());
  fuelStore.rematchFuelTransactionDrivers();
  const lukasRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-LUKAS");
  const skipRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-SKIP");
  const blankRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-BLANK");
  const moneyRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-MONEY");
  assert.ok(lukasRow && skipRow && blankRow && moneyRow);
  assert.equal(lukasRow.driver_id, lucasId);
  assert.equal(lukasRow.driver_source, "import_name");
  assert.equal(skipRow.driver_id, null);
  assert.equal(blankRow.driver_id, nolanId);
  assert.equal(blankRow.driver_source, "truck_assignment");
  assert.equal(moneyRow.driver_id, null);
  assert.ok(aliasesApi.listNewFuelCardNames().includes("Skip Card"));
  assert.equal(aliasesApi.listNewFuelCardNames().includes("Lukas Marrow"), false);
  assert.equal(aliasesApi.listNewFuelCardNames().some((name) => /money/i.test(name)), false);

  fuelStore.assignFuelTransactionDriver(lukasRow.id, minaId);
  fuelStore.rematchFuelTransactionDrivers();
  const kept = fuelStore.getFuelTransaction(lukasRow.id);
  assert.equal(kept?.driver_id, minaId);
  assert.equal(kept?.driver_source, "manual");
  assert.equal(fuelStore.getFuelTransaction(blankRow.id)?.driver_id, nolanId);
  assert.equal(fuelStore.getFuelTransaction(moneyRow.id)?.driver_id, null);

  aliasesApi.addDriverCardAlias(rowanId, "Skip Card");
  fuelStore.rematchFuelTransactionDrivers();
  assert.equal(fuelStore.getFuelTransaction(skipRow.id)?.driver_id, rowanId);
  assert.equal(fuelStore.getFuelTransaction(skipRow.id)?.driver_source, "import_name");
  assert.equal(aliasesApi.listNewFuelCardNames().includes("Skip Card"), false);
  assert.equal(fuelStore.getFuelTransaction(lukasRow.id)?.driver_id, minaId, "rematch keeps a manual assignment");

  aliasesApi.deleteDriverCardAlias(aliasId);
  assert.equal(
    aliasesApi.listDriverCardAliases(minaId).some((item) => item.alias === "Mina Q Hale"),
    false,
  );

  const page = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/[id]/page.tsx"), "utf8");
  const fuelPage = fs.readFileSync(path.join(process.cwd(), "app/fuel/page.tsx"), "utf8");
  assert.match(page, /DriverCardAliases/);
  assert.match(fuelPage, /FuelNewCardNames/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel-store.ts"), "utf8"), /driver_source === "manual"/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fuel-store.ts"), "utf8"), /listFuelMatchLoads/);

  const seedSource = fs.readFileSync(path.join(process.cwd(), "lib/fuel-card-seed.ts"), "utf8");
  assert.match(seedSource, /readFuelCardDirectory/);
  assert.doesNotMatch(seedSource, /const CARD_ALIASES/);
  const { applyFuelCardDirectory, readFuelCardDirectory } = await import("../lib/fuel-card-seed");
  const examplePath = path.join(process.cwd(), "data/fuel-card-directory.example.json");
  const directory = readFuelCardDirectory(examplePath);
  const allowedNames = new Set([
    "Mina Quinn Hale",
    "Christopher Hale",
    "Nolan Ellison",
    "Rowan Avila",
    "Lucas Marrow",
    "Ivan Petro",
    "Alex Peralta",
    "Mateo Navarro",
  ]);
  const exampleNames = [
    ...directory.aliases.map((group) => group.driver),
    ...directory.assignments.map((pair) => pair.driver),
    ...directory.backupDrivers,
    ...directory.blockedDrivers,
  ];
  for (const name of exampleNames) {
    assert.equal(allowedNames.has(name), true, name);
  }
  const applied = applyFuelCardDirectory(getDb(), directory, { write: true });
  assert.deepEqual(applied.missingDrivers, []);
  assert.deepEqual(applied.missingTrucks, []);
  assert.ok(applied.aliasesInserted > 0);
  assert.equal(
    (getDb().prepare("SELECT fuel_backup FROM drivers WHERE id = ?").get(lucasId) as { fuel_backup: number })
      .fuel_backup,
    1,
  );
  assert.equal(
    (
      getDb().prepare("SELECT COUNT(*) AS n FROM truck_driver_assignments WHERE driver_id = ?").get(ivanId) as {
        n: number;
      }
    ).n,
    0,
    "a blocked driver is not assigned",
  );
  const again = applyFuelCardDirectory(getDb(), directory, { write: true });
  assert.equal(again.aliasesInserted, 0);
  const blocked = applyFuelCardDirectory(
    getDb(),
    {
      aliases: [],
      assignments: [{ unit: "18", driver: "Ivan Petro" }],
      backupDrivers: [],
      blockedDrivers: ["Ivan Petro"],
    },
    { write: true },
  );
  assert.equal(blocked.assignmentsSet, 0);
  assert.equal(
    (
      getDb().prepare("SELECT driver_id FROM truck_driver_assignments WHERE truck_id = ?").get(truckId) as {
        driver_id: number;
      }
    ).driver_id,
    nolanId,
  );
  assert.throws(() => readFuelCardDirectory(path.join(tmp, "missing-directory.json")), /Could not read/);

  closeDb();
  const cliDb = path.join(tmp, "cli.db");
  const cli = spawnSync(
    "npx",
    ["tsx", "scripts/seed-fuel-card-directory.ts", "--db", cliDb, "--file", examplePath],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TMS_SKIP_SEED: "1", TMS_DB_PATH: cliDb } },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const report = JSON.parse(cli.stdout) as { apply: boolean; missingDrivers: string[] };
  assert.equal(report.apply, false);
  assert.ok(report.missingDrivers.length > 0);
  console.log("fuel-driver-match-test ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
