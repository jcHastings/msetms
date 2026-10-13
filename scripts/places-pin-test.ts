import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-places-pin-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;
delete process.env.GOOGLE_MAPS_BROWSER_KEY;

const raw = new DatabaseSync(dbPath);
raw.exec(`
  CREATE TABLE load_relays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    load_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    pickup TEXT NOT NULL DEFAULT '',
    delivery TEXT NOT NULL DEFAULT '',
    from_driver_id INTEGER,
    from_truck_id INTEGER,
    from_trailer_id INTEGER,
    driver_id INTEGER,
    truck_id INTEGER,
    trailer_id INTEGER,
    oo_percent REAL,
    oo_pay REAL,
    completed_at TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO load_relays (load_id, sequence, pickup, delivery, notes, created_at, updated_at)
  VALUES (999, 1, 'Dallas, TX', 'Memphis, TN', 'keep me', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    street TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    zip TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'both',
    scheduling_type TEXT NOT NULL DEFAULT 'fcfs',
    hours TEXT NOT NULL DEFAULT '',
    scheduling_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO locations (name, street, city, state, zip, created_at, updated_at)
  VALUES ('Old Yard', '9 Legacy Rd', 'Omaha', 'NE', '68102', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
`);
raw.close();

const pickup = "2026-04-01T12:00:00.000Z";
const pickupEnd = "2026-04-01T14:00:00.000Z";
const delivery = "2026-04-03T12:00:00.000Z";
const deliveryEnd = "2026-04-03T16:00:00.000Z";

