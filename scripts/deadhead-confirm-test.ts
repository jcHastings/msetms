/**
 * Deadhead is a suggestion until a dispatcher confirms it.
 * Unconfirmed miles stay out of IFTA, empty-mile reports, and settlement empty labels.
 * A driver's loads order by actual arrival, then departure, when those times exist.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-deadhead-confirm-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

function directionsFetch(meters: number) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "maps.googleapis.com");
    const { encodePolyline } = await import("../lib/routing");
    const points = encodePolyline([
      { lat: 41.2565, lng: -95.9345 },
      { lat: 40.9264, lng: -97.088 },
      { lat: 40.5861, lng: -98.3884 },
    ]);
    return new Response(
      JSON.stringify({
        status: "OK",
        routes: [{ overview_polyline: { points }, legs: [{ distance: { value: meters } }] }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

async function main() {
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const { officialEmptyMiles } = await import("../lib/routing-shared");
  const { buildIftaQuarterEstimate, parseIftaQuarter } = await import("../lib/ifta-quarter");
  const { listReportExportRows } = await import("../lib/reports-export");
  const { buildSettlement } = await import("../lib/settlement-statement");
  const {
    buildDeadheadSuggestion,
    confirmLoadDeadhead,
    refreshLoadEmptyMiles,
  } = await import("../lib/empty-miles");

  assert.equal(officialEmptyMiles(158, "google"), 158);
  assert.equal(officialEmptyMiles(158, "google", 0), null);
  assert.equal(officialEmptyMiles(158, "google", 1), 158);
  assert.equal(officialEmptyMiles(0, ""), 0);

  const db = getDb();
  const customerId = queries.createCustomer({ name: "Deadhead Foods", billing_notes: "", contacts: [] });
  const truckId = queries.createTruck({
    unit_number: "DH-1",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const otherTruckId = queries.createTruck({
    unit_number: "DH-2",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const driverId = queries.createDriver({
    name: "Dana Deadhead",
    phone: "555-0177",
    license: "NE-DH",
    pin: "7788",
    truck_id: truckId,
    status: "available",
  });
  const otherDriverId = queries.createDriver({
    name: "Other Driver",
    phone: "555-0178",
    license: "NE-OT",
    pin: "7789",
    truck_id: truckId,
    status: "available",
  });

  function load(input: {
    number: string;
    origin: string;
    destination: string;
    pickup: string;
    delivery: string;
    driver: number;
    truck: number;
    status?: string;
  }): number {
    return queries.createLoad({
      load_number: input.number,
      customer_id: customerId,
      origin: input.origin,
      destination: input.destination,
      pickup_start: input.pickup,
      pickup_end: input.pickup,
      delivery_start: input.delivery,
      delivery_end: input.delivery,
      weight: 40000,
      commodity: "Beef",
      rate: 1000,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: 34,
      trailer_number: "",
      status: input.status ?? "delivered",
      truck_id: input.truck,
      driver_id: input.driver,
    });
  }

  function stop(
    loadId: number,
    sequence: number,
    kind: "pickup" | "delivery",
    name: string,
    city: string,
    state: string,
    window: string,
    arrived = "",
    departed = "",
  ): void {
    db.prepare(
      `INSERT INTO load_stops (
         load_id, sequence, kind, name, city, state, window_start, window_end, arrived_at, departed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(loadId, sequence, kind, name, city, state, window, window, arrived, departed);
  }

  const previousId = load({
    number: "DH-PREV",
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup: "2026-08-20T12:00:00",
    delivery: "2026-08-21T18:00:00",
    driver: driverId,
    truck: truckId,
  });
  stop(previousId, 1, "pickup", "Lincoln Dock", "Lincoln", "NE", "2026-08-20T12:00:00");
  stop(previousId, 2, "delivery", "Omaha Dock", "Omaha", "NE", "2026-08-21T18:00:00", "2026-08-21T18:00:00", "2026-08-21T19:00:00");
  const currentId = load({
    number: "DH-NOW",
    origin: "Hastings, NE",
    destination: "Kansas City, MO",
    pickup: "2026-08-22T12:00:00",
    delivery: "2026-08-23T18:00:00",
    driver: driverId,
    truck: truckId,
    status: "assigned",
  });
  stop(currentId, 1, "pickup", "Hastings Dock", "Hastings", "NE", "2026-08-22T12:00:00");
  stop(currentId, 2, "delivery", "KC Dock", "Kansas City", "MO", "2026-08-23T18:00:00");
  db.prepare("UPDATE loads SET route_miles = 250, route_source = 'manual' WHERE id = ?").run(currentId);

  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-not-a-real-maps-key";
  globalThis.fetch = directionsFetch(254277) as typeof fetch;
  try {
    const suggestion = await refreshLoadEmptyMiles(currentId);
    assert.equal(suggestion.pending, true);
    assert.equal(suggestion.miles, 158);
    assert.match(suggestion.from, /Omaha/i);
    const stored = queries.getLoad(currentId);
    assert.equal(stored?.empty_confirmed, 0);
    assert.equal(stored?.empty_miles ?? null, null);
    const quarter = parseIftaQuarter("2026-3");
    const pendingIfta = buildIftaQuarterEstimate(quarter);
    assert.equal(pendingIfta.drivers.find((row) => row.id === driverId)?.empty, 0);
    assert.equal(pendingIfta.waypoints.find((row) => row.loadId === currentId)?.emptyPending, true);
    const pendingExport = listReportExportRows({
      category: "driver",
      entityId: driverId,
      dateBasis: "pickup",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    }).find((row) => row.load_number === "DH-NOW");
    assert.equal(pendingExport?.empty_miles, "Pending");
    const pendingStatement = buildSettlement(driverId, "2026-08-22");
    const pendingLine = pendingStatement?.loads.find((row) => row.loadNumber === "DH-NOW");
    assert.equal(pendingLine?.miles, 250);
    assert.equal(pendingLine?.emptyLabel, "Empty Pending");

    const confirmed = await confirmLoadDeadhead(currentId);
    assert.equal(confirmed.pending, false);
    assert.equal(confirmed.miles, 158);
    assert.equal(queries.getLoad(currentId)?.empty_confirmed, 1);
    assert.equal(queries.getLoad(currentId)?.empty_miles, 158);
    const confirmedIfta = buildIftaQuarterEstimate(quarter);
    assert.equal(confirmedIfta.drivers.find((row) => row.id === driverId)?.empty, 158);
    assert.equal(confirmedIfta.waypoints.find((row) => row.loadId === currentId)?.emptyPending, false);
    const confirmedExport = listReportExportRows({
      category: "driver",
      entityId: driverId,
      dateBasis: "pickup",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    }).find((row) => row.load_number === "DH-NOW");
    assert.equal(confirmedExport?.empty_miles, 158);
    const confirmedStatement = buildSettlement(driverId, "2026-08-22");
    const confirmedLine = confirmedStatement?.loads.find((row) => row.loadNumber === "DH-NOW");
    assert.equal(confirmedLine?.miles, 250);
    assert.equal(confirmedLine?.emptyLabel, "");
    const again = await refreshLoadEmptyMiles(currentId);
    assert.equal(again.miles, 158);
    assert.equal(again.pending, false);
    assert.equal(queries.getLoad(currentId)?.empty_miles, 158);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const oldId = load({
    number: "DH-OLD",
    origin: "Denver, CO",
    destination: "Kansas City, MO",
    pickup: "2026-06-28T12:00:00",
    delivery: "2026-07-01T12:00:00",
    driver: driverId,
    truck: truckId,
  });
  stop(oldId, 1, "delivery", "KC Dock", "Kansas City", "MO", "2026-07-01T12:00:00", "", "2026-07-01T12:00:00");
  const midId = load({
    number: "DH-MID",
    origin: "Dallas, TX",
    destination: "Omaha, NE",
    pickup: "2026-07-28T12:00:00",
    delivery: "2026-08-01T12:00:00",
    driver: otherDriverId,
    truck: truckId,
  });
  stop(midId, 1, "delivery", "Omaha Dock", "Omaha", "NE", "2026-08-01T12:00:00", "", "2026-08-01T12:00:00");
  const warnId = load({
    number: "DH-WARN",
    origin: "Hastings, NE",
    destination: "Chicago, IL",
    pickup: "2026-08-12T12:00:00",
    delivery: "2026-08-14T12:00:00",
    driver: driverId,
    truck: truckId,
    status: "assigned",
  });
  stop(warnId, 1, "pickup", "Hastings Dock", "Hastings", "NE", "2026-08-12T12:00:00");
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-08-11T08:00:00', 41.8781, -87.6298, 'Chicago, IL', 'samsara')`,
  ).run(truckId);
  globalThis.fetch = directionsFetch(1_200_000) as typeof fetch;
  try {
    const warned = await buildDeadheadSuggestion(queries.getLoad(warnId)!);
    assert.ok(warned);
    assert.match(warned.place, /Omaha/i);
    assert.ok(warned.warnings.includes("gap"));
    assert.ok(warned.warnings.includes("between"));
    assert.ok(warned.warnings.includes("gps"));
    assert.ok(warned.warnings.includes("distance"));
    assert.ok((warned.miles ?? 0) > 600);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
  }

  const earlyPickupLateArrival = load({
    number: "DH-ORDER-A",
    origin: "A",
    destination: "B",
    pickup: "2026-01-01T08:00:00",
    delivery: "2026-01-02T08:00:00",
    driver: driverId,
    truck: otherTruckId,
  });
  stop(earlyPickupLateArrival, 1, "pickup", "A", "Lincoln", "NE", "2026-01-01T08:00:00", "2026-01-10T08:00:00");
  const midPickupEarlyArrival = load({
    number: "DH-ORDER-B",
    origin: "C",
    destination: "D",
    pickup: "2026-01-05T08:00:00",
    delivery: "2026-01-06T08:00:00",
    driver: driverId,
    truck: otherTruckId,
  });
  stop(midPickupEarlyArrival, 1, "pickup", "C", "Omaha", "NE", "2026-01-05T08:00:00", "2026-01-03T08:00:00");
  const latePickupMidArrival = load({
    number: "DH-ORDER-C",
    origin: "E",
    destination: "F",
    pickup: "2026-01-09T08:00:00",
    delivery: "2026-01-11T08:00:00",
    driver: driverId,
    truck: otherTruckId,
  });
  stop(latePickupMidArrival, 1, "delivery", "F", "Des Moines", "IA", "2026-01-09T08:00:00", "", "2026-01-07T08:00:00");
  const ordered = queries
    .listLoadsForDriver(driverId)
    .filter((row) => row.load_number.startsWith("DH-ORDER"))
    .map((row) => row.load_number);
  assert.deepEqual(ordered, ["DH-ORDER-B", "DH-ORDER-C", "DH-ORDER-A"]);

  closeDb();
  console.log("deadhead confirm ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
