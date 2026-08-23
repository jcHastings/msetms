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
    pin: "4321",
    truck_id: truckId,
    status: "available",
  });
  const otherDriverId = queries.createDriver({
    name: "Casey Relay",
    phone: "555-0111",
    license: "AL-CDL-RELAY",
    pin: "2222",
    truck_id: null,
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
    special_instructions: "Call receiver 30 minutes out. Driver assist.",
    appointment_notes: "Dock 2",
    reference_number: "RC-SMOKE",
    po_number: "PO-SMOKE",
    reefer_setpoint_f: null,
    trailer_number: "",
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

  queries.assignLoad(loadId, truckId, otherDriverId);
  assert.equal(queries.getLoad(loadId)?.driver_id, otherDriverId);
  assert.equal(queries.listLoadsForDriver(driverId).some((load) => load.id === loadId), false);
  assert.equal(queries.listLoadsForDriver(otherDriverId).some((load) => load.id === loadId), true);

  queries.updateDriverProgress(loadId, otherDriverId, "en_route_pickup");
  assert.equal(queries.getLoad(loadId)?.status, "in_transit");
  queries.updateDriverProgress(loadId, otherDriverId, "loaded");
  queries.updateDriverProgress(loadId, otherDriverId, "en_route_delivery");
  queries.updateDriverProgress(loadId, otherDriverId, "delivered");
  assert.equal(queries.getLoad(loadId)?.status, "delivered");

  const { addAttachment } = await import("../lib/files");
  addAttachment({
    loadId,
    kind: "pod",
    originalName: "pod-smoke.pdf",
    buffer: Buffer.from("%PDF-1.4 smoke"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  const { listAttachments } = await import("../lib/files");
  assert.equal(listAttachments(loadId).some((file) => file.kind === "pod"), true);

  const { parseRateConText } = await import("../lib/rate-con");
  const parsed = parseRateConText(
    `RATE CONFIRMATION
Customer: Delta Cold Storage
Origin: Atlanta, GA
Destination: Jacksonville, FL
Pickup Window: 08/25/2026 06:00 - 08/25/2026 10:00
Delivery Window: 08/25/2026 16:00 - 08/25/2026 20:00
Commodity: Frozen poultry
Weight: 41500 lbs
Rate: $2,150.00
Ref #: RC-22018
PO #: PO-77841
Reefer Setpoint: 0 F
SPECIAL INSTRUCTIONS
- Appointment required at delivery; call 60 minutes out
- Lumper receipt required
`,
    queries.listCustomers(),
  );
  assert.equal(parsed.origin, "Atlanta, GA");
  assert.equal(parsed.destination, "Jacksonville, FL");
  assert.equal(parsed.rate, 2150);
  assert.equal(parsed.reefer_setpoint_f, 0);
  assert.match(parsed.special_instructions, /Lumper/i);
  assert.ok(parsed.customer_id, "sample customer should match Delta Cold Storage");

  const samplePdf = path.join(process.cwd(), "public", "samples", "sample-rate-con.pdf");
  if (fs.existsSync(samplePdf)) {
    const { extractDocumentText } = await import("../lib/rate-con");
    const pdfText = await extractDocumentText(fs.readFileSync(samplePdf), "application/pdf", "sample-rate-con.pdf");
    const fromPdf = parseRateConText(pdfText, queries.listCustomers());
    assert.match(fromPdf.origin, /Atlanta/i);
    assert.match(fromPdf.special_instructions, /Appointment required/i);

    const { fromInputDateTime } = await import("../lib/format");
    const importedId = queries.createLoad({
      customer_id: fromPdf.customer_id ?? queries.findOrCreateCustomer(fromPdf.customer_name || "Delta Cold Storage"),
      origin: fromPdf.origin,
      destination: fromPdf.destination,
      pickup_start: fromInputDateTime(fromPdf.pickup_start),
      pickup_end: fromInputDateTime(fromPdf.pickup_end),
      delivery_start: fromInputDateTime(fromPdf.delivery_start),
      delivery_end: fromInputDateTime(fromPdf.delivery_end),
      weight: fromPdf.weight,
      commodity: fromPdf.commodity,
      rate: fromPdf.rate,
      notes: "",
      special_instructions: fromPdf.special_instructions,
      appointment_notes: fromPdf.appointment_notes,
      reference_number: fromPdf.reference_number,
      po_number: fromPdf.po_number,
      reefer_setpoint_f: fromPdf.reefer_setpoint_f,
      trailer_number: "",
      status: "available",
      truck_id: null,
      driver_id: null,
    });
    addAttachment({
      loadId: importedId,
      kind: "rate_con",
      originalName: "sample-rate-con.pdf",
      buffer: fs.readFileSync(samplePdf),
      mimeType: "application/pdf",
      uploadedBy: "dispatcher",
    });
    const imported = queries.getLoad(importedId);
    assert.ok(imported);
    assert.match(imported.special_instructions, /Lumper receipt/i);
    assert.equal(listAttachments(importedId).some((file) => file.kind === "rate_con"), true);

    const firstDriver = queries.listDrivers().find((driver) => driver.name === "Priya Shah");
    const secondDriver = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
    const freeTruck = queries.listAssignableTrucks().find((truck) => truck.unit_number === "101");
    assert.ok(firstDriver && secondDriver && freeTruck);
    queries.assignLoad(importedId, freeTruck.id, firstDriver.id);
    const priyaView = queries.listLoadsForDriver(firstDriver.id).find((load) => load.id === importedId);
    assert.ok(priyaView);
    assert.match(priyaView.special_instructions, /call 60 minutes out/i);
    assert.equal(priyaView.rate, 2150);

    queries.assignLoad(importedId, freeTruck.id, secondDriver.id);
    assert.equal(queries.listLoadsForDriver(firstDriver.id).some((load) => load.id === importedId), false);
    const tyrellView = queries.listLoadsForDriver(secondDriver.id).find((load) => load.id === importedId);
    assert.ok(tyrellView);
    assert.match(tyrellView.special_instructions, /Driver assist unload/i);
  }

  const denise = queries.listDrivers().find((driver) => driver.name === "Denise Ortega");
  assert.ok(denise);
  queries.authenticateDriver(denise.id, "1125");
  const deniseLoads = queries.listLoadsForDriver(denise.id);
  assert.ok(deniseLoads.some((load) => load.load_number === "MSE-1045"));
  const orbcomm = await import("../lib/integrations/orbcomm");
  const samsara = await import("../lib/integrations/samsara");
  const reeferLoad = deniseLoads.find((load) => load.load_number === "MSE-1045");
  assert.ok(reeferLoad);
  const previousSamsara = process.env.SAMSARA_API_TOKEN;
  const previousUser = process.env.ORBCOMM_USERNAME;
  const previousPass = process.env.ORBCOMM_PASSWORD;
  delete process.env.SAMSARA_API_TOKEN;
  delete process.env.ORBCOMM_USERNAME;
  delete process.env.ORBCOMM_PASSWORD;
  orbcomm.resetOrbcommCacheForTests();
  samsara.resetSamsaraCacheForTests();
  const reading = await orbcomm.getLatestReeferForLoad(reeferLoad.id);
  assert.ok(reading, "seeded reefer load should have a demo temperature");
  assert.equal(reading.source, "demo");
  assert.equal(reading.temperature_f, 34.2);

  const mappedReefer = orbcomm.mapOrbcommReadingsToLoads({
    loads: [
      { id: reeferLoad.id, truck_id: reeferLoad.truck_id, trailer_number: "TR-7742", reefer_setpoint_f: 34 },
    ],
    trucks: [
      {
        id: reeferLoad.truck_id ?? 0,
        unit_number: "112",
        orbcomm_asset_id: "orbcomm-tr-7742",
        trailer_number: "TR-7742",
      },
    ],
    assets: [
      {
        assetId: "orbcomm-tr-7742",
        trailerId: "TR-7742",
        temperatureF: 34.2,
        setpointF: 34,
        recordedAt: "2026-08-23T13:05:00Z",
      },
    ],
  });
  assert.equal(mappedReefer.length, 1);
  assert.equal(mappedReefer[0].source, "orbcomm");
  assert.equal(mappedReefer[0].temperatureF, 34.2);
  assert.equal(mappedReefer[0].recordedAt, "2026-08-23T13:05:00Z");

  const parsedReport = orbcomm.parseOrbcommReport(
    "trailer_id,temperature_f,setpoint_f,recorded_at\nTR-7742,34.2,34,2026-08-23T13:05:00Z\n",
  );
  assert.equal(parsedReport[0]?.trailerId, "TR-7742");

  const mappedGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "281474977075805",
        name: "112",
        gps: {
          time: "2026-08-23T13:05:00Z",
          latitude: 32.78,
          longitude: -96.8,
          speedMilesPerHour: 54,
          reverseGeo: { formattedLocation: "Dallas, TX" },
        },
      },
    ],
    trucks: [{ id: reeferLoad.truck_id ?? 0, unit_number: "112", samsara_vehicle_id: "281474977075805" }],
    loads: [{ id: reeferLoad.id, truck_id: reeferLoad.truck_id }],
  });
  assert.equal(mappedGps[0]?.address, "Dallas, TX");
  assert.equal(mappedGps[0]?.source, "samsara");

  const mappedHos = samsara.mapHosClocks({
    clocks: [
      {
        driver: { id: "88668", name: "Denise Ortega" },
        currentDutyStatus: { hosStatusType: "driving" },
        clocks: { drive: { driveRemainingDurationMs: 22320000 } },
      },
    ],
    drivers: [{ id: denise.id, name: "Denise Ortega", samsara_driver_id: "88668" }],
    loads: [{ id: reeferLoad.id, driver_id: denise.id }],
  });
  assert.equal(mappedHos[0]?.driveRemainingMs, 22320000);
  assert.equal(samsara.formatDurationMs(22320000), "6h 12m");

  const trailers = queries.listTrailers();
  assert.ok(trailers.some((trailer) => trailer.unit_number === "TR-7742"));
  assert.equal(denise.driver_type, "company_driver");
  const cole = queries.listDrivers().find((driver) => driver.name === "Cole Brennan");
  assert.ok(cole);
  assert.equal(cole.driver_type, "owner_operator");
  assert.equal(cole.pay_percent, 75);
  const tyrell = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
  assert.ok(tyrell);
  const { collectAssignmentAlerts, requireAssignmentOverride } = await import("../lib/compliance");
  const tyrellAlerts = collectAssignmentAlerts({ driver: tyrell });
  assert.ok(tyrellAlerts.some((alert) => alert.kind === "medical" && alert.severity === "expired"));
  const deniseAlerts = collectAssignmentAlerts({ driver: denise });
  assert.ok(deniseAlerts.some((alert) => alert.kind === "license" && alert.severity === "expiring"));
  assert.throws(() => requireAssignmentOverride(tyrellAlerts, false), /Expired documents/);
  requireAssignmentOverride(tyrellAlerts, true);
  const upcoming = queries.listUpcomingCompliance();
  assert.ok(upcoming.length >= 3, "seed should surface expiring/expired documents");

  const fleet = await samsara.getSamsaraFleet();
  assert.equal(fleet.mode, "demo");
  assert.ok(fleet.hos.some((clock) => clock.driverName === "Denise Ortega" && clock.source === "demo"));

  process.env.SAMSARA_API_TOKEN = "test-not-a-real-token";
  process.env.ORBCOMM_USERNAME = "demo-user";
  process.env.ORBCOMM_PASSWORD = "demo-pass";
  samsara.resetSamsaraCacheForTests();
  orbcomm.resetOrbcommCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    const failedFleet = await samsara.getSamsaraFleet();
    assert.equal(failedFleet.mode, "demo", "Samsara 401 should fall back to demo GPS/HOS");
    assert.ok(failedFleet.error && /401/.test(failedFleet.error));

    const failedReefer = await orbcomm.getReeferSnapshots();
    assert.equal(failedReefer.mode, "demo", "ORBCOMM 401 should fall back to demo temps");
    assert.ok(failedReefer.error && /401/.test(failedReefer.error));
    const fallbackReading = await orbcomm.getLatestReeferForLoad(reeferLoad.id);
    assert.equal(fallbackReading?.source, "demo");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSamsara == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = previousSamsara;
    if (previousUser == null) delete process.env.ORBCOMM_USERNAME;
    else process.env.ORBCOMM_USERNAME = previousUser;
    if (previousPass == null) delete process.env.ORBCOMM_PASSWORD;
    else process.env.ORBCOMM_PASSWORD = previousPass;
    samsara.resetSamsaraCacheForTests();
    orbcomm.resetOrbcommCacheForTests();
  }

  queries.updateLoadStatus(loadId, "delivered");
  const delivered = queries.getLoad(loadId);
  assert.ok(delivered);
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.truck_id, truckId);
  assert.equal(queries.getTruck(truckId)?.status, "available");
  assert.equal(queries.getDriver(otherDriverId)?.status, "available");

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
