/**
 * Assigning a driver defaults the truck to that driver's current unit.
 * Fictional fixtures only. Does not rewrite loads that are already saved.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assignmentUnitWarnings,
  driverUsualName,
  nextTruckSelection,
  truckIdAfterDriverAssign,
  usualUnitWarning,
  type AssignmentTruckGps,
} from "../lib/driver-unit";

const dbPath = path.join(os.tmpdir(), `tms-driver-unit-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.SAMSARA_API_TOKEN;

const NOW = new Date("2026-10-14T18:00:00.000Z");
const FRESH = "2026-10-14T17:40:00.000Z";
const STALE = "2026-10-14T12:00:00.000Z";

function sliceFn(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\nexport async function ", start + name.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function gpsTruck(partial: Partial<AssignmentTruckGps> & Pick<AssignmentTruckGps, "unitNumber">): AssignmentTruckGps {
  return {
    truckId: partial.truckId ?? 501,
    unitNumber: partial.unitNumber,
    source: partial.source ?? "samsara",
    recordedAt: partial.recordedAt ?? FRESH,
    latitude: partial.latitude === undefined ? 41.25 : partial.latitude,
    longitude: partial.longitude === undefined ? -96.0 : partial.longitude,
    address: partial.address ?? "Omaha, NE",
    loads: partial.loads ?? [],
    gpsDriverId: partial.gpsDriverId ?? null,
    gpsDriverName: partial.gpsDriverName ?? "",
  };
}

function pureChecks(): void {
  assert.equal(driverUsualName("Mara Quinn"), "Mara");
  assert.equal(
    usualUnitWarning({ driverName: "Mara Quinn", usualUnit: "28", loadUnit: "27" }),
    "Mara usually drives Unit 28; this load is on Unit 27",
  );
  assert.equal(usualUnitWarning({ driverName: "Mara Quinn", usualUnit: "28", loadUnit: "28" }), null);
  assert.equal(usualUnitWarning({ driverName: "Mara Quinn", usualUnit: "", loadUnit: "27" }), null);

  assert.equal(
    nextTruckSelection({ truckExplicit: false, currentTruckId: "", usualTruckId: 8, usualListed: true }),
    "8",
  );
  assert.equal(
    nextTruckSelection({ truckExplicit: true, currentTruckId: "7", usualTruckId: 8, usualListed: true }),
    "7",
  );
  assert.equal(
    nextTruckSelection({ truckExplicit: false, currentTruckId: "", usualTruckId: 8, usualListed: false }),
    "",
  );

  const keepExplicit = truckIdAfterDriverAssign({
    previousDriverId: null,
    nextDriverId: 4,
    previousTruckId: null,
    submittedTruckId: 7,
    truckFieldPresent: true,
    truckExplicit: true,
    creating: true,
    driverUnitTruckId: 8,
  });
  assert.equal(keepExplicit, 7);
  const fill = truckIdAfterDriverAssign({
    previousDriverId: null,
    nextDriverId: 4,
    previousTruckId: null,
    submittedTruckId: null,
    truckFieldPresent: true,
    truckExplicit: false,
    creating: true,
    driverUnitTruckId: 8,
  });
  assert.equal(fill, 8);
  const cleared = truckIdAfterDriverAssign({
    previousDriverId: null,
    nextDriverId: 4,
    previousTruckId: 8,
    submittedTruckId: null,
    truckFieldPresent: true,
    truckExplicit: true,
    creating: false,
    driverUnitTruckId: 8,
  });
  assert.equal(cleared, null);
  const unchanged = truckIdAfterDriverAssign({
    previousDriverId: 4,
    nextDriverId: 4,
    previousTruckId: null,
    submittedTruckId: null,
    truckFieldPresent: true,
    truckExplicit: false,
    creating: false,
    driverUnitTruckId: 8,
  });
  assert.equal(unchanged, null, "an ordinary save must not backfill a truck");

  const mismatch = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "28",
    chosenUnit: "27",
    truck: null,
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(mismatch, ["Mara usually drives Unit 28; this load is on Unit 27"]);

  const onOtherLoad = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      loads: [
        {
          loadId: 900,
          loadNumber: "FX-HERON",
          driverId: 5,
          driverName: "Ellis Navarro",
          status: "in_transit",
        },
      ],
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(onOtherLoad, [
    "Unit 27's latest GPS is on an in-progress load for Ellis Navarro (load FX-HERON).",
  ]);
  assert.doesNotMatch(onOtherLoad.join(" "), /\b900\b/);
  assert.doesNotMatch(onOtherLoad.join(" "), /\b501\b/);

  const sameDriver = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      loads: [
        { loadId: 900, loadNumber: "FX-HERON", driverId: 4, driverName: "Mara Quinn", status: "in_transit" },
      ],
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(sameDriver, []);

  const plannedOnly = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      loads: [
        { loadId: 901, loadNumber: "FX-PLANNED", driverId: 5, driverName: "Ellis Navarro", status: "assigned" },
      ],
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(plannedOnly, []);

  const stale = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      recordedAt: STALE,
      loads: [
        { loadId: 900, loadNumber: "FX-HERON", driverId: 5, driverName: "Ellis Navarro", status: "in_transit" },
      ],
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(stale, []);

  const otherSeat = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      gpsDriverId: 6,
      gpsDriverName: "Nia Cole",
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(otherSeat, ["Unit 27's latest GPS shows Nia Cole in the truck."]);

  const thisLoad = assignmentUnitWarnings({
    driverName: "Mara Quinn",
    usualUnit: "27",
    chosenUnit: "27",
    truck: gpsTruck({
      unitNumber: "27",
      loads: [
        { loadId: 9, loadNumber: "FX-HERE", driverId: 5, driverName: "Ellis Navarro", status: "dispatched" },
      ],
    }),
    chosenDriverId: 4,
    thisLoadId: 9,
    now: NOW,
    quietHours: 2,
  });
  assert.deepEqual(thisLoad, []);
}

async function dbChecks(): Promise<void> {
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const { applyDriverTruckDefault, fillRelayAssignmentTrucks, loadAssignmentUnitFacts, lookupDriverCurrentUnit } =
    await import("../lib/driver-unit-db");
  try {
    const customerId = queries.createCustomer({
      name: "Harbor Grain Co",
      billing_notes: "",
      contacts: [],
    });
    const unit28 = queries.createTruck({ unit_number: "28", type: "reefer", capacity_lbs: 44000, status: "available" });
    const unit27 = queries.createTruck({ unit_number: "27", type: "reefer", capacity_lbs: 44000, status: "available" });
    const unit14 = queries.createTruck({ unit_number: "14", type: "reefer", capacity_lbs: 44000, status: "available" });
    const unit99 = queries.createTruck({ unit_number: "99", type: "reefer", capacity_lbs: 44000, status: "available" });
    const unitDown = queries.createTruck({
      unit_number: "44",
      type: "reefer",
      capacity_lbs: 44000,
      status: "out_of_service",
    });
    const mara = queries.createDriver({
      name: "Mara Quinn",
      phone: "555-0101",
      license: "NE-MARA",
      pin: "4101",
      truck_id: unit28,
      status: "available",
      driver_type: "company_driver",
    });
    const ellis = queries.createDriver({
      name: "Ellis Navarro",
      phone: "555-0102",
      license: "NE-ELLIS",
      pin: "4102",
      truck_id: null,
      status: "available",
      driver_type: "company_driver",
    });
    const downDriver = queries.createDriver({
      name: "Nia Cole",
      phone: "555-0103",
      license: "NE-NIA",
      pin: "4103",
      truck_id: unitDown,
      status: "available",
      driver_type: "company_driver",
    });

    const older = queries.createLoad(loadInput(customerId, "FX-OLDER", ellis, unit14, "delivered"));
    const cancelled = queries.createLoad(loadInput(customerId, "FX-CANCEL", ellis, unit99, "cancelled"));
    getDb().prepare("UPDATE loads SET updated_at = ? WHERE id = ?").run("2026-10-01T12:00:00.000Z", older);
    getDb().prepare("UPDATE loads SET updated_at = ? WHERE id = ?").run("2026-10-14T12:00:00.000Z", cancelled);
    assert.equal(lookupDriverCurrentUnit(ellis)?.truckId, unit14);
    assert.equal(lookupDriverCurrentUnit(ellis)?.unitNumber, "14");
    assert.equal(lookupDriverCurrentUnit(mara)?.truckId, unit28);
    assert.equal(lookupDriverCurrentUnit(mara)?.unitNumber, "28");

    const untouched = queries.createLoad(loadInput(customerId, "FX-UNTOUCHED", mara, null, "available"));
    assert.equal(queries.getLoad(untouched)?.truck_id, null, "createLoad must not backfill a truck");

    assert.equal(
      applyDriverTruckDefault({
        previousDriverId: null,
        nextDriverId: mara,
        previousTruckId: null,
        submittedTruckId: null,
        truckFieldPresent: true,
        truckExplicit: false,
        creating: true,
      }),
      unit28,
    );
    assert.equal(
      applyDriverTruckDefault({
        previousDriverId: null,
        nextDriverId: mara,
        previousTruckId: null,
        submittedTruckId: unit27,
        truckFieldPresent: true,
        truckExplicit: true,
        creating: true,
      }),
      unit27,
    );
    assert.equal(
      applyDriverTruckDefault({
        previousDriverId: null,
        nextDriverId: mara,
        previousTruckId: unit27,
        submittedTruckId: null,
        truckFieldPresent: false,
        truckExplicit: false,
        creating: false,
      }),
      unit27,
      "a truck already on the load stays",
    );
    assert.equal(
      applyDriverTruckDefault({
        previousDriverId: null,
        nextDriverId: mara,
        previousTruckId: null,
        submittedTruckId: null,
        truckFieldPresent: false,
        truckExplicit: false,
        creating: false,
      }),
      unit28,
    );
    assert.equal(
      applyDriverTruckDefault({
        previousDriverId: null,
        nextDriverId: downDriver,
        previousTruckId: null,
        submittedTruckId: null,
        truckFieldPresent: true,
        truckExplicit: false,
        creating: true,
      }),
      null,
      "an out-of-service unit is not forced onto the load",
    );
    assert.equal(queries.getLoad(untouched)?.truck_id, null);

    const rolling = queries.createLoad(loadInput(customerId, "FX-HERON", ellis, unit27, "in_transit"));
    getDb()
      .prepare(
        `UPDATE trucks
         SET gps_latitude = ?, gps_longitude = ?, gps_address = ?, gps_recorded_at = ?, gps_source = ?
         WHERE id = ?`,
      )
      .run(41.25, -96, "Omaha, NE", FRESH, "samsara", unit27);
    const facts = loadAssignmentUnitFacts(NOW);
    const live = facts.trucks.find((row) => row.truckId === unit27);
    assert.ok(live);
    const texts = assignmentUnitWarnings({
      driverName: "Mara Quinn",
      usualUnit: facts.drivers.find((row) => row.driverId === mara)?.unitNumber,
      chosenUnit: live?.unitNumber,
      truck: live ?? null,
      chosenDriverId: mara,
      thisLoadId: untouched,
      now: new Date(facts.asOf),
      quietHours: facts.quietHours,
    });
    assert.deepEqual(texts, [
      "Mara usually drives Unit 28; this load is on Unit 27",
      "Unit 27's latest GPS is on an in-progress load for Ellis Navarro (load FX-HERON).",
    ]);
    assert.doesNotMatch(texts.join(" "), new RegExp(`\\b${unit27}\\b`));
    assert.doesNotMatch(texts.join(" "), new RegExp(`\\b${rolling}\\b`));
    assert.doesNotMatch(texts.join(" "), new RegExp(`\\b${ellis}\\b`));

    getDb().prepare("UPDATE trucks SET gps_recorded_at = ? WHERE id = ?").run(STALE, unit27);
    const staleFacts = loadAssignmentUnitFacts(NOW);
    const staleTruck = staleFacts.trucks.find((row) => row.truckId === unit27) ?? null;
    assert.deepEqual(
      assignmentUnitWarnings({
        driverName: "Mara Quinn",
        usualUnit: "28",
        chosenUnit: "27",
        truck: staleTruck,
        chosenDriverId: mara,
        thisLoadId: untouched,
        now: new Date(staleFacts.asOf),
        quietHours: staleFacts.quietHours,
      }),
      ["Mara usually drives Unit 28; this load is on Unit 27"],
    );

    const relayLoad = queries.createLoad(loadInput(customerId, "FX-RELAY", null, null, "available"));
    const { addRelay, getRelay } = await import("../lib/relay-store");
    const relayId = addRelay(relayLoad, { pickup: "Lincoln, NE", delivery: "Omaha, NE" });
    const relay = getRelay(relayId);
    assert.ok(relay);
    const filled = fillRelayAssignmentTrucks(relay, { driver_id: ellis }, false);
    assert.equal(filled.truck_id, unit27, "relay driver gets the truck on the latest non-cancelled load");
    assert.equal(filled.from_truck_id, undefined);
    const kept = fillRelayAssignmentTrucks(relay, { driver_id: ellis, truck_id: unit27 }, true);
    assert.equal(kept.truck_id, unit27);
  } finally {
    closeDb();
    fs.rmSync(dbPath, { force: true });
  }
}

function loadInput(
  customerId: number,
  loadNumber: string,
  driverId: number | null,
  truckId: number | null,
  status: string,
) {
  return {
    load_number: loadNumber,
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup_start: "2026-10-10T12:00:00.000Z",
    pickup_end: "2026-10-10T14:00:00.000Z",
    delivery_start: "2026-10-11T12:00:00.000Z",
    delivery_end: "2026-10-11T18:00:00.000Z",
    weight: 40000,
    commodity: "Grain",
    rate: 1200,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status,
    truck_id: truckId,
    driver_id: driverId,
  };
}

function sourceChecks(): void {
  const actions = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  for (const name of ["createLoadAction", "updateLoadAction", "assignLoadAction"]) {
    assert.match(sliceFn(actions, name), /applyDriverTruckDefault/);
  }
  const relay = fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8");
  assert.match(sliceFn(relay, "updateRelayAssignmentAction"), /fillRelayAssignmentTrucks/);
  const dbSource = fs.readFileSync(path.join(process.cwd(), "lib/driver-unit-db.ts"), "utf8");
  assert.doesNotMatch(dbSource, /UPDATE\s+loads/i);
  const note = fs.readFileSync(path.join(process.cwd(), "components/assignment-unit-note.tsx"), "utf8");
  assert.match(note, /role="status"/);
  assert.match(note, /aria-live="polite"/);
  assert.doesNotMatch(note, /role="alert"/);
  for (const file of ["components/assign-dialog.tsx", "components/load-carrier-screen.tsx"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /nextTruckSelection/);
    assert.match(source, /AssignmentUnitNote/);
    assert.match(source, /truckExplicit/);
    assert.match(source, /truck_explicit/);
  }
  const dialog = fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8");
  const applyAt = dialog.indexOf("function applySuggestion");
  const apply = dialog.slice(applyAt, dialog.indexOf("async function onSubmit"));
  assert.match(apply, /setTruckExplicit\(true\)/);
  assert.match(apply, /keepTruck:\s*true/);
  assert.match(dialog, /Unit \{suggestion\.unit\}/);
}

pureChecks();
sourceChecks();
dbChecks()
  .then(() => {
    console.log("driver-unit-test ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