const tysonComponents = [
  { long_name: "2200", short_name: "2200", types: ["street_number"] },
  { long_name: "Don Tyson Parkway", short_name: "Don Tyson Pkwy", types: ["route"] },
  { long_name: "Springdale", short_name: "Springdale", types: ["locality", "political"] },
  { long_name: "Arkansas", short_name: "AR", types: ["administrative_area_level_1", "political"] },
  { long_name: "72764", short_name: "72764", types: ["postal_code"] },
  { long_name: "United States", short_name: "US", types: ["country", "political"] },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function main() {
  const placesShared = await import("../lib/places-shared");
  const parsed = placesShared.parseAddressComponents(tysonComponents);
  assert.equal(parsed.street, "2200 Don Tyson Parkway");
  assert.equal(parsed.city, "Springdale");
  assert.equal(parsed.state, "AR");
  assert.equal(parsed.zip, "72764");
  assert.equal(parsed.country, "US");

  const borough = placesShared.parseAddressComponents([
    { long_name: "1", short_name: "1", types: ["street_number"] },
    { long_name: "Brooklyn Bridge", short_name: "Brooklyn Bridge", types: ["route"] },
    { long_name: "Brooklyn", short_name: "Brooklyn", types: ["sublocality", "political"] },
    { long_name: "New Jersey", short_name: "NJ", types: ["administrative_area_level_1"] },
    { long_name: "11201", short_name: "11201", types: ["postal_code"] },
  ]);
  assert.equal(borough.city, "Brooklyn");
  assert.equal(borough.state, "NY");

  assert.equal(
    placesShared.relayPointLabel({ name: "Pilot Travel Center", city: "Oklahoma City", state: "OK" }),
    "Pilot Travel Center, Oklahoma City, OK",
  );
  assert.throws(() => placesShared.parseCoordPair("95", "-97"), /between -90 and 90/);
  assert.throws(() => placesShared.parseCoordPair("35", "200"), /between -180 and 180/);
  assert.deepEqual(placesShared.parseCoordPair("", ""), { lat: null, lng: null });

  const { getDb, migrate } = await import("../lib/db");
  const db = getDb();
  const relayCols = db.prepare("PRAGMA table_info(load_relays)").all() as Array<{ name: string }>;
  for (const name of ["relay_place_id", "relay_lat", "relay_lng", "relay_address"]) {
    assert.equal(relayCols.filter((column) => column.name === name).length, 1, name);
  }
  const locationCols = db.prepare("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
  for (const name of ["latitude", "longitude", "google_place_id", "country", "verified_at"]) {
    assert.equal(locationCols.filter((column) => column.name === name).length, 1, name);
  }
  assert.equal(locationCols.some((column) => column.name === "place_id"), false, "reuse google_place_id");

  const kept = db.prepare("SELECT delivery, notes, relay_lat, relay_place_id FROM load_relays WHERE delivery = 'Memphis, TN'").get() as {
    delivery: string;
    notes: string;
    relay_lat: number | null;
    relay_place_id: string | null;
  };
  assert.equal(kept.delivery, "Memphis, TN");
  assert.equal(kept.notes, "keep me");
  assert.equal(kept.relay_lat, null);
  assert.equal(kept.relay_place_id, null);
  const oldYard = db.prepare("SELECT name, street, verified_at, google_place_id FROM locations WHERE name = 'Old Yard'").get() as {
    name: string;
    street: string;
    verified_at: string | null;
    google_place_id: string;
  };
  assert.equal(oldYard.street, "9 Legacy Rd");
  assert.equal(oldYard.verified_at, null);

  migrate(db);
  const keptAgain = db.prepare("SELECT delivery, notes FROM load_relays WHERE delivery = 'Memphis, TN'").get() as {
    delivery: string;
    notes: string;
  };
  assert.equal(keptAgain.notes, "keep me");
  assert.equal(
    (db.prepare("PRAGMA table_info(load_relays)").all() as Array<{ name: string }>).filter((column) => column.name === "relay_lat").length,
    1,
  );

  const relayMap = await import("../lib/relay-map");
  const stored = relayMap.storedRelayCoord({ relay_lat: 35.51, relay_lng: -97.61 });
  assert.deepEqual(stored, { lat: 35.51, lng: -97.61 });
  assert.equal(relayMap.storedRelayCoord({ relay_lat: null, relay_lng: null }), null);
  assert.equal(relayMap.storedRelayCoord({ relay_lat: 120, relay_lng: -97 }), null);

  let geocodeCalls = 0;
  const pinned = await relayMap.buildRelayMapPoints(
    [{ id: 4, sequence: 1, pickup: "Dallas, TX", delivery: "Oklahoma City, OK", relay_lat: 35.51, relay_lng: -97.61 }],
    [],
    async () => {
      geocodeCalls += 1;
      return { latitude: 1, longitude: 2 };
    },
  );
  assert.equal(geocodeCalls, 0, "stored coordinates win before geocode and the city table");
  assert.equal(pinned[0]?.lat, 35.51);
  assert.equal(pinned[0]?.lng, -97.61);
  assert.notEqual(pinned[0]?.lat, 35.4676);

  const queries = await import("../lib/queries");
  const relayStore = await import("../lib/relay-store");
  const loadStops = await import("../lib/stops");
  const mapLib = await import("../lib/load-map");
  const verify = await import("../lib/location-verify");
  const verifyStore = await import("../lib/location-verify-store");
  const places = await import("../lib/places");

  assert.equal(await places.findBestPlace("Tyson Foods Springdale"), null);

  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  let detailCalls = 0;
  const found = await places.findBestPlace("Tyson Foods, Springdale, AR", async (input) => {
    const url = String(input);
    if (url.includes("findplacefromtext")) {
      return jsonResponse({ status: "OK", candidates: [{ place_id: "place-tyson" }] });
    }
    if (url.includes("place/details")) {
      detailCalls += 1;
      return jsonResponse({
        status: "OK",
        result: {
          name: "Tyson Foods",
          formatted_address: "2200 Don Tyson Pkwy, Springdale, AR 72764, USA",
          address_components: tysonComponents,
          geometry: { location: { lat: 36.186, lng: -94.128 } },
        },
      });
    }
    throw new Error(`unexpected ${url}`);
  });
  assert.ok(found);
  assert.equal(found.placeId, "place-tyson");
  assert.equal(found.street, "2200 Don Tyson Parkway");
  assert.equal(found.city, "Springdale");
  assert.equal(found.state, "AR");
  assert.equal(found.zip, "72764");
  assert.equal(found.country, "US");
  assert.equal(found.latitude, 36.186);
  assert.equal(detailCalls, 1);

  const geocoded = await places.findBestPlace("Nowhere Depot", async (input) => {
    const url = String(input);
    if (url.includes("findplacefromtext")) return jsonResponse({ status: "ZERO_RESULTS", candidates: [] });
    if (url.includes("geocode")) {
      return jsonResponse({
        status: "OK",
        results: [
          {
            place_id: "place-geo",
            formatted_address: "100 Main St, Dallas, TX 75201, USA",
            address_components: [
              { long_name: "100", short_name: "100", types: ["street_number"] },
              { long_name: "Main Street", short_name: "Main St", types: ["route"] },
              { long_name: "Dallas", short_name: "Dallas", types: ["locality"] },
              { long_name: "Texas", short_name: "TX", types: ["administrative_area_level_1"] },
              { long_name: "75201", short_name: "75201", types: ["postal_code"] },
              { long_name: "United States", short_name: "US", types: ["country"] },
            ],
            geometry: { location: { lat: 32.78, lng: -96.8 } },
          },
        ],
      });
    }
    throw new Error(`unexpected ${url}`);
  });
  assert.equal(geocoded?.placeId, "place-geo");
  assert.equal(geocoded?.state, "TX");
  delete process.env.GOOGLE_MAPS_API_KEY;

  const compare = verify.compareLocationToPlace(
    {
      name: "Tyson",
      street: "1 Old Rd",
      city: "Springdale",
      state: "AR",
      zip: "72762",
      latitude: 36.19,
      longitude: -94.13,
    },
    found,
  );
  assert.equal(compare.google.street, "2200 Don Tyson Parkway");
  assert.equal(compare.current.street, "1 Old Rd");
  assert.ok(compare.distanceMiles != null && compare.distanceMiles < 2);
  assert.match(compare.distanceLabel, /mi/);
  assert.equal(
    verify.compareLocationToPlace(
      { name: "Yard", street: "", city: "Omaha", state: "NE", zip: "", latitude: null, longitude: null },
      { ...found, latitude: null, longitude: null },
    ).distanceLabel,
    "No saved pin to measure",
  );

  const customerId = queries.createCustomer({ name: "Places Pin Co", billing_notes: "", contacts: [] });
  const dallas = queries.createLocation({
    name: "Dallas Dock",
    street: "1 Main",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 32.7767,
    longitude: -96.797,
  });
  const chicago = queries.createLocation({
    name: "Chicago Dock",
    street: "2 Lake",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 41.8781,
    longitude: -87.6298,
  });
  const loadId = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Chicago, IL",
    pickup_start: pickup,
    pickup_end: pickupEnd,
    delivery_start: delivery,
    delivery_end: deliveryEnd,
    weight: 1000,
    commodity: "Pins",
    rate: 500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: dallas,
    consignee_location_id: chicago,
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(loadId, { kind: "pickup", name: "Dallas Dock", city: "Dallas", state: "TX", location_id: dallas });
  loadStops.addStop(loadId, { kind: "delivery", name: "Chicago Dock", city: "Chicago", state: "IL", location_id: chicago });
  const relayId = relayStore.addRelay(loadId, {
    delivery: "Pilot Travel Center, Oklahoma City, OK",
    relay_place_id: "place-pilot",
    relay_lat: 35.51,
    relay_lng: -97.61,
    relay_address: "9100 S I-35, Oklahoma City, OK",
  });
  const saved = relayStore.getRelay(relayId);
  assert.equal(saved?.delivery, "Pilot Travel Center, Oklahoma City, OK");
  assert.equal(saved?.relay_place_id, "place-pilot");
  assert.equal(saved?.relay_lat, 35.51);
  assert.equal(saved?.relay_lng, -97.61);
  assert.equal(saved?.relay_address, "9100 S I-35, Oklahoma City, OK");
  assert.throws(
    () => relayStore.addRelay(loadId, { delivery: "Bad pin", relay_lat: 95, relay_lng: -97 }),
    /between -90 and 90/,
  );

  const model = await mapLib.buildStopsMapModel(loadId);
  const relayPin = model.points.find((point) => point.kind === "relay");
  assert.equal(relayPin?.lat, 35.51);
  assert.equal(relayPin?.lng, -97.61);
  assert.equal(relayPin?.label, "Relay 1 — Pilot Travel Center, Oklahoma City, OK");

  relayStore.updateRelay(relayId, { delivery: "Pilot Travel Center, Oklahoma City, OK" });
  assert.equal(relayStore.getRelay(relayId)?.relay_lat, 35.51, "an update that omits the pin keeps it");

  const yardId = queries.createLocation({
    name: "Tyson",
    street: "1 Old Rd",
    city: "Springdale",
    state: "AR",
    zip: "72762",
    phone: "555",
    notes: "private",
    role: "both",
    scheduling_type: "appointment",
    hours: "Mon 8-4",
    scheduling_notes: "dock 2",
    latitude: 36.19,
    longitude: -94.13,
  });
  const stopId = loadStops.addStop(loadId, {
    kind: "pickup",
    name: "Tyson",
    street: "1 Old Rd",
    city: "Springdale",
    state: "AR",
    zip: "72762",
    location_id: yardId,
  });
  const beforeStop = loadStops.getStop(stopId);
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  let lookups = 0;
  const fetchImpl = async (input: string | URL) => {
    lookups += 1;
    const url = String(input);
    if (url.includes("findplacefromtext")) return jsonResponse({ status: "OK", candidates: [{ place_id: "place-tyson" }] });
    return jsonResponse({
      status: "OK",
      result: {
        name: "Tyson Foods",
        formatted_address: "2200 Don Tyson Pkwy, Springdale, AR 72764, USA",
        address_components: tysonComponents,
        geometry: { location: { lat: 36.186, lng: -94.128 } },
      },
    });
  };
  const firstLookup = await verifyStore.lookupLocationPlace(yardId, { fetchImpl });
  assert.equal(firstLookup.place?.street, "2200 Don Tyson Parkway");
  const callsAfterFirst = lookups;
  const secondLookup = await verifyStore.lookupLocationPlace(yardId, { fetchImpl });
  assert.equal(lookups, callsAfterFirst, "a repeated lookup uses the cache");
  assert.equal(secondLookup.place?.placeId, "place-tyson");
  verifyStore.acceptCachedPlace(yardId);
  const accepted = queries.getLocation(yardId);
  assert.equal(accepted?.street, "2200 Don Tyson Parkway");
  assert.equal(accepted?.city, "Springdale");
  assert.equal(accepted?.state, "AR");
  assert.equal(accepted?.zip, "72764");
  assert.equal(accepted?.country, "US");
  assert.equal(accepted?.latitude, 36.186);
  assert.equal(accepted?.longitude, -94.128);
  assert.equal(accepted?.google_place_id, "place-tyson");
  assert.ok(accepted?.verified_at);
  assert.equal(accepted?.phone, "555");
  assert.equal(accepted?.notes, "private");
  const afterStop = loadStops.getStop(stopId);
  assert.equal(afterStop?.street, beforeStop?.street);
  assert.equal(afterStop?.city, beforeStop?.city);
  assert.equal(afterStop?.zip, beforeStop?.zip);
  assert.equal(afterStop?.location_id, yardId);

  for (let index = 0; index < 12; index += 1) {
    queries.createLocation({
      name: `Unverified ${index}`,
      street: `${index} Side St`,
      city: "Dallas",
      state: "TX",
      zip: "75201",
      phone: "",
      notes: "",
      role: "both",
      scheduling_type: "fcfs",
      hours: "",
      scheduling_notes: "",
    });
  }
  lookups = 0;
  const batch = await verifyStore.lookupUnverifiedBatch({ fetchImpl });
  assert.equal(batch.lookedUp, verify.VERIFY_BATCH_LIMIT);
  assert.ok(lookups > 0);
  assert.ok(lookups <= verify.VERIFY_BATCH_LIMIT * 2);
  delete process.env.GOOGLE_MAPS_API_KEY;

  console.log("places pin tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
