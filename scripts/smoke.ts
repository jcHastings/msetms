import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-smoke-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;

async function main() {
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");

  getDb();
  const seeded = queries.getDashboardStats();
  assert.ok(seeded.openLoads >= 1, "seed should create open loads");
  assert.ok(seeded.unassignedLoads >= 1, "seed should create unassigned loads");
  assert.ok(seeded.availableTrucks >= 1, "seed should create available trucks");
  assert.ok(queries.listLoads({ status: "in_transit" }).length >= 1, "seed should include in-transit loads");
  assert.ok(queries.listCustomers().length >= 1, "seed should include customers");

  const customerId = queries.createCustomer({
    name: "Smoke Test Shipper",
    billing_notes: "Net 15",
    contacts: [{ name: "Pat Dispatcher", role: "Shipping", phone: "555-0100", email: "pat@example.com" }],
  });
  const truckId = queries.createTruck({
    unit_number: "999",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
  });
  const driverId = queries.createDriver({
    name: "Riley Smoke",
    phone: "555-0199",
    license: "TN-CDL-SMOKE",
    truck_id: truckId,
    status: "available",
  });

  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(8, 0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(12, 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(16, 0, 0, 0);

  const loadId = queries.createLoad({
    customer_id: customerId,
    origin: "Jackson, MS",
    destination: "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 32000,
    commodity: "Paper rolls",
    rate: 1400,
    notes: "Smoke-test load",
    status: "available",
    truck_id: null,
    driver_id: null,
  });

  const created = queries.getLoad(loadId);
  assert.ok(created);
  assert.equal(created.status, "available");
  assert.match(created.load_number, /^MSE-\d+$/);

  queries.assignLoad(loadId, truckId, driverId);
  const assigned = queries.getLoad(loadId);
  assert.ok(assigned);
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.truck_id, truckId);
  assert.equal(assigned.driver_id, driverId);
  assert.equal(queries.getTruck(truckId)?.status, "in_use");
  assert.equal(queries.getDriver(driverId)?.status, "on_duty");

  queries.updateLoadStatus(loadId, "in_transit");
  assert.equal(queries.getLoad(loadId)?.status, "in_transit");

  queries.updateLoadStatus(loadId, "delivered");
  const delivered = queries.getLoad(loadId);
  assert.ok(delivered);
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.truck_id, truckId);
  assert.equal(queries.getTruck(truckId)?.status, "available");
  assert.equal(queries.getDriver(driverId)?.status, "available");

  const boardHit = queries
    .listLoads({ status: "delivered", q: "Smoke Test Shipper" })
    .some((load) => load.id === loadId);
  assert.equal(boardHit, true, "delivered load should appear on the board when filtered");

  closeDb();
  const reopened = getDb();
  const persisted = reopened
    .prepare("SELECT status, customer_id FROM loads WHERE id = ?")
    .get(loadId) as { status: string; customer_id: number };
  assert.equal(persisted.status, "delivered");
  assert.equal(persisted.customer_id, customerId);

  closeDb();
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  console.log("Smoke test passed: seed, customer, truck, driver, load, assign, in-transit, delivered, persist.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
