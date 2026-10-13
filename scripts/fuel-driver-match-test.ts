/**
 * Card-name matching and truck-load fallback for fuel drivers.
 * Profile truck (drivers.truck_id / trucks.assigned_driver_id) never assigns a row
 * and never labels a truck in the closeout or MPG table.
 */
import assert from "node:assert/strict";
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

const jose = driver(1, "Jose Luis Torres");
const christopher = driver(2, "Christopher Howell");
const steve = driver(3, "Steve Eller");
const ceferino = driver(4, "Chris Ceferino");
const german = driver(5, "German Avila");
const luis = driver(6, "Luis Garcia");
const roster = [jose, christopher, steve, ceferino, german, luis];
const unit41 = truck(41, "41", christopher.id);

function loadFor(
  driverId: number,
  truckId: number,
  pickup: string,
  delivery: string,
  status = "in_transit",
) {
  return {
    truck_id: truckId,
    driver_id: driverId,
    status,
    pickup_start: pickup,
    pickup_end: pickup,
    delivery_start: delivery,
    delivery_end: delivery,
  };
}

async function main() {
  const { matchFuelDriver } = await import("../lib/fuel");
  const fuelDay = "2026-10-13T15:00:00.000Z";

  assert.equal(matchFuelDriver(row({ driverName: "Jose L Torres" }), roster, []).driverId, jose.id);
  assert.equal(matchFuelDriver(row({ driverName: "Jose L. Torres" }), roster, []).driverId, jose.id);
  assert.equal(matchFuelDriver(row({ driverName: "JOSE L TORRES" }), roster, []).driverId, jose.id);
  assert.equal(matchFuelDriver(row({ driverName: "Jose L" }), roster, []).driverId, jose.id);
  assert.equal(matchFuelDriver(row({ driverName: "Chris Howell" }), roster, []).driverId, christopher.id);
  assert.equal(matchFuelDriver(row({ driverName: "Fuel Chris Howell" }), roster, []).driverId, christopher.id);
  assert.equal(matchFuelDriver(row({ driverName: "fuel steve eller" }), roster, []).driverId, steve.id);
  assert.equal(matchFuelDriver(row({ driverName: "Fuel Steve Eller" }), roster, []).driverId, steve.id);
  assert.equal(
    matchFuelDriver(row({ driverName: "Ceferino Oquendo Garcia" }), roster, []).driverId,
    ceferino.id,
  );
  assert.equal(matchFuelDriver(row({ driverName: "Ceferino Garcia" }), roster, []).driverId, ceferino.id);
  assert.equal(matchFuelDriver(row({ driverName: "Fuel Ceferino Oquendo" }), roster, []).driverId, ceferino.id);
  assert.equal(
    matchFuelDriver(row({ driverName: "German Avilla" }), roster, []).driverId,
    german.id,
    "Avilla alias still matches Avila",
  );
  assert.equal(
    matchFuelDriver(row({ driverName: "Christoph Howell" }), [christopher], []).driverId,
    christopher.id,
  );

  const ambiguousJose = matchFuelDriver(
    row({ driverName: "Jose L Torres" }),
    [jose, driver(8, "Jose Torres")],
    [],
  );
  assert.equal(ambiguousJose.driverId, null);
  assert.equal(ambiguousJose.driverSource, null);

  const twoCeferinos = matchFuelDriver(
    row({ driverName: "Ceferino Garcia" }),
    [ceferino, driver(9, "Ana Ceferino")],
    [],
  );
  assert.equal(twoCeferinos.driverId, null);

  const twoJoses = matchFuelDriver(
    row({ driverName: "Jose L" }),
    [jose, driver(10, "Jose Lorenzo Vega")],
    [],
  );
  assert.equal(twoJoses.driverId, null);

  assert.equal(
    matchFuelDriver(row({ driverName: "German", unitNumber: "41", occurredAt: fuelDay }), roster, [unit41], []).driverId,
    null,
    "first name alone needs a confirming load",
  );
  const germanLoad = [
    loadFor(german.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T12:00:00.000Z"),
  ];
  assert.equal(
    matchFuelDriver(row({ driverName: "German", unitNumber: "41", occurredAt: fuelDay }), roster, [unit41], germanLoad)
      .driverId,
    german.id,
  );
  assert.equal(
    matchFuelDriver(row({ driverName: "Luis", unitNumber: "41", occurredAt: fuelDay }), roster, [unit41], [
      loadFor(luis.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T12:00:00.000Z"),
    ]).driverId,
    luis.id,
  );
  assert.equal(
    matchFuelDriver(row({ driverName: "Chris", unitNumber: "41", occurredAt: fuelDay }), roster, [unit41], [
      loadFor(christopher.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T12:00:00.000Z"),
    ]).driverId,
    null,
    "Chris matches both Christopher and Chris Ceferino",
  );
  assert.equal(
    matchFuelDriver(
      row({ driverName: "Chris", unitNumber: "41", occurredAt: fuelDay }),
      [christopher, steve, german],
      [unit41],
      [loadFor(christopher.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T12:00:00.000Z")],
    ).driverId,
    christopher.id,
  );
  assert.equal(
    matchFuelDriver(
      row({ driverName: "Chris", unitNumber: "41", occurredAt: fuelDay }),
      [christopher],
      [unit41],
      [],
    ).driverId,
    null,
    "unique first name without a load stays unmatched",
  );

  const profileOnly = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: fuelDay }),
    [driver(2, "Christopher Howell", 41)],
    [truck(41, "41", 2)],
    [],
  );
  assert.equal(profileOnly.driverId, null);
  assert.equal(profileOnly.truckId, 41);

  const covered = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: fuelDay }),
    roster,
    [unit41],
    [loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z")],
  );
  assert.equal(covered.driverId, steve.id);
  assert.equal(covered.driverSource, "truck_load");

  const dayBefore = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: "2026-10-12T15:00:00.000Z" }),
    roster,
    [unit41],
    [loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z")],
  );
  assert.equal(dayBefore.driverId, steve.id, "fuel the day before pickup still counts");
  const twoDaysBefore = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: "2026-10-11T15:00:00.000Z" }),
    roster,
    [unit41],
    [loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z")],
  );
  assert.equal(twoDaysBefore.driverId, null);

  const twoLoads = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: fuelDay }),
    roster,
    [unit41],
    [
      loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-13T20:00:00.000Z"),
      loadFor(german.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z"),
    ],
  );
  assert.equal(twoLoads.driverId, null);

  const unknownName = matchFuelDriver(
    row({ driverName: "Sheet Only Driver", unitNumber: "41", occurredAt: fuelDay }),
    roster,
    [unit41],
    [loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z")],
  );
  assert.equal(unknownName.driverId, null, "an unknown full name does not take the load driver");

  const cancelled = matchFuelDriver(
    row({ driverName: "", unitNumber: "41", occurredAt: fuelDay }),
    roster,
    [unit41],
    [loadFor(steve.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z", "cancelled")],
  );
  assert.equal(cancelled.driverId, null);

  const money = matchFuelDriver(
    row({ driverName: "Christopher Howell", unitNumber: "41", category: "money_code", occurredAt: fuelDay }),
    roster,
    [unit41],
    [loadFor(christopher.id, 41, "2026-10-13T12:00:00.000Z", "2026-10-14T18:00:00.000Z")],
  );
  assert.equal(money.driverId, null);
  assert.equal(money.driverSource, null);

  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const fuelStore = await import("../lib/fuel-store");
  const { buildFuelCloseout } = await import("../lib/fuel-closeout");
  const { milesFromSamsaraOdometer, milesWindowForWeek } = await import("../lib/miles-source");
  const { listDriverMpg } = await import("../lib/fuel-mpg");
  const { localWeekRange } = await import("../lib/fuel");

  const anchor = new Date("2026-10-14T16:00:00.000Z");
  const week = localWeekRange(anchor);
  const truckId = queries.createTruck({
    unit_number: "41",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    plate: "T41",
    vin: "FUELMATCHVIN000041",
  });
  const yoelId = queries.createDriver({
    name: "Yoel Feder",
    phone: "555-4100",
    license: "Y1",
    truck_id: truckId,
    status: "available",
  });
  const samId = queries.createDriver({
    name: "Sam Loader",
    phone: "555-4101",
    license: "S1",
    truck_id: null,
    status: "available",
  });
  queries.saveTruckOdometer(truckId, { miles: 1000, recordedAt: week.start.toISOString(), source: "samsara" });
  queries.saveTruckOdometer(truckId, { miles: 1600, recordedAt: anchor.toISOString(), source: "samsara" });
  const fuelAt = "2026-10-13T15:00:00.000Z";
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
        prompt_data, dedup_key, created_at
      ) VALUES (?, NULL, ?, 'ODESSA TX', 80, 4, 320, '', 'closeout-41', 'truck_diesel', '41', '', 'CL-41', '', 'closeout-41', ?)`,
    )
    .run(fuelAt, truckId, new Date().toISOString());

  const window = milesWindowForWeek(week.startYmd);
  const unlabeled = milesFromSamsaraOdometer(window);
  const truckMiles = unlabeled.find((item) => item.truckId === truckId);
  assert.ok(truckMiles);
  assert.equal(truckMiles.driverName, "Unassigned");
  assert.equal(truckMiles.driverId, null);
  assert.equal(truckMiles.miles, 600);

  const closeoutRows = fuelStore.listFuelTransactions().filter((item) => item.dedup_key === "closeout-41");
  const unlabeledCloseout = buildFuelCloseout({
    weekStartYmd: week.startYmd,
    now: anchor,
    rows: closeoutRows,
    miles: unlabeled,
    milesSource: {
      id: "samsara",
      label: "Samsara odometer",
      status: "persisted",
      note: "test",
    },
    loads: queries.listLoads({ status: "all" }),
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  });
  assert.equal(unlabeledCloseout.drivers.some((item) => item.driverName === "Yoel Feder"), false);
  assert.equal(
    unlabeledCloseout.drivers.find((item) => item.unit === "41")?.driverName,
    "Unassigned",
  );

  const mpgBefore = listDriverMpg("week", anchor);
  assert.equal(mpgBefore.rows.find((item) => item.driverId === yoelId)?.truckUnit, "");
  assert.equal(mpgBefore.rows.find((item) => item.driverId === yoelId)?.miles, null);

  const customerId = queries.createCustomer({
    name: "Fuel Match Co",
    billing_notes: "",
    contacts: [],
  });
  queries.createLoad({
    customer_id: customerId,
    load_number: "FM-41",
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
    driver_id: samId,
  });

  const labeled = milesFromSamsaraOdometer(window);
  assert.equal(labeled.find((item) => item.truckId === truckId)?.driverName, "Sam Loader");
  const labeledCloseout = buildFuelCloseout({
    weekStartYmd: week.startYmd,
    now: anchor,
    rows: fuelStore.listFuelTransactions().filter((item) => item.dedup_key === "closeout-41"),
    miles: labeled,
    milesSource: {
      id: "samsara",
      label: "Samsara odometer",
      status: "persisted",
      note: "test",
    },
    loads: queries.listLoads({ status: "all" }),
    drivers: queries.listDrivers().map((item) => ({ id: item.id, name: item.name })),
  });
  assert.equal(labeledCloseout.drivers.find((item) => item.unit === "41")?.driverName, "Sam Loader");
  assert.equal(labeledCloseout.drivers.some((item) => item.driverName === "Yoel Feder"), false);
  const mpgAfter = listDriverMpg("week", anchor);
  assert.equal(mpgAfter.rows.find((item) => item.driverId === yoelId)?.truckUnit, "");
  assert.equal(mpgAfter.rows.find((item) => item.driverId === samId)?.truckUnit, "41");
  assert.equal(mpgAfter.rows.find((item) => item.driverId === samId)?.miles, 600);

  const howellId = queries.createDriver({
    name: "Christopher Howell",
    phone: "555-4132",
    license: "H1",
    truck_id: null,
    status: "available",
  });
  const ellerId = queries.createDriver({
    name: "Steve Eller",
    phone: "555-4126",
    license: "E1",
    truck_id: null,
    status: "available",
  });
  const imported = fuelStore.importFuelFromText(
    [
      "Date,Time,Driver Name,Unit,Category,Gallons,Price,Total,Invoice",
      "10/13/2026,08:00,Chris Howell,41,Diesel,10,3.00,30.00,INV-CHRIS",
      "10/13/2026,11:00,,41,Diesel,12,3.00,36.00,INV-BLANK",
    ].join("\n"),
    "card-names.csv",
  );
  assert.deepEqual(imported.errors, []);
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
        prompt_data, dedup_key, created_at
      ) VALUES (?, NULL, ?, 'ODESSA TX', NULL, NULL, 50, '', 'card-names.csv', 'money_code', '41', 'Christopher Howell', 'INV-MONEY', '', 'inv-money', ?)`,
    )
    .run(fuelAt, truckId, new Date().toISOString());
  fuelStore.rematchFuelTransactionDrivers();
  const chrisRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-CHRIS");
  const moneyRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-MONEY");
  const blankRow = fuelStore.listFuelTransactions().find((item) => item.invoice_number === "INV-BLANK");
  assert.ok(chrisRow && moneyRow && blankRow);
  assert.equal(chrisRow.driver_id, howellId);
  assert.equal(chrisRow.driver_source, "import_name");
  assert.equal(moneyRow.driver_id, null);
  assert.equal(blankRow.driver_id, samId);
  assert.equal(blankRow.driver_source, "truck_load");

  fuelStore.assignFuelTransactionDriver(chrisRow.id, ellerId);
  fuelStore.rematchFuelTransactionDrivers();
  const kept = fuelStore.getFuelTransaction(chrisRow.id);
  assert.equal(kept?.driver_id, ellerId);
  assert.equal(kept?.driver_source, "manual");
  assert.equal(fuelStore.getFuelTransaction(moneyRow.id)?.driver_id, null);
  assert.equal(fuelStore.getFuelTransaction(blankRow.id)?.driver_id, samId);

  closeDb();
  console.log("fuel-driver-match-test ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
