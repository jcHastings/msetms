/**
 * Deadhead is a suggestion until a dispatcher confirms it.
 * Unconfirmed miles stay out of IFTA, empty-mile reports, and settlement empty labels.
 * A driver's loads order by actual arrival, then departure, when those times exist.
 * The suggested start is that driver's last real delivery, not another truck's.
 * at_delivery and a GPS arrival count. A load with no driver uses its truck.
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
    previousLoadForEmptyMiles,
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
  stop(oldId, 1, "delivery", "KC Dock", "Kansas City", "MO", "2026-08-07T12:00:00", "", "2026-08-07T12:00:00");
  const midId = load({
    number: "DH-MID",
    origin: "Dallas, TX",
    destination: "Omaha, NE",
    pickup: "2026-07-28T12:00:00",
    delivery: "2026-08-01T12:00:00",
    driver: otherDriverId,
    truck: truckId,
  });
  stop(midId, 1, "delivery", "Omaha Dock", "Omaha", "NE", "2026-08-08T12:00:00", "", "2026-08-08T12:00:00");
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
    assert.match(warned.place, /Kansas City/i);
    assert.doesNotMatch(warned.place, /Omaha/i);
    assert.ok(warned.warnings.includes("gap"));
    assert.equal(warned.warnings.includes("between"), false);
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

  const { instantMs, timeZoneForStop } = await import("../lib/wall-time");
  assert.equal(
    instantMs("2026-10-14T18:00:00", timeZoneForStop("NY", "Albany")),
    Date.parse("2026-10-14T22:00:00.000Z"),
    "naive ITS clock in New York is Eastern, not UTC and not text order",
  );
  assert.equal(
    instantMs("2026-10-14T18:00:00"),
    Date.parse("2026-10-14T23:00:00.000Z"),
    "naive ITS clock with no stop zone is US Central",
  );
  assert.ok("2026-10-14T18:00:00" < "2026-10-14T20:00:00.000Z");

  const staleTruckId = queries.createTruck({
    unit_number: "DH-STALE",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const staleDriverId = queries.createDriver({
    name: "Stale History",
    phone: "555-0190",
    license: "TX-STALE",
    pin: "1900",
    truck_id: staleTruckId,
    status: "available",
  });
  const elPasoId = queries.createLocation({
    name: "El Paso Dock",
    street: "100 Border Hwy",
    city: "El Paso",
    state: "TX",
    zip: "79901",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 31.7619,
    longitude: -106.485,
  });
  const dallasId = queries.createLocation({
    name: "Dallas Dock",
    street: "200 Commerce St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 32.7767,
    longitude: -96.797,
  });
  const tonight = "2026-10-14T23:00:00.000Z";
  const oldElPaso = load({
    number: "DH-ELPASO",
    origin: "Phoenix, AZ",
    destination: "El Paso, TX",
    pickup: "2026-08-26T18:00:00.000Z",
    delivery: "2026-08-27T18:00:00.000Z",
    driver: staleDriverId,
    truck: staleTruckId,
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', ?, 'El Paso Dock', 'El Paso', 'TX', '2026-08-27T18:00:00.000Z', '2026-08-27T18:00:00.000Z', '', '2026-08-27T18:00:00.000Z')`,
  ).run(oldElPaso, elPasoId);
  const recentDallas = load({
    number: "DH-DALLAS",
    origin: "Austin, TX",
    destination: "Dallas, TX",
    pickup: "2026-10-12T18:00:00.000Z",
    delivery: "2026-10-13T18:00:00.000Z",
    driver: staleDriverId,
    truck: staleTruckId,
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', ?, 'Dallas Dock', 'Dallas', 'TX', '2026-10-13T18:00:00.000Z', '2026-10-13T18:00:00.000Z', '', '2026-10-13T18:00:00.000Z')`,
  ).run(recentDallas, dallasId);
  const tonightId = load({
    number: "DH-TONIGHT",
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup: tonight,
    delivery: "2026-10-15T18:00:00.000Z",
    driver: staleDriverId,
    truck: staleTruckId,
    status: "assigned",
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 1, 'pickup', ?, 'Dallas Dock', 'Dallas', 'TX', ?, ?, '2026-08-28T15:00:00.000Z', '')`,
  ).run(tonightId, dallasId, tonight, tonight);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-08-28T15:00:00.000Z', 31.7619, -106.485, 'El Paso, TX', 'samsara')`,
  ).run(staleTruckId);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T20:00:00.000Z', 32.92, -96.797, 'Dallas, TX', 'samsara')`,
  ).run(staleTruckId);
  const tonightSuggestion = await buildDeadheadSuggestion(queries.getLoad(tonightId)!);
  assert.ok(tonightSuggestion);
  assert.match(tonightSuggestion.place, /Dallas/i);
  assert.doesNotMatch(tonightSuggestion.place, /El Paso/i);
  assert.equal(tonightSuggestion.basis, "previous_delivery");
  const tonightSaved = await refreshLoadEmptyMiles(tonightId);
  assert.equal(tonightSaved.pending, true);
  assert.equal(queries.getLoad(tonightId)?.empty_confirmed, 0);
  assert.equal(queries.getLoad(tonightId)?.empty_miles ?? null, null);

  const oldOnlyId = load({
    number: "DH-OLD-ONLY",
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup: tonight,
    delivery: "2026-10-15T18:00:00.000Z",
    driver: staleDriverId,
    truck: staleTruckId,
    status: "assigned",
  });
  db.prepare("UPDATE loads SET driver_id = NULL, truck_id = NULL WHERE id = ?").run(recentDallas);
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 1, 'pickup', ?, 'Dallas Dock', 'Dallas', 'TX', ?, ?, '', '')`,
  ).run(oldOnlyId, dallasId, tonight, tonight);
  const oldOnly = await buildDeadheadSuggestion(queries.getLoad(oldOnlyId)!);
  assert.ok(oldOnly);
  assert.equal(oldOnly.basis, "previous_delivery");
  assert.match(oldOnly.place, /El Paso/i);
  assert.doesNotMatch(oldOnly.place, /Dallas/i);
  assert.match(oldOnly.alternativePlace, /Dallas/i);
  assert.equal(queries.getLoad(oldOnlyId)?.empty_confirmed ?? 0, 0);

  const farTruckId = queries.createTruck({
    unit_number: "DH-FAR",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const farDriverId = queries.createDriver({
    name: "Far Gps",
    phone: "555-0193",
    license: "TX-FAR",
    pin: "1930",
    truck_id: farTruckId,
    status: "available",
  });
  const farDeliveryId = load({
    number: "DH-FAR-DEL",
    origin: "Phoenix, AZ",
    destination: "El Paso, TX",
    pickup: "2026-10-08T18:00:00.000Z",
    delivery: "2026-10-09T18:00:00.000Z",
    driver: farDriverId,
    truck: farTruckId,
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', ?, 'El Paso Dock', 'El Paso', 'TX', '2026-10-09T18:00:00.000Z', '2026-10-09T18:00:00.000Z', '', '2026-10-09T18:00:00.000Z')`,
  ).run(farDeliveryId, elPasoId);
  const farPickupId = load({
    number: "DH-FAR-NOW",
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup: tonight,
    delivery: "2026-10-15T18:00:00.000Z",
    driver: farDriverId,
    truck: farTruckId,
    status: "assigned",
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 1, 'pickup', ?, 'Dallas Dock', 'Dallas', 'TX', ?, ?, '', '')`,
  ).run(farPickupId, dallasId, tonight, tonight);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T20:00:00.000Z', 32.92, -96.797, 'Dallas, TX', 'samsara')`,
  ).run(farTruckId);
  const farSuggestion = await buildDeadheadSuggestion(queries.getLoad(farPickupId)!);
  assert.ok(farSuggestion);
  assert.equal(farSuggestion.basis, "previous_delivery");
  assert.match(farSuggestion.place, /El Paso/i);
  assert.match(farSuggestion.alternativePlace, /Dallas/i);
  const farSaved = await refreshLoadEmptyMiles(farPickupId);
  assert.equal(farSaved.pending, true);
  assert.equal(queries.getLoad(farPickupId)?.empty_confirmed, 0);

  const zoneTruckId = queries.createTruck({
    unit_number: "DH-ZONE",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const zoneDriverId = queries.createDriver({
    name: "Zone Order",
    phone: "555-0191",
    license: "NY-ZONE",
    pin: "1910",
    truck_id: zoneTruckId,
    status: "available",
  });
  const naiveLater = load({
    number: "DH-NAIVE",
    origin: "Buffalo, NY",
    destination: "Albany, NY",
    pickup: "2026-10-14T12:00:00.000Z",
    delivery: "2026-10-14T18:00:00",
    driver: zoneDriverId,
    truck: zoneTruckId,
  });
  stop(naiveLater, 1, "delivery", "Albany Dock", "Albany", "NY", "2026-10-14T18:00:00", "", "2026-10-14T18:00:00");
  const realPrior = load({
    number: "DH-ZULU",
    origin: "Chicago, IL",
    destination: "Chicago, IL",
    pickup: "2026-10-13T08:00:00.000Z",
    delivery: "2026-10-13T16:00:00.000Z",
    driver: zoneDriverId,
    truck: zoneTruckId,
  });
  stop(realPrior, 1, "delivery", "Chicago Dock", "Chicago", "IL", "2026-10-13T16:00:00.000Z", "", "2026-10-13T16:00:00.000Z");
  const zonePickupId = load({
    number: "DH-ZONE-NOW",
    origin: "Newark, NJ",
    destination: "Boston, MA",
    pickup: "2026-10-14T20:00:00.000Z",
    delivery: "2026-10-15T12:00:00.000Z",
    driver: zoneDriverId,
    truck: zoneTruckId,
    status: "assigned",
  });
  stop(zonePickupId, 1, "pickup", "Newark Dock", "Newark", "NJ", "2026-10-14T20:00:00.000Z");
  const zoneSuggestion = await buildDeadheadSuggestion(queries.getLoad(zonePickupId)!);
  assert.ok(zoneSuggestion);
  assert.match(zoneSuggestion.place, /Chicago/i);
  assert.doesNotMatch(zoneSuggestion.place, /Albany/i);

  const { applyGeofenceArrivals } = await import("../lib/geofence");
  const fenceTruckId = queries.createTruck({
    unit_number: "DH-FENCE",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const fenceDriverId = queries.createDriver({
    name: "Fence Window",
    phone: "555-0192",
    license: "NE-FENCE-W",
    pin: "1920",
    truck_id: fenceTruckId,
    status: "available",
  });
  const hastingsDock = queries.createLocation({
    name: "Hastings Cold",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 40.586,
    longitude: -98.39,
  });
  const freshFenceId = load({
    number: "DH-FENCE-FRESH",
    origin: "Hastings, NE",
    destination: "El Paso, TX",
    pickup: tonight,
    delivery: "2026-10-16T18:00:00.000Z",
    driver: fenceDriverId,
    truck: fenceTruckId,
    status: "dispatched",
  });
  const freshPickup = db
    .prepare(
      `INSERT INTO load_stops (
         load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
       ) VALUES (?, 1, 'pickup', ?, 'Hastings Cold', 'Hastings', 'NE', ?, ?, '', '')`,
    )
    .run(freshFenceId, hastingsDock, tonight, tonight).lastInsertRowid;
  db.prepare("UPDATE loads SET created_at = '2026-10-14T12:00:00.000Z' WHERE id = ?").run(freshFenceId);
  db.prepare("UPDATE load_audit SET created_at = '2026-10-14T12:00:00.000Z' WHERE load_id = ?").run(freshFenceId);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-08-28T15:00:00.000Z', 40.586, -98.39, 'Hastings, NE', 'samsara')`,
  ).run(fenceTruckId);
  assert.equal(applyGeofenceArrivals(freshFenceId), 0);
  assert.equal(
    db.prepare("SELECT arrived_at FROM load_stops WHERE id = ?").get(freshPickup) &&
      (db.prepare("SELECT arrived_at AS at FROM load_stops WHERE id = ?").get(freshPickup) as { at: string }).at,
    "",
  );
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T22:00:00.000Z', 40.586, -98.39, 'Hastings, NE', 'samsara')`,
  ).run(fenceTruckId);
  applyGeofenceArrivals(freshFenceId);
  assert.equal(
    (db.prepare("SELECT arrived_at AS at FROM load_stops WHERE id = ?").get(freshPickup) as { at: string }).at,
    "2026-10-14T22:00:00.000Z",
  );

  const orderFenceId = load({
    number: "DH-FENCE-ORDER",
    origin: "Hastings, NE",
    destination: "El Paso, TX",
    pickup: "2026-10-14T12:00:00.000Z",
    delivery: "2026-10-15T12:00:00.000Z",
    driver: fenceDriverId,
    truck: fenceTruckId,
    status: "dispatched",
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 1, 'pickup', ?, 'Hastings Cold', 'Hastings', 'NE', '2026-10-14T12:00:00.000Z', '2026-10-14T12:00:00.000Z', '2026-10-14T12:00:00.000Z', '2026-10-14T18:00:00.000Z')`,
  ).run(orderFenceId, hastingsDock);
  const orderDelivery = db
    .prepare(
      `INSERT INTO load_stops (
         load_id, sequence, kind, location_id, name, city, state, window_start, window_end, arrived_at, departed_at
       ) VALUES (?, 2, 'delivery', ?, 'El Paso Dock', 'El Paso', 'TX', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z', '', '')`,
    )
    .run(orderFenceId, elPasoId).lastInsertRowid;
  db.prepare("UPDATE loads SET created_at = '2026-10-13T12:00:00.000Z' WHERE id = ?").run(orderFenceId);
  db.prepare("UPDATE load_audit SET created_at = '2026-10-13T12:00:00.000Z' WHERE load_id = ?").run(orderFenceId);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T10:00:00.000Z', 31.7619, -106.485, 'El Paso, TX', 'samsara')`,
  ).run(fenceTruckId);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T20:00:00.000Z', 31.7619, -106.485, 'El Paso, TX', 'samsara')`,
  ).run(fenceTruckId);
  applyGeofenceArrivals(orderFenceId);
  assert.equal(
    (db.prepare("SELECT arrived_at AS at FROM load_stops WHERE id = ?").get(orderDelivery) as { at: string }).at,
    "2026-10-14T20:00:00.000Z",
  );

  const unit27 = queries.createTruck({
    unit_number: "27",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const unit28 = queries.createTruck({
    unit_number: "28",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const kelvinId = queries.createDriver({
    name: "Kelvin",
    phone: "555-2828",
    license: "NE-KELVIN",
    pin: "2828",
    truck_id: unit28,
    status: "available",
  });
  const patId = queries.createDriver({
    name: "Pat Other",
    phone: "555-2827",
    license: "VA-PAT",
    pin: "2827",
    truck_id: unit27,
    status: "available",
  });
  const kelvinPickup = "2026-12-01T18:00:00.000Z";
  const olderOmaha = load({
    number: "DH-KELVIN-OLD",
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup: "2026-11-25T18:00:00.000Z",
    delivery: "2026-11-26T18:00:00.000Z",
    driver: kelvinId,
    truck: unit28,
  });
  stop(olderOmaha, 2, "delivery", "Omaha", "Omaha", "NE", "2026-11-26T18:00:00.000Z", "", "2026-11-26T18:00:00.000Z");
  const billed = load({
    number: "DH-KELVIN-BILLED",
    origin: "Omaha, NE",
    destination: "Billed Yard, NE",
    pickup: "2026-11-30T12:00:00.000Z",
    delivery: "2026-11-30T23:00:00.000Z",
    driver: kelvinId,
    truck: unit28,
    status: "accounting",
  });
  stop(billed, 2, "delivery", "Billed Yard", "Billed Yard", "NE", "2026-11-30T23:00:00.000Z", "", "2026-10-01T12:00:00.000Z");
  const rolling = load({
    number: "DH-KELVIN-ROLLING",
    origin: "Omaha, NE",
    destination: "Rolling Yard, NE",
    pickup: "2026-11-30T12:00:00.000Z",
    delivery: "2026-11-30T21:00:00.000Z",
    driver: kelvinId,
    truck: unit28,
    status: "in_transit",
  });
  stop(rolling, 2, "delivery", "Rolling Yard", "Rolling Yard", "NE", "2026-11-30T21:00:00.000Z", "", "2026-10-01T12:00:00.000Z");
  const cancelled = load({
    number: "DH-KELVIN-CANCEL",
    origin: "Omaha, NE",
    destination: "Cancelled Yard, NE",
    pickup: "2026-11-30T12:00:00.000Z",
    delivery: "2026-11-30T22:00:00.000Z",
    driver: kelvinId,
    truck: unit28,
    status: "cancelled",
  });
  stop(cancelled, 2, "delivery", "Cancelled Yard", "Cancelled Yard", "NE", "2026-11-30T22:00:00.000Z", "", "2026-10-01T12:00:00.000Z");
  const hastingsPrior = load({
    number: "DH-KELVIN-HASTINGS",
    origin: "Lincoln, NE",
    destination: "Hastings, NE",
    pickup: "2026-11-29T18:00:00.000Z",
    delivery: "2026-11-30T16:00:00.000Z",
    driver: kelvinId,
    truck: unit28,
  });
  db.prepare("UPDATE loads SET created_at = '2026-10-01T12:00:00.000Z' WHERE id = ?").run(hastingsPrior);
  stop(
    hastingsPrior,
    2,
    "delivery",
    "Hastings",
    "Hastings",
    "NE",
    "2026-11-30T16:00:00.000Z",
    "2026-08-20T15:00:00.000Z",
    "2026-10-05T15:00:00.000Z",
  );
  const wrongTruckPrior = load({
    number: "DH-UNIT27-PRIOR",
    origin: "Richmond, VA",
    destination: "Ruther Glen, VA",
    pickup: "2026-11-30T12:00:00.000Z",
    delivery: "2026-11-30T20:00:00.000Z",
    driver: patId,
    truck: unit27,
  });
  stop(wrongTruckPrior, 2, "delivery", "Ruther Glen", "Ruther Glen", "VA", "2026-11-30T20:00:00.000Z", "", "2026-11-30T20:00:00.000Z");
  const kelvinLoad = load({
    number: "DH-KELVIN",
    origin: "York, NE",
    destination: "Kansas City, MO",
    pickup: kelvinPickup,
    delivery: "2026-12-02T18:00:00.000Z",
    driver: kelvinId,
    truck: unit27,
    status: "assigned",
  });
  stop(kelvinLoad, 1, "pickup", "York", "York", "NE", kelvinPickup);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-12-01T12:00:00.000Z', 37.944, -77.597, 'Ruther Glen, VA', 'samsara')`,
  ).run(unit27);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-12-01T12:00:00.000Z', 40.926, -98.342, 'Grand Island, NE', 'samsara')`,
  ).run(unit28);

  const { choosePrior, deliveryKey, legacySuggestedPlace } = await import("../lib/empty-mile-start");
  const rollingDelivery = {
    kind: "delivery" as const,
    city: "York",
    state: "NE",
    window_start: "2026-10-11T12:00:00.000Z",
    window_end: "2026-10-11T12:00:00.000Z",
    latitude: 40.86,
    longitude: -97.59,
  };
  const deliveredWindow = {
    kind: "delivery" as const,
    city: "Omaha",
    state: "NE",
    window_start: "2026-10-12T12:00:00.000Z",
    window_end: "2026-10-12T12:00:00.000Z",
  };
  const bareHere = {
    id: 3,
    status: "assigned",
    driverId: 1,
    truckId: 9,
    createdAt: "2026-10-01T00:00:00.000Z",
    pickupStart: "2026-10-14T18:00:00.000Z",
    pickupEnd: "2026-10-14T18:00:00.000Z",
    deliveryStart: "2026-10-15T18:00:00.000Z",
    deliveryEnd: "2026-10-15T18:00:00.000Z",
  };
  const rollingMile = {
    id: 2,
    status: "in_transit",
    driverId: 1,
    truckId: 9,
    createdAt: "2026-10-01T00:00:00.000Z",
    pickupStart: "2026-10-10T12:00:00.000Z",
    pickupEnd: "2026-10-10T12:00:00.000Z",
    deliveryStart: "2026-10-11T12:00:00.000Z",
    deliveryEnd: "2026-10-11T12:00:00.000Z",
  };
  const finishedMile = {
    id: 1,
    status: "delivered",
    driverId: 1,
    truckId: 8,
    createdAt: "2026-09-01T00:00:00.000Z",
    pickupStart: "2026-10-01T12:00:00.000Z",
    pickupEnd: "2026-10-01T12:00:00.000Z",
    deliveryStart: "2026-10-12T12:00:00.000Z",
    deliveryEnd: "2026-10-12T12:00:00.000Z",
  };
  const pureStops = new Map<number, Array<typeof rollingDelivery | typeof deliveredWindow>>([
    [3, [{ kind: "pickup", city: "Lincoln", state: "NE", window_start: bareHere.pickupStart, window_end: bareHere.pickupEnd, latitude: null, longitude: null }]],
    [2, [rollingDelivery]],
    [1, [deliveredWindow]],
  ]);
  const arrivedByGps = choosePrior({
    load: bareHere,
    driverLoads: [rollingMile, finishedMile],
    truckLoads: [],
    stops: pureStops,
    gpsByTruck: new Map([
      [
        9,
        [
          { address: "York, NE", recordedAt: "2026-08-01T18:00:00.000Z", latitude: 40.86, longitude: -97.59 },
          { address: "York, NE", recordedAt: "2026-10-13T18:00:00.000Z", latitude: 40.86, longitude: -97.59 },
        ],
      ],
    ]),
    mode: "current",
  });
  assert.equal(arrivedByGps.load?.id, 2);
  assert.equal(arrivedByGps.place, "York, NE");
  assert.equal(arrivedByGps.at, "2026-10-13T18:00:00.000Z");
  const stalePingOnly = choosePrior({
    load: bareHere,
    driverLoads: [rollingMile, finishedMile],
    truckLoads: [],
    stops: pureStops,
    gpsByTruck: new Map([
      [9, [{ address: "York, NE", recordedAt: "2026-08-01T18:00:00.000Z", latitude: 40.86, longitude: -97.59 }]],
    ]),
    mode: "current",
  });
  assert.equal(stalePingOnly.load?.id, 1);
  const windowOnly = choosePrior({
    load: bareHere,
    driverLoads: [rollingMile, finishedMile],
    truckLoads: [],
    stops: pureStops,
    mode: "current",
  });
  assert.equal(windowOnly.load?.id, 1);
  const unloadingMile = { ...rollingMile, id: 4, status: "unloading", truckId: 4 };
  const unloadingStops = new Map(pureStops);
  unloadingStops.set(4, [
    {
      kind: "delivery",
      city: "Crete",
      state: "NE",
      window_start: "2026-10-13T20:00:00.000Z",
      window_end: "2026-10-13T20:00:00.000Z",
      latitude: null,
      longitude: null,
    },
  ]);
  const atConsignee = choosePrior({
    load: bareHere,
    driverLoads: [unloadingMile, finishedMile],
    truckLoads: [],
    stops: unloadingStops,
    mode: "current",
  });
  assert.equal(atConsignee.place, "Crete, NE");
  const { deadheadPromptText } = await import("../lib/empty-miles-shared");
  const hastingsView = queries.getLoad(hastingsPrior);
  assert.ok(hastingsView);
  const hastingsStops = [
    {
      kind: "delivery",
      city: "Hastings",
      state: "NE",
      name: "Hastings",
      window_start: "2026-11-30T16:00:00.000Z",
      window_end: "2026-11-30T16:00:00.000Z",
      arrived_at: "2026-08-20T15:00:00.000Z",
      departed_at: "2026-10-05T15:00:00.000Z",
    },
  ];
  const hastingsMile = {
    id: hastingsView.id,
    status: hastingsView.status,
    driverId: hastingsView.driver_id,
    truckId: hastingsView.truck_id,
    createdAt: hastingsView.created_at,
    pickupStart: hastingsView.pickup_start,
    pickupEnd: hastingsView.pickup_end,
    deliveryStart: hastingsView.delivery_start,
    deliveryEnd: hastingsView.delivery_end,
  };
  assert.equal(deliveryKey(hastingsMile, hastingsStops, "legacy"), "2026-10-05T15:00:00.000Z");
  assert.equal(deliveryKey(hastingsMile, hastingsStops, "current"), "2026-11-30T16:00:00.000Z");

  const kelvinView = queries.getLoad(kelvinLoad);
  assert.ok(kelvinView);
  assert.equal(previousLoadForEmptyMiles(kelvinView)?.id, hastingsPrior);
  const suggestion = await buildDeadheadSuggestion(kelvinView);
  assert.ok(suggestion);
  const beforePrompt = "Did Kelvin start here? Ruther Glen, VA";
  const afterPrompt = "Did Kelvin start here? Hastings, NE";
  const stopRows = db
    .prepare(
      `SELECT load_id, kind, city, state, street, zip, name, window_start, window_end, arrived_at, departed_at
       FROM load_stops WHERE load_id IN (
         SELECT id FROM loads WHERE driver_id IN (?, ?) OR truck_id IN (?, ?)
       ) OR load_id = ?
       ORDER BY load_id, sequence, id`,
    )
    .all(kelvinId, patId, unit28, unit27, kelvinLoad) as Array<Record<string, string | number | null>>;
  const stopMap = new Map<number, Array<Record<string, string | number | null>>>();
  for (const row of stopRows) {
    const list = stopMap.get(Number(row.load_id)) ?? [];
    list.push(row);
    stopMap.set(Number(row.load_id), list);
  }
  function mileOf(view: NonNullable<ReturnType<typeof queries.getLoad>>) {
    return {
      id: view.id,
      status: view.status,
      driverId: view.driver_id,
      truckId: view.truck_id,
      createdAt: view.created_at,
      pickupStart: view.pickup_start,
      pickupEnd: view.pickup_end,
      deliveryStart: view.delivery_start,
      deliveryEnd: view.delivery_end,
    };
  }
  const driverHistory = queries
    .listLoadsForDriver(kelvinId)
    .filter((row) => row.driver_id === kelvinId)
    .map(mileOf);
  const truckHistory = queries
    .listLoadsForTruck(unit27)
    .map(mileOf);
  const legacyChoice = choosePrior({
    load: mileOf(kelvinView),
    driverLoads: driverHistory,
    truckLoads: truckHistory,
    stops: stopMap,
    mode: "legacy",
  });
  const legacyPlace = legacySuggestedPlace({
    deliveryPlace: legacyChoice.place,
    deliveryPoint: null,
    pickupMs: legacyChoice.pickupMs,
    pickupPoint: null,
    pings: [
      {
        address: "Ruther Glen, VA",
        recordedAt: "2026-12-01T12:00:00.000Z",
        latitude: 37.944,
        longitude: -77.597,
      },
    ],
  });
  assert.equal(deadheadPromptText(suggestion.driverName, legacyPlace), beforePrompt);
  assert.equal(deadheadPromptText(suggestion.driverName, suggestion.place), afterPrompt);
  assert.equal(suggestion.basis, "previous_delivery");
  assert.equal(
    suggestion.notes.find((note) => note.includes("Unit")),
    "This load's truck (Unit 27) isn't the truck Kelvin was on (Unit 28).",
  );
  assert.ok(suggestion.notes.some((note) => note.includes("Grand Island, NE")));
  assert.equal(
    suggestion.notes.some((note) => note.includes("Ruther Glen")),
    false,
  );
  assert.equal(suggestion.notes.some((note) => note.includes(String(unit27)) && !note.includes("Unit 27")), false);
  const savedKelvin = await refreshLoadEmptyMiles(kelvinLoad);
  assert.equal(savedKelvin.pending, true);
  assert.match(savedKelvin.from, /Hastings/i);
  assert.equal(queries.getLoad(kelvinLoad)?.empty_confirmed, 0);
  assert.equal(queries.getLoad(kelvinLoad)?.empty_miles ?? null, null);

  const whaleyId = queries.createDriver({
    name: "Kelvin Whaley",
    phone: "555-1212",
    license: "NE-WHALEY",
    pin: "1212",
    truck_id: unit28,
    status: "available",
  });
  const germanId = queries.createDriver({
    name: "German Avila",
    phone: "555-3636",
    license: "NJ-GERMAN",
    pin: "3636",
    truck_id: null,
    status: "available",
  });
  const unit36 = queries.createTruck({
    unit_number: "36",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  db.prepare("UPDATE drivers SET truck_id = ? WHERE id = ?").run(unit36, germanId);
  const samId = queries.createDriver({
    name: "Sam Prior",
    phone: "555-2829",
    license: "NE-SAM",
    pin: "2829",
    truck_id: unit28,
    status: "available",
  });
  function backdate(loadId: number, createdAt: string): void {
    db.prepare("UPDATE loads SET created_at = ? WHERE id = ?").run(createdAt, loadId);
  }
  const hastingsLoc = queries.createLocation({
    name: "649 E 39th St",
    street: "",
    city: "Hastings",
    state: "NE",
    zip: "",
    phone: "",
    notes: "",
    role: "both",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 40.5861,
    longitude: -98.3884,
  });
  const prodHastings = load({
    number: "1006271",
    origin: "Holcomb, KS",
    destination: "Hastings, NE",
    pickup: "2026-10-10T13:00:00.000Z",
    delivery: "2026-10-11T17:00:00",
    driver: whaleyId,
    truck: unit28,
    status: "at_delivery",
  });
  backdate(prodHastings, "2026-10-01T12:00:00.000Z");
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, location_id, name, street, city, state,
       window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', ?, '649 E 39th St', '', 'Hastings', 'NE', ?, ?, ?, ?)`,
  ).run(
    prodHastings,
    hastingsLoc,
    "2026-10-11T08:00:00",
    "2026-10-11T17:00:00",
    "2026-08-27T12:00:00.000Z",
    "2026-08-28T12:00:00.000Z",
  );
  const junction = load({
    number: "1006279",
    origin: "Crete, NE",
    destination: "Junction City, KS",
    pickup: "2026-10-12T13:00:00.000Z",
    delivery: "2026-10-12T17:00:00",
    driver: whaleyId,
    truck: unit28,
  });
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, name, city, state, schedule_source, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', 'Junction City', 'Junction City', 'KS', 'its', ?, ?, '', '')`,
  ).run(junction, "2026-10-12T08:00:00", "2026-10-12T17:00:00");
  const prodCancelled = load({
    number: "1006274",
    origin: "Crete, NE",
    destination: "Cancelled Yard, KS",
    pickup: "2026-10-13T13:00:00.000Z",
    delivery: "2026-10-14T17:00:00.000Z",
    driver: whaleyId,
    truck: unit28,
    status: "cancelled",
  });
  stop(prodCancelled, 2, "delivery", "Cancelled Yard", "Cancelled Yard", "KS", "2026-10-14T17:00:00.000Z", "", "2026-10-14T17:00:00.000Z");
  const wrongYard = load({
    number: "1006201",
    origin: "Richmond, VA",
    destination: "Wrong Yard, VA",
    pickup: "2026-10-13T13:00:00.000Z",
    delivery: "2026-10-14T17:30:00.000Z",
    driver: patId,
    truck: unit27,
  });
  backdate(wrongYard, "2026-10-01T12:00:00.000Z");
  stop(wrongYard, 2, "delivery", "Wrong Yard", "Wrong Yard", "VA", "2026-10-14T17:30:00.000Z", "2026-08-01T12:00:00.000Z", "2026-08-01T12:00:00.000Z");
  const prodKelvin = load({
    number: "1006283",
    origin: "York, NE",
    destination: "Kansas City, MO",
    pickup: "2026-10-14T18:00:00.000Z",
    delivery: "2026-10-15T18:00:00.000Z",
    driver: whaleyId,
    truck: unit27,
    status: "assigned",
  });
  stop(prodKelvin, 1, "pickup", "York", "York", "NE", "2026-10-14T18:00:00.000Z");
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-08-27T18:00:00.000Z', 40.5861, -98.3884, 'Hastings, NE', 'samsara')`,
  ).run(unit28);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T17:08:00.000Z', 40.5861, -98.3884, 'Hastings, NE', 'samsara')`,
  ).run(unit28);
  db.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, '2026-10-14T16:00:00.000Z', 37.944, -77.597, 'Ruther Glen, VA', 'samsara')`,
  ).run(unit27);
  const keasbey = load({
    number: "1006264",
    origin: "Bronx, NY",
    destination: "Keasbey, NJ",
    pickup: "2026-10-13T12:00:00.000Z",
    delivery: "2026-10-13T16:00:00.000Z",
    driver: germanId,
    truck: unit36,
    status: "at_delivery",
  });
  backdate(keasbey, "2026-10-01T12:00:00.000Z");
  stop(keasbey, 2, "delivery", "Keasbey", "Keasbey", "NJ", "2026-10-13T16:00:00.000Z", "2026-10-13T16:00:00.000Z", "2026-10-13T17:00:00.000Z");
  const miami = load({
    number: "1006240",
    origin: "Edwardsville, KS",
    destination: "Miami, FL",
    pickup: "2026-10-11T12:00:00.000Z",
    delivery: "2026-10-12T20:00:00.000Z",
    driver: germanId,
    truck: unit36,
  });
  backdate(miami, "2026-09-01T12:00:00.000Z");
  db.prepare(
    `INSERT INTO load_stops (
       load_id, sequence, kind, name, street, city, state, window_start, window_end, arrived_at, departed_at
     ) VALUES (?, 2, 'delivery', 'Miami', '6851 NW 32nd Ave', 'Miami', 'FL', ?, ?, ?, ?)`,
  ).run(miami, "2026-10-12T20:00:00.000Z", "2026-10-12T20:00:00.000Z", "2026-08-20T12:00:00.000Z", "2026-08-20T18:00:00.000Z");
  const prodGerman = load({
    number: "1006275",
    origin: "Keasbey, NJ",
    destination: "Edwardsville, KS",
    pickup: "2026-10-14T18:00:00.000Z",
    delivery: "2026-10-16T18:00:00.000Z",
    driver: germanId,
    truck: unit36,
    status: "assigned",
  });
  stop(prodGerman, 1, "pickup", "Keasbey", "Keasbey", "NJ", "2026-10-14T18:00:00.000Z");
  const juniata = load({
    number: "1000728",
    origin: "Hastings, NE",
    destination: "Juniata, NE",
    pickup: "2026-10-08T12:00:00.000Z",
    delivery: "2026-10-08T18:00:00.000Z",
    driver: samId,
    truck: unit28,
  });
  backdate(juniata, "2026-10-01T12:00:00.000Z");
  stop(juniata, 2, "delivery", "Juniata", "Juniata", "NE", "2026-10-08T18:00:00.000Z", "2026-10-08T18:00:00.000Z", "2026-10-08T19:00:00.000Z");
  const prodTruckOnly = queries.createLoad({
    load_number: "1000730",
    customer_id: customerId,
    origin: "Juniata, NE",
    destination: "Grand Island, NE",
    pickup_start: "2026-10-09T18:00:00.000Z",
    pickup_end: "2026-10-09T18:00:00.000Z",
    delivery_start: "2026-10-10T18:00:00.000Z",
    delivery_end: "2026-10-10T18:00:00.000Z",
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
    status: "assigned",
    truck_id: unit28,
    driver_id: null,
  });
  stop(prodTruckOnly, 1, "pickup", "Juniata", "Juniata", "NE", "2026-10-09T18:00:00.000Z");

  const whaleyView = queries.getLoad(prodKelvin);
  assert.ok(whaleyView);
  assert.equal(previousLoadForEmptyMiles(whaleyView)?.load_number, "1006271");
  const whaleySuggestion = await buildDeadheadSuggestion(whaleyView);
  assert.ok(whaleySuggestion);
  assert.equal(deadheadPromptText(whaleySuggestion.driverName, "Junction City, KS"), "Did Kelvin Whaley start here? Junction City, KS");
  assert.equal(deadheadPromptText(whaleySuggestion.driverName, whaleySuggestion.place), "Did Kelvin Whaley start here? Hastings, NE");
  assert.equal(
    whaleySuggestion.notes.find((note) => note.includes("Unit")),
    "This load's truck (Unit 27) isn't the truck Kelvin Whaley was on (Unit 28).",
  );
  assert.equal(whaleySuggestion.place.includes("Junction City"), false);
  const savedWhaley = await refreshLoadEmptyMiles(prodKelvin);
  assert.equal(savedWhaley.pending, true);
  assert.match(savedWhaley.from, /Hastings, NE/);
  assert.equal(queries.getLoad(prodKelvin)?.empty_confirmed, 0);
  assert.equal(queries.getLoad(prodKelvin)?.empty_miles ?? null, null);

  const germanView = queries.getLoad(prodGerman);
  assert.ok(germanView);
  assert.equal(previousLoadForEmptyMiles(germanView)?.load_number, "1006264");
  const germanSuggestion = await buildDeadheadSuggestion(germanView);
  assert.ok(germanSuggestion);
  assert.equal(germanSuggestion.place, "Keasbey, NJ");
  assert.equal(germanSuggestion.place.includes("Miami"), false);
  assert.equal(germanSuggestion.place.includes("6851"), false);

  const truckOnlyView = queries.getLoad(prodTruckOnly);
  assert.ok(truckOnlyView);
  assert.equal(truckOnlyView.driver_id, null);
  assert.equal(previousLoadForEmptyMiles(truckOnlyView)?.load_number, "1000728");
  const truckSuggestion = await buildDeadheadSuggestion(truckOnlyView);
  assert.ok(truckSuggestion);
  assert.equal(truckSuggestion.place, "Juniata, NE");

  const { spawnSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const fs = await import("node:fs");
  function fingerprint(file: string): string {
    if (!fs.existsSync(file)) return "missing";
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  }
  const watched = [dbPath, `${dbPath}-wal`];
  const beforeFiles = watched.map(fingerprint);
  const suggestionBefore = queries.getLoad(kelvinLoad)?.empty_suggestion ?? "";
  const audit = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(process.cwd(), "scripts", "empty-mile-start-audit.ts"),
      dbPath,
      "80",
    ],
    { encoding: "utf8" },
  );
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  const auditRow = audit.stdout
    .split("\n")
    .find((line) => line.startsWith("DH-KELVIN\t"));
  assert.equal(auditRow, "DH-KELVIN\tKelvin\t27\tRuther Glen, VA\tHastings, NE");
  const auditLines = new Map(
    audit.stdout
      .split("\n")
      .filter((line) => line.includes("\t"))
      .map((line) => [line.split("\t")[0], line] as const),
  );
  assert.equal(auditLines.get("1006283"), "1006283\tKelvin Whaley\t27\tJunction City, KS\tHastings, NE");
  assert.equal(auditLines.get("1006275"), "1006275\tGerman Avila\t36\tKeasbey, NJ\tKeasbey, NJ");
  assert.equal(auditLines.get("1000730"), "1000730\t\t28\tJuniata, NE\tJuniata, NE");
  assert.equal(watched.map(fingerprint).join(), beforeFiles.join());
  assert.equal(queries.getLoad(kelvinLoad)?.empty_suggestion ?? "", suggestionBefore);
  assert.equal(queries.getLoad(kelvinLoad)?.empty_confirmed, 0);

  const { DatabaseSync } = await import("node:sqlite");
  const { auditEmptyMileStarts } = await import("../scripts/empty-mile-start-audit");
  const countPath = path.join(os.tmpdir(), `tms-empty-mile-count-${Date.now()}-${process.pid}.db`);
  const countDb = new DatabaseSync(countPath);
  countDb.exec(`
    CREATE TABLE drivers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE trucks (
      id INTEGER PRIMARY KEY, unit_number TEXT, gps_address TEXT, gps_recorded_at TEXT,
      gps_latitude REAL, gps_longitude REAL, gps_source TEXT
    );
    CREATE TABLE loads (
      id INTEGER PRIMARY KEY, load_number TEXT, status TEXT, driver_id INTEGER, truck_id INTEGER,
      created_at TEXT, pickup_start TEXT, pickup_end TEXT, delivery_start TEXT, delivery_end TEXT
    );
    CREATE TABLE load_stops (
      id INTEGER PRIMARY KEY, load_id INTEGER, sequence INTEGER, kind TEXT, city TEXT, state TEXT,
      street TEXT, zip TEXT, name TEXT, schedule_source TEXT, window_start TEXT, window_end TEXT,
      arrived_at TEXT, departed_at TEXT, location_id INTEGER
    );
    CREATE TABLE locations (id INTEGER PRIMARY KEY, latitude REAL, longitude REAL);
    CREATE TABLE truck_gps_readings (
      id INTEGER PRIMARY KEY, truck_id INTEGER, recorded_at TEXT, latitude REAL, longitude REAL,
      address TEXT, source TEXT
    );
    INSERT INTO drivers (id, name) VALUES (1, 'Row Driver');
    INSERT INTO trucks (id, unit_number, gps_address, gps_recorded_at, gps_source) VALUES (1, '1', '', '', '');
  `);
  const nowMs = Date.now();
  const insertLoad = countDb.prepare(
    `INSERT INTO loads (
       load_number, status, driver_id, truck_id, created_at, pickup_start, pickup_end, delivery_start, delivery_end
     ) VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?)`,
  );
  for (let index = 0; index < 9; index += 1) {
    const pickup = new Date(nowMs - index * 60 * 60 * 1000).toISOString();
    insertLoad.run(`ROW-A-${index}`, "assigned", pickup, pickup, pickup, pickup, pickup);
  }
  for (let index = 0; index < 6; index += 1) {
    const pickup = new Date(nowMs - (3 + index) * 24 * 60 * 60 * 1000).toISOString();
    const delivery = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();
    insertLoad.run(`ROW-R-${index}`, "delivered", pickup, pickup, pickup, delivery, delivery);
  }
  for (let index = 0; index < 3; index += 1) {
    const pickup = new Date(nowMs + (10 + index) * 24 * 60 * 60 * 1000).toISOString();
    const delivery = new Date(nowMs - 200 * 24 * 60 * 60 * 1000).toISOString();
    insertLoad.run(`ROW-X-${index}`, "delivered", pickup, pickup, pickup, delivery, delivery);
  }
  countDb.close();
  const counted = auditEmptyMileStarts(countPath, 15);
  const countedRows = counted.split("\n").filter((line) => line && !line.startsWith("load_number\t"));
  assert.equal(countedRows.length, 15);
  assert.equal(countedRows.some((line) => line.startsWith("ROW-X-")), false);
  assert.equal(countedRows.filter((line) => line.startsWith("ROW-A-")).length, 9);
  assert.equal(countedRows.filter((line) => line.startsWith("ROW-R-")).length, 6);

  closeDb();
  console.log("deadhead confirm ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
