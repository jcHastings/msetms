import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-custody-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

const pickup = "2026-04-01T12:00:00.000Z";
const pickupEnd = "2026-04-01T14:00:00.000Z";
const delivery = "2026-04-02T12:00:00.000Z";
const deliveryEnd = "2026-04-02T16:00:00.000Z";

async function main() {
  const { getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const custody = await import("../lib/trailer-custody");
  const relayStore = await import("../lib/relay-store");

  const columns = getDb().prepare("PRAGMA table_info(trailer_custody_events)").all() as Array<{ name: string }>;
  const names = columns.map((column) => column.name);
  for (const name of [
    "trailer_id",
    "driver_id",
    "truck_id",
    "from_at",
    "to_at",
    "left_where",
    "left_name",
    "load_number",
    "note",
    "source",
  ]) {
    assert.ok(names.includes(name), `custody column ${name}`);
  }

  const custodySource = fs.readFileSync(path.join(process.cwd(), "lib/trailer-custody.ts"), "utf8");
  assert.doesNotMatch(custodySource, /integrations\/orbcomm|integrations\/samsara/);
  const panel = fs.readFileSync(path.join(process.cwd(), "components/trailer-custody-panel.tsx"), "utf8");
  const dropForm = fs.readFileSync(path.join(process.cwd(), "components/trailer-drop-form.tsx"), "utf8");
  const trailerPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/[id]/page.tsx"), "utf8");
  const custodyPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/custody/page.tsx"), "utf8");
  const trailersList = fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/page.tsx"), "utf8");
  const driverPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/[id]/page.tsx"), "utf8");
  assert.match(panel, /No custody recorded\./);
  assert.match(panel, /Dropped at/);
  assert.match(panel, /GPS stays on Orbcomm/);
  assert.match(panel, /No open custody\./);
  assert.doesNotMatch(panel, /Samsara/);
  assert.match(dropForm, /Save drop/);
  assert.match(dropForm, /name="left_where"/);
  assert.match(dropForm, /name="left_name"/);
  assert.match(dropForm, /name="load_number"/);
  assert.match(trailerPage, /TrailerCustodyPanel/);
  assert.match(trailersList, /Who had a trailer/);
  assert.match(custodyPage, /Trailers held/);
  assert.match(custodyPage, /Pick a driver and a date range\./);
  assert.match(custodyPage, /No trailers recorded in that range\./);
  assert.match(driverPage, /Trailers held/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /dropTrailerCustodyAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /applyLoadCustody/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/driver-ops.ts"), "utf8"), /updateDriverProgress/);

  const customerId = queries.createCustomer({
    name: "Custody Yard",
    billing_notes: "",
    contacts: [],
  });
  const truckA = queries.createTruck({
    unit_number: "C-12",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const truckB = queries.createTruck({
    unit_number: "C-14",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const trailerA = queries.createTrailer({ unit_number: "R-100", type: "reefer", status: "available" });
  const trailerB = queries.createTrailer({ unit_number: "R-200", type: "reefer", status: "available" });
  const driverA = queries.createDriver({
    name: "Ada Miles",
    phone: "555-0101",
    license: "NE-CDL-ADA",
    pin: "4101",
    truck_id: truckA,
    status: "available",
  });
  const driverB = queries.createDriver({
    name: "Bea Lane",
    phone: "555-0102",
    license: "NE-CDL-BEA",
    pin: "4102",
    truck_id: truckB,
    status: "available",
  });
  const receiverId = queries.createLocation({
    name: "Lineage Hastings",
    street: "1 Dock St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
  });

  function loadInput(extra: Record<string, unknown> = {}) {
    return {
      customer_id: customerId,
      origin: "Omaha, NE",
      destination: "Hastings, NE",
      pickup_start: pickup,
      pickup_end: pickupEnd,
      delivery_start: delivery,
      delivery_end: deliveryEnd,
      weight: 20000,
      commodity: "Frozen",
      rate: 1800,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "assigned",
      truck_id: truckA,
      driver_id: driverA,
      trailer_id: trailerA,
      ...extra,
    };
  }

  function countEvents(): number {
    return (
      getDb().prepare("SELECT COUNT(*) AS count FROM trailer_custody_events").get() as { count: number }
    ).count;
  }
  function reeferCount(): number {
    return (getDb().prepare("SELECT COUNT(*) AS count FROM reefer_readings").get() as { count: number }).count;
  }

  const beforeReefer = reeferCount();
  const beforeTrailer = JSON.stringify(queries.getTrailer(trailerA));
  assert.equal(
    custody.applyLoadCustody({
      loadId: 0,
      loadNumber: "SO-GHOST",
      previous: null,
      next: { trailerId: 999999, driverId: driverA, truckId: truckA, status: "assigned" },
    }),
    undefined,
  );
  assert.equal(countEvents(), 0, "missing trailer does not invent custody");

  const deliveredId = queries.createLoad(
    loadInput({ load_number: "SO-DELIVERED-CREATE", status: "delivered", trailer_id: trailerA }),
  );
  assert.ok(deliveredId);
  assert.equal(custody.listTrailerCustody(trailerA).length, 0, "creating a delivered load does not invent a hold");

  const bareId = queries.createLoad(
    loadInput({ load_number: "SO-NO-TRAILER", trailer_id: null, truck_id: truckA, driver_id: driverA }),
  );
  queries.assignLoad(bareId, truckA, driverA, null);
  assert.equal(custody.listTrailerCustody(trailerA).length, 0, "assign without a trailer stays blank");

  const assignId = queries.createLoad(loadInput({ load_number: "SO-ASSIGN", trailer_id: null, driver_id: null, truck_id: null, status: "available" }));
  queries.assignLoad(assignId, truckA, driverA, trailerA);
  let rows = custody.listTrailerCustody(trailerA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].driver_id, driverA);
  assert.equal(rows[0].driver_name, "Ada Miles");
  assert.equal(rows[0].truck_id, truckA);
  assert.equal(rows[0].truck_unit, "C-12");
  assert.equal(rows[0].load_number, "SO-ASSIGN");
  assert.equal(rows[0].source, "load_assign");
  assert.equal(rows[0].to_at, null);
  assert.equal(rows[0].left_where, "");
  assert.equal(rows[0].left_name, null);
  queries.assignLoad(assignId, truckA, driverA, trailerA);
  assert.equal(custody.listTrailerCustody(trailerA).length, 1, "same assign does not duplicate");

  queries.assignLoad(assignId, truckB, driverB, trailerA);
  rows = custody.listTrailerCustody(trailerA);
  assert.equal(rows.length, 2);
  const closed = rows.find((row) => row.driver_id === driverA);
  const open = rows.find((row) => row.driver_id === driverB);
  assert.ok(closed?.to_at);
  assert.equal(closed?.left_where, "");
  assert.equal(closed?.left_name, null);
  assert.equal(open?.to_at, null);
  assert.equal(open?.truck_unit, "C-14");
  assert.equal(open?.source, "load_assign");

  const office = custody.recordOfficeDrop({
    trailerId: trailerA,
    leftWhere: "yard",
    leftName: "Omaha yard",
    loadNumber: "SO-ASSIGN",
    note: "Dropped at the gate",
  });
  assert.equal(office.ok, true);
  rows = custody.listTrailerCustody(trailerA);
  const dropped = rows.find((row) => row.driver_id === driverB);
  assert.ok(dropped?.to_at);
  assert.equal(dropped?.left_where, "yard");
  assert.equal(dropped?.left_name, "Omaha yard");
  assert.equal(dropped?.note, "Dropped at the gate");
  assert.equal(custody.listTrailerCustody(trailerA).some((row) => row.to_at == null), false);
  const again = custody.recordOfficeDrop({ trailerId: trailerA, leftWhere: "plant", leftName: "Plant 2" });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error, "No open custody on this trailer.");
  assert.equal(custody.listTrailerCustody(trailerA).length, 2, "refused drop does not invent a row");

  const mismatchId = queries.createLoad(loadInput({ load_number: "SO-MISMATCH", trailer_id: trailerB }));
  assert.equal(queries.getLoad(mismatchId)?.trailer_id, trailerB);
  const wrongLoad = custody.recordOfficeDrop({
    trailerId: trailerB,
    leftWhere: "other",
    leftName: "Scale",
    loadNumber: "SO-OTHER",
  });
  assert.equal(wrongLoad.ok, false);
  if (!wrongLoad.ok) assert.equal(wrongLoad.error, "Open custody is load SO-MISMATCH.");
  assert.equal(custody.listTrailerCustody(trailerB)[0]?.to_at, null);

  const badWhere = custody.recordOfficeDrop({ trailerId: trailerB, leftWhere: "warehouse" });
  assert.equal(badWhere.ok, false);
  if (!badWhere.ok) assert.equal(badWhere.error, "Pick where it was left.");
  assert.throws(() => {
    getDb()
      .prepare(
        `INSERT INTO trailer_custody_events (trailer_id, from_at, left_where, source)
         VALUES (?, ?, 'warehouse', 'load_assign')`,
      )
      .run(trailerB, "2026-01-01T00:00:00.000Z");
  });

  const namedId = queries.createLoad(
    loadInput({
      load_number: "SO-RECV",
      trailer_id: null,
      driver_id: null,
      truck_id: null,
      status: "available",
      consignee_location_id: receiverId,
    }),
  );
  queries.assignLoad(namedId, truckA, driverA, trailerA);
  queries.updateLoadStatus(namedId, "delivered");
  const received = custody.listTrailerCustody(trailerA).find((row) => row.load_number === "SO-RECV");
  assert.ok(received?.to_at);
  assert.equal(received?.left_where, "receiver");
  assert.equal(received?.left_name, "Lineage Hastings");

  const blankDropId = queries.createLoad(
    loadInput({
      load_number: "SO-BLANK",
      trailer_id: null,
      driver_id: null,
      truck_id: null,
      status: "available",
    }),
  );
  queries.assignLoad(blankDropId, truckA, driverA, trailerB);
  queries.updateLoadStatus(blankDropId, "delivered");
  const blankDrop = custody.listTrailerCustody(trailerB).find((row) => row.load_number === "SO-BLANK");
  assert.ok(blankDrop?.to_at);
  assert.equal(blankDrop?.left_where, "");
  assert.equal(blankDrop?.left_name, null);

  const cancelId = queries.createLoad(
    loadInput({
      load_number: "SO-CANCEL",
      trailer_id: null,
      status: "available",
      driver_id: null,
      truck_id: null,
    }),
  );
  const trailerC = queries.createTrailer({ unit_number: "R-300", type: "reefer", status: "available" });
  queries.assignLoad(cancelId, truckA, driverA, trailerC);
  queries.updateLoadStatus(cancelId, "cancelled");
  const cancelled = custody.listTrailerCustody(trailerC)[0];
  assert.ok(cancelled?.to_at);
  assert.equal(cancelled?.left_where, "");
  assert.equal(cancelled?.left_name, null);

  const driverDropTrailer = queries.createTrailer({ unit_number: "R-400", type: "reefer", status: "available" });
  const driverDropId = queries.createLoad(
    loadInput({
      load_number: "SO-DRV",
      trailer_id: driverDropTrailer,
      consignee_location_id: receiverId,
      driver_id: driverA,
      truck_id: truckA,
    }),
  );
  queries.updateDriverProgress(driverDropId, driverA, "delivered");
  const driverDrop = custody.listTrailerCustody(driverDropTrailer)[0];
  assert.equal(driverDrop?.source, "load_assign");
  assert.ok(driverDrop?.to_at);
  assert.equal(driverDrop?.left_where, "receiver");
  assert.equal(driverDrop?.left_name, "Lineage Hastings");
  assert.equal(queries.getLoad(driverDropId)?.status, "delivered");

  const rangeDriver = queries.createDriver({
    name: "Cal Range",
    phone: "555-0199",
    license: "NE-CDL-CAL",
    pin: "4199",
    truck_id: null,
    status: "available",
  });
  const rangeTruck = truckA;
  const rangeA = queries.createTrailer({ unit_number: "R-501", type: "reefer", status: "available" });
  const rangeB = queries.createTrailer({ unit_number: "R-502", type: "reefer", status: "available" });
  custody.applyLoadCustody({
    loadId: 0,
    loadNumber: "SO-RANGE",
    previous: null,
    next: { trailerId: rangeA, driverId: rangeDriver, truckId: rangeTruck, status: "assigned" },
    at: "2026-01-01T15:00:00.000Z",
  });
  custody.applyLoadCustody({
    loadId: 0,
    loadNumber: "SO-RANGE",
    previous: { trailerId: rangeA, driverId: rangeDriver, truckId: rangeTruck, status: "assigned" },
    next: { trailerId: rangeB, driverId: rangeDriver, truckId: rangeTruck, status: "assigned" },
    at: "2026-01-10T15:00:00.000Z",
  });
  const mid = custody.queryDriverCustody({ driverId: rangeDriver, from: "2026-01-05", to: "2026-01-09" });
  assert.equal(mid.ok, true);
  if (mid.ok) {
    assert.deepEqual(
      mid.rows.map((row) => row.trailer_unit),
      ["R-501"],
    );
  }
  const later = custody.queryDriverCustody({ driverId: rangeDriver, from: "2026-03-01", to: "2026-03-02" });
  assert.equal(later.ok, true);
  if (later.ok) {
    assert.deepEqual(
      later.rows.map((row) => row.trailer_unit),
      ["R-502"],
    );
    assert.equal(later.rows[0].to_at, null);
  }
  const other = custody.queryDriverCustody({ driverId: driverB, from: "2026-01-01", to: "2026-03-02" });
  assert.equal(other.ok, true);
  if (other.ok) assert.equal(other.rows.length, 0);
  assert.equal(custody.queryDriverCustody({ driverId: null, from: "", to: "" }).ok, false);
  assert.equal(custody.queryDriverCustody({ driverId: null, from: "", to: "" }).reason, "empty");
  assert.equal(custody.queryDriverCustody({ driverId: null, from: "2026-01-01", to: "2026-01-02" }).reason, "need_driver");
  assert.equal(custody.queryDriverCustody({ driverId: rangeDriver, from: "", to: "2026-01-02" }).reason, "need_dates");
  assert.equal(custody.queryDriverCustody({ driverId: rangeDriver, from: "2026-02-31", to: "2026-03-02" }).reason, "need_dates");
  assert.equal(custody.queryDriverCustody({ driverId: rangeDriver, from: "2026-03-02", to: "2026-03-01" }).reason, "bad_range");
  assert.equal(custody.queryDriverCustody({ driverId: 424242, from: "2026-01-01", to: "2026-01-02" }).reason, "driver_missing");

  const flipTruckA = queries.createTruck({ unit_number: "C-FLIP-A", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const flipTruckB = queries.createTruck({ unit_number: "C-FLIP-B", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const flipTrailerA = queries.createTrailer({ unit_number: "R-FLIP-A", type: "reefer", status: "available" });
  const flipTrailerB = queries.createTrailer({ unit_number: "R-FLIP-B", type: "reefer", status: "available" });
  const flipDriverA = queries.createDriver({
    name: "Dee First",
    phone: "555-0181",
    license: "NE-CDL-DEE",
    pin: "4181",
    truck_id: flipTruckA,
    status: "available",
  });
  const flipDriverB = queries.createDriver({
    name: "Eli Second",
    phone: "555-0182",
    license: "NE-CDL-ELI",
    pin: "4182",
    truck_id: flipTruckB,
    status: "available",
    driver_type: "owner_operator",
    pay_percent: 80,
  });
  const flipLoadId = queries.createLoad(
    loadInput({
      load_number: "SO-RELAY",
      truck_id: flipTruckA,
      driver_id: flipDriverA,
      trailer_id: flipTrailerA,
    }),
  );
  assert.equal(custody.listTrailerCustody(flipTrailerA).filter((row) => row.to_at == null).length, 1);
  const relayId = relayStore.addRelay(flipLoadId, {
    from_driver_id: flipDriverA,
    driver_id: flipDriverB,
    delivery: "Gary, IN",
  });
  assert.equal(custody.listTrailerCustody(flipTrailerA).filter((row) => row.to_at == null).length, 1);
  assert.equal(custody.listTrailerCustody(flipTrailerB).length, 0);
  relayStore.updateRelayAssignment(relayId, {
    truck_id: flipTruckB,
    trailer_id: flipTrailerB,
    completed_at: "2026-04-01T18:00:00.000Z",
  });
  const flipClosed = custody.listTrailerCustody(flipTrailerA).find((row) => row.load_number === "SO-RELAY");
  const flipOpen = custody.listTrailerCustody(flipTrailerB).find((row) => row.to_at == null);
  assert.ok(flipClosed?.to_at);
  assert.equal(flipClosed?.left_where, "");
  assert.equal(flipOpen?.driver_id, flipDriverB);
  assert.equal(flipOpen?.truck_unit, "C-FLIP-B");
  assert.equal(flipOpen?.load_number, "SO-RELAY");
  relayStore.updateRelayAssignment(relayId, { completed_at: "" });
  assert.equal(custody.listTrailerCustody(flipTrailerB).every((row) => row.to_at), true);
  assert.equal(
    custody.listTrailerCustody(flipTrailerA).some((row) => row.to_at == null && row.driver_id === flipDriverA),
    true,
  );

  assert.equal(reeferCount(), beforeReefer, "custody writes do not touch reefer readings");
  assert.equal(JSON.stringify(queries.getTrailer(trailerA)), beforeTrailer, "custody writes do not touch the trailer GPS row");
  assert.equal(custody.recordOfficeDrop({ trailerId: 999999, leftWhere: "yard" }).ok, false);

  console.log("trailer custody ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
