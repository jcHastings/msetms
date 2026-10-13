/**
 * Saving a load must not walk every historical load through listStops().
 * That read runs a geofence pass (and can stamp arrival/departure) and reloads
 * the whole location directory. A driver with ~500 loads and a few thousand
 * locations used to pin the Next.js process for minutes (load 1006275, 10/13).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-empty-miles-save-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.ORBCOMM_USERNAME;
delete process.env.ORBCOMM_PASSWORD;
delete process.env.ORBCOMM_ACCOUNT_ID;
delete process.env.SAMSARA_API_TOKEN;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const LOAD_COUNT = 500;
const SAVED_INDEX = 250;
const LOCATION_COUNT = 3300;
// One listStops() per historical load on this fixture is tens of seconds and stamps every stop.
const BUDGET_MS = 2000;

function day(index: number): string {
  return new Date(Date.UTC(2024, 0, 1 + index, 12, 0, 0)).toISOString();
}

type ClockRow = { id: number; load_id: number; arrived_at: string; departed_at: string };

async function main() {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("empty-miles save test must not call the network");
  }) as typeof fetch;

  const { closeDb, getDb } = await import("../lib/db");
  try {
    const db = getDb();
    const stamp = "2024-01-01T00:00:00.000Z";
    const customerId = Number(
      db
        .prepare(
          "INSERT INTO customers (name, billing_notes, created_at, updated_at) VALUES ('History Customer', '', ?, ?)",
        )
        .run(stamp, stamp).lastInsertRowid,
    );
    const truckId = Number(
      db
        .prepare(
          `INSERT INTO trucks (unit_number, type, capacity_lbs, status, created_at, updated_at)
           VALUES ('HIST-EM-1', 'reefer', 44000, 'available', ?, ?)`,
        )
        .run(stamp, stamp).lastInsertRowid,
    );
    const driverId = Number(
      db
        .prepare(
          `INSERT INTO drivers (name, phone, license, truck_id, status, created_at, updated_at)
           VALUES ('History Driver', '555-0100', 'NE-HIST-EM', ?, 'available', ?, ?)`,
        )
        .run(truckId, stamp, stamp).lastInsertRowid,
    );
    const pickupLocationId = Number(
      db
        .prepare(
          `INSERT INTO locations (
             name, street, city, state, zip, phone, notes, role, scheduling_type, hours, scheduling_notes,
             created_at, updated_at, latitude, longitude
           ) VALUES ('Omaha Yard', '100 Dodge St', 'Omaha', 'NE', '68102', '', '', 'both', 'fcfs', '', '', ?, ?, 41.2565, -95.9345)`,
        )
        .run(stamp, stamp).lastInsertRowid,
    );
    const deliveryLocationId = Number(
      db
        .prepare(
          `INSERT INTO locations (
             name, street, city, state, zip, phone, notes, role, scheduling_type, hours, scheduling_notes,
             created_at, updated_at, latitude, longitude
           ) VALUES ('Kansas City Dock', '200 Main St', 'Kansas City', 'MO', '64101', '', '', 'both', 'fcfs', '', '', ?, ?, 41.2565, -95.9345)`,
        )
        .run(stamp, stamp).lastInsertRowid,
    );

    const insertLocation = db.prepare(
      `INSERT INTO locations (
         name, street, city, state, zip, phone, notes, role, scheduling_type, hours, scheduling_notes,
         created_at, updated_at
       ) VALUES (?, '1 Industrial Rd', 'Omaha', 'NE', '68102', '', '', 'both', 'fcfs', '', '', ?, ?)`,
    );
    const insertLoad = db.prepare(
      `INSERT INTO loads (
         load_number, customer_id, origin, destination,
         pickup_start, pickup_end, delivery_start, delivery_end,
         commodity, rate, notes, status, truck_id, driver_id, created_at, updated_at
       ) VALUES (?, ?, 'Omaha, NE', 'Kansas City, MO', ?, ?, ?, ?, 'Beef', 1200, '', ?, ?, ?, ?, ?)`,
    );
    const insertStop = db.prepare(
      `INSERT INTO load_stops (
         load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
    );

    const loadIds: number[] = [];
    const seed = db.transaction(() => {
      for (let index = 0; index < LOCATION_COUNT; index += 1) {
        insertLocation.run(`Filler Yard ${index}`, stamp, stamp);
      }
      // Same pickup instant as the real next load, but a lower id. If cancelled rows leak
      // into the neighbor scan, this one sorts ahead of HIST-EM-251.
      const cancelledPickup = day(SAVED_INDEX + 1);
      const cancelledId = Number(
        insertLoad.run(
          "HIST-EM-CANCELLED",
          customerId,
          cancelledPickup,
          cancelledPickup,
          day(SAVED_INDEX + 2),
          day(SAVED_INDEX + 2),
          "cancelled",
          truckId,
          driverId,
          cancelledPickup,
          cancelledPickup,
        ).lastInsertRowid,
      );
      insertStop.run(cancelledId, 1, "pickup", pickupLocationId, "Omaha Yard", "Omaha", "NE", cancelledPickup, cancelledPickup);
      insertStop.run(
        cancelledId,
        2,
        "delivery",
        deliveryLocationId,
        "Kansas City Dock",
        "Kansas City",
        "MO",
        day(SAVED_INDEX + 2),
        day(SAVED_INDEX + 2),
      );
      for (let index = 0; index < LOAD_COUNT; index += 1) {
        const pickup = day(index);
        const delivery = day(index + 1);
        const status = index === SAVED_INDEX ? "assigned" : "delivered";
        const id = Number(
          insertLoad.run(
            `HIST-EM-${index}`,
            customerId,
            pickup,
            pickup,
            delivery,
            delivery,
            status,
            truckId,
            driverId,
            pickup,
            delivery,
          ).lastInsertRowid,
        );
        loadIds.push(id);
        insertStop.run(id, 1, "pickup", pickupLocationId, "Omaha Yard", "Omaha", "NE", pickup, pickup);
        insertStop.run(id, 2, "delivery", deliveryLocationId, "Kansas City Dock", "Kansas City", "MO", delivery, delivery);
      }
    });
    seed();

    db.prepare(
      `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
       VALUES (?, '2024-06-01T12:00:00.000Z', 41.2565, -95.9345, 'Omaha, NE', 'samsara')`,
    ).run(truckId);
    db.prepare(
      `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
       VALUES (?, '2024-06-01T18:00:00.000Z', 39.0997, -94.5786, 'Kansas City, MO', 'samsara')`,
    ).run(truckId);

    const savedLoadId = loadIds[SAVED_INDEX];
    const clocks = () => db.prepare("SELECT id, load_id, arrived_at, departed_at FROM load_stops ORDER BY id").all() as ClockRow[];
    const before = clocks();
    assert.equal(before.length, LOAD_COUNT * 2 + 2);
    assert.equal(
      before.some((row) => row.arrived_at || row.departed_at),
      false,
      "seeded stops start with no arrival or departure",
    );

    const { nextLoadForEmptyMiles, previousLoadForEmptyMiles, refreshEmptyMilesAround } = await import(
      "../lib/empty-miles"
    );
    const { getLoad } = await import("../lib/queries");
    const saved = getLoad(savedLoadId);
    assert.ok(saved);
    assert.equal(previousLoadForEmptyMiles(saved)?.id, loadIds[SAVED_INDEX - 1]);
    assert.equal(nextLoadForEmptyMiles(saved)?.id, loadIds[SAVED_INDEX + 1]);

    const emptyStarted = Date.now();
    await refreshEmptyMilesAround(savedLoadId);
    const emptyMs = Date.now() - emptyStarted;
    console.log(`refreshEmptyMilesAround ${emptyMs} ms; loads ${LOAD_COUNT}; locations ${LOCATION_COUNT + 2}`);
    assert.ok(emptyMs < BUDGET_MS, `empty miles took ${emptyMs} ms, budget ${BUDGET_MS} ms`);

    const afterEmpty = clocks();
    assert.deepEqual(
      afterEmpty,
      before,
      "empty-miles reads must not stamp arrival or departure on this load or any other",
    );
    const savedAfterEmpty = getLoad(savedLoadId);
    assert.match(savedAfterEmpty?.empty_from ?? "", /Kansas City/i);
    assert.match(savedAfterEmpty?.empty_to ?? "", /Omaha/i);
    const nextAfterEmpty = getLoad(loadIds[SAVED_INDEX + 1]);
    assert.match(nextAfterEmpty?.empty_from ?? "", /Kansas City/i);
    assert.match(nextAfterEmpty?.empty_to ?? "", /Omaha/i);

    const { refreshLoadRouteQuiet } = await import("../lib/routing");
    fetchCalls = 0;
    const saveStarted = Date.now();
    await refreshLoadRouteQuiet(savedLoadId);
    const saveMs = Date.now() - saveStarted;
    console.log(`refreshLoadRouteQuiet ${saveMs} ms; directions calls ${fetchCalls}`);
    assert.ok(saveMs < BUDGET_MS, `save route + empty miles took ${saveMs} ms, budget ${BUDGET_MS} ms`);
    assert.ok(fetchCalls < 10, `save issued ${fetchCalls} direction calls`);

    const afterSave = clocks();
    const otherWrites = afterSave.filter(
      (row) => row.load_id !== savedLoadId && (row.arrived_at !== "" || row.departed_at !== ""),
    );
    assert.equal(otherWrites.length, 0, "saving one load must not stamp stop times on the driver's other loads");

    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let blockedFetches = 0;
    globalThis.fetch = (async () => {
      blockedFetches += 1;
      await gate;
      throw new Error("directions stayed blocked");
    }) as typeof fetch;
    process.env.GOOGLE_MAPS_API_KEY = "test-not-a-real-maps-key";
    const first = refreshLoadRouteQuiet(savedLoadId);
    const second = Promise.race([
      refreshLoadRouteQuiet(savedLoadId).then(() => "done" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
    ]);
    const secondResult = await second;
    assert.equal(secondResult, "done", "a second save on the same load must return while the first route pass is running");
    assert.equal(blockedFetches, 1, "a second save on the same load must not start another route pass");
    releaseGate();
    await first.catch(() => {});
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
    closeDb();
    fs.rmSync(dbPath, { force: true });
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  }
  console.log("empty miles save ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
