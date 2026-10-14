/**
 * Backhaul search reads load history only.
 * It must not stamp geofence arrivals, and it must stay inside the server budget
 * with about 6,000 loads on file.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-backhaul-history-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const HISTORY = 6000;
const DENVER = { lat: 39.7392, lng: -104.9903 };

async function main() {
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const { applyGeofenceArrivals } = await import("../lib/geofence");
  const { findBackhaulForLoad } = await import("../lib/backhaul");
  const shared = await import("../lib/backhaul-shared");

  const backhaulSource = fs.readFileSync(path.join(process.cwd(), "lib/backhaul.ts"), "utf8");
  assert.match(backhaulSource, /listStops\(source\.id, \{ geofence: false \}\)/);
  assert.match(backhaulSource, /listStopsForLoads/);
  assert.doesNotMatch(backhaulSource, /from \"\.\/geofence\"|gpsPingsForLoad|saveTruckGps/);
  assert.match(backhaulSource, /BACKHAUL_GEOCODE_TIMEOUT_MS/);

  const ui = fs.readFileSync(path.join(process.cwd(), "components/backhaul-finder.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(ui, /BACKHAUL_CLIENT_TIMEOUT_MS/);
  assert.match(ui, /\{BACKHAUL_TIMEOUT_MESSAGE\}/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "lib/backhaul-shared.ts"), "utf8"),
    /Search took too long, try again/,
  );
  assert.match(ui, /aria-describedby="backhaul-timeout-message"/);
  assert.match(ui, />\s*Try again\s*</);
  assert.match(css, /\.backhaul-retry[\s\S]*min-height:\s*44px/);

  const db = getDb();
  const now = new Date();
  const recent = now.toISOString();
  const customerId = queries.createCustomer({ name: "River City Produce", billing_notes: "", contacts: [] });
  const locationId = queries.createLocation({
    name: "Denver Dock",
    street: "1 Dock St",
    city: "Denver",
    state: "CO",
    zip: "80202",
    phone: "",
    notes: "",
    role: "both",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: DENVER.lat,
    longitude: DENVER.lng,
  });
  const truckId = queries.createTruck({
    unit_number: "32",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  queries.saveTruckGps(truckId, {
    latitude: DENVER.lat,
    longitude: DENVER.lng,
    address: "Denver, CO",
    recordedAt: recent,
    source: "samsara",
  });

  const sourceId = queries.createLoad({
    load_number: "BH-SOURCE",
    customer_id: customerId,
    origin: "Chicago, IL",
    destination: "Denver, CO",
    pickup_start: recent,
    pickup_end: recent,
    delivery_start: recent,
    delivery_end: recent,
    weight: 40000,
    commodity: "Beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  const denverId = queries.createLoad({
    load_number: "BH-DENVER",
    customer_id: customerId,
    origin: "Denver, CO",
    destination: "Chicago, IL",
    pickup_start: recent,
    pickup_end: recent,
    delivery_start: recent,
    delivery_end: recent,
    weight: 40000,
    commodity: "Beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "in_transit",
    truck_id: truckId,
    driver_id: null,
  });
  const elPasoId = queries.createLoad({
    load_number: "BH-ELPASO",
    customer_id: customerId,
    origin: "El Paso, TX",
    destination: "Dallas, TX",
    pickup_start: recent,
    pickup_end: recent,
    delivery_start: recent,
    delivery_end: recent,
    weight: 40000,
    commodity: "Beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: truckId,
    driver_id: null,
  });
  const oldId = queries.createLoad({
    load_number: "BH-OLD",
    customer_id: customerId,
    origin: "Denver, CO",
    destination: "Chicago, IL",
    pickup_start: "2019-01-15T12:00:00.000Z",
    pickup_end: "2019-01-15T12:00:00.000Z",
    delivery_start: "2019-01-16T12:00:00.000Z",
    delivery_end: "2019-01-16T12:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  const cancelledId = queries.createLoad({
    load_number: "BH-CANCEL",
    customer_id: customerId,
    origin: "Denver, CO",
    destination: "Chicago, IL",
    pickup_start: recent,
    pickup_end: recent,
    delivery_start: recent,
    delivery_end: recent,
    weight: 40000,
    commodity: "Beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "cancelled",
    truck_id: null,
    driver_id: null,
  });

  const insertStop = db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, city, state, location_id, window_start, window_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertStop.run(sourceId, 1, "delivery", "Denver Dock", "Denver", "CO", locationId, recent, recent);
  insertStop.run(denverId, 1, "pickup", "Denver Dock", "Denver", "CO", locationId, recent, recent);
  insertStop.run(elPasoId, 1, "pickup", "El Paso Dock", "El Paso", "TX", null, recent, recent);
  insertStop.run(oldId, 1, "pickup", "Denver Dock", "Denver", "CO", locationId, "2019-01-15T12:00:00.000Z", "2019-01-15T12:00:00.000Z");
  insertStop.run(cancelledId, 1, "pickup", "Denver Dock", "Denver", "CO", locationId, recent, recent);

  const insertLoad = db.prepare(
    `INSERT INTO loads (
       load_number, customer_id, origin, destination,
       pickup_start, pickup_end, delivery_start, delivery_end,
       commodity, rate, notes, status, created_at, updated_at
     ) VALUES (?, ?, 'Dallas, TX', 'Houston, TX', ?, ?, ?, ?, 'Beef', 1200, '', 'delivered', ?, ?)`,
  );
  const insertDallasStop = db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, city, state, window_start, window_end)
     VALUES (?, 1, 'pickup', 'Dallas Dock', 'Dallas', 'TX', ?, ?)`,
  );
  const seed = db.transaction(() => {
    for (let index = 0; index < HISTORY; index += 1) {
      const id = Number(
        insertLoad.run(`BH-FAR-${index}`, customerId, recent, recent, recent, recent, recent, recent).lastInsertRowid,
      );
      insertDallasStop.run(id, recent, recent);
    }
  });
  seed();

  const started = Date.now();
  const found = await findBackhaulForLoad(sourceId, { now });
  const elapsed = Date.now() - started;
  console.log(`backhaul history search ${elapsed} ms loads ${HISTORY + 5}`);
  if (!found.ok) throw new Error(found.error);
  assert.ok(elapsed < shared.BACKHAUL_SERVER_BUDGET_MS, `search took ${elapsed} ms`);
  assert.ok(elapsed < 8_000, `search took ${elapsed} ms with ${HISTORY} far loads`);
  const numbers = found.loads.map((row) => row.loadNumber);
  assert.ok(numbers.includes("BH-DENVER"));
  assert.equal(numbers.includes("BH-ELPASO"), false, "GPS at the delivery must not pull in a far pickup");
  assert.equal(numbers.includes("BH-OLD"), false, "loads older than 18 months stay out");
  assert.equal(numbers.includes("BH-CANCEL"), false);
  assert.equal(numbers.some((number) => number.startsWith("BH-FAR-")), false);
  assert.ok(found.total < 50);

  let arrivedAt = "missing";
  try {
    const arrived = db.prepare("SELECT arrived_at FROM load_stops WHERE load_id = ? AND kind = 'pickup'").get(denverId) as {
      arrived_at: string;
    };
    arrivedAt = JSON.stringify(arrived);
  } catch (error) {
    console.log(`arrival query failed ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  assert.equal(JSON.parse(arrivedAt).arrived_at ?? "", "", "backhaul search must not stamp a geofence arrival");
  const stamped = applyGeofenceArrivals(denverId, now);
  assert.ok(stamped > 0, "the fixture must be one geofence would have stamped");
  const after = db.prepare("SELECT arrived_at FROM load_stops WHERE load_id = ? AND kind = 'pickup'").get(denverId) as {
    arrived_at: string;
  };
  assert.ok(after.arrived_at, "geofence still stamps when called directly");

  const timedOut = await findBackhaulForLoad(sourceId, { now, budgetMs: 0 });
  if (timedOut.ok || timedOut.reason !== "timeout" || timedOut.error !== "Search took too long, try again") {
    throw new Error(`unexpected timeout payload ${JSON.stringify(timedOut)}`);
  }

  process.env.GOOGLE_MAPS_API_KEY = "test-key-not-real";
  const { geocodeAddress } = await import("../lib/places");
  const hung = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    })) as typeof fetch;
  const geoStarted = Date.now();
  const geo = await geocodeAddress("1234 Unknown Road, Denver, CO", { timeoutMs: 80 });
  const geoElapsed = Date.now() - geoStarted;
  globalThis.fetch = hung;
  delete process.env.GOOGLE_MAPS_API_KEY;
  assert.equal(geo, null);
  assert.ok(geoElapsed < 1_000, `geocode timeout took ${geoElapsed} ms`);
  assert.equal(shared.BACKHAUL_GEOCODE_TIMEOUT_MS, 8_000);
  assert.equal(shared.BACKHAUL_CLIENT_TIMEOUT_MS, 20_000);
  assert.equal(shared.BACKHAUL_SERVER_BUDGET_MS, 15_000);

  closeDb();
  fs.rmSync(dbPath, { force: true });
  console.log("backhaul history tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
