import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-relay-map-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const pickup = "2026-04-01T12:00:00.000Z";
const pickupEnd = "2026-04-01T14:00:00.000Z";
const delivery = "2026-04-03T12:00:00.000Z";
const deliveryEnd = "2026-04-03T16:00:00.000Z";

async function main() {
  const mapShared = await import("../lib/load-map-shared");
  const relayMap = await import("../lib/relay-map");
  const queries = await import("../lib/queries");
  const loadStops = await import("../lib/stops");
  const relayStore = await import("../lib/relay-store");
  const mapLib = await import("../lib/load-map");
  const routing = await import("../lib/routing");
  const { getDb } = await import("../lib/db");

  const ordered = mapShared.orderLaneAnchors([
    { kind: "pickup", id: "p1" },
    { kind: "pickup", id: "p2" },
    { kind: "delivery", id: "d1" },
    { kind: "delivery", id: "d2" },
    { kind: "relay", id: "r1" },
    { kind: "relay", id: "r2" },
    { kind: "truck", id: "t" },
  ]);
  assert.deepEqual(
    ordered.map((point) => point.id),
    ["p1", "p2", "r1", "r2", "d1", "d2"],
    "P1 P2 then relays then D1 D2; truck stays off the line",
  );

  const mixed = mapShared.orderLaneAnchors([
    { kind: "pickup", id: "p1" },
    { kind: "delivery", id: "d1" },
    { kind: "pickup", id: "p2" },
    { kind: "delivery", id: "d2" },
    { kind: "relay", id: "r1" },
  ]);
  assert.deepEqual(
    mixed.map((point) => point.id),
    ["p1", "r1", "d1", "p2", "d2"],
    "relay sits before the first delivery and later stops keep their sequence",
  );

  assert.equal(relayMap.relayHandoffPlace({ pickup: "Dallas, TX", delivery: "Oklahoma City, OK" }), "Oklahoma City, OK");
  assert.equal(relayMap.relayHandoffPlace({ pickup: "Dallas, TX", delivery: "  " }), "Dallas, TX");
  assert.equal(relayMap.relayAccessibleLabel(1, "Chicago, IL"), "Relay 1 — Chicago, IL");
  assert.equal(relayMap.relayMarkerText(2), "R2");
  assert.equal(relayMap.resolveRelayCoordinate("   "), null);
  assert.equal(relayMap.resolveRelayCoordinate("Nonesuch Depot ZZ"), null);

  const chicago = relayMap.resolveRelayCoordinate("Chicago, IL");
  assert.ok(chicago);
  assert.equal(chicago.lat, 41.8781);

  const yard = relayMap.resolveRelayCoordinate("Cold Storage 9", [
    { name: "Cold Storage 9", city: "Tiny", state: "NE", lat: 41.11, lng: -96.22 },
  ]);
  assert.equal(yard?.lat, 41.11);
  assert.equal(yard?.lng, -96.22);

  let geocodeCalls = 0;
  const known = await relayMap.buildRelayMapPoints(
    [{ id: 1, sequence: 1, pickup: "Dallas, TX", delivery: "Chicago, IL" }],
    [],
    async () => {
      geocodeCalls += 1;
      return { latitude: 1, longitude: 2 };
    },
  );
  assert.equal(geocodeCalls, 0, "a city already in the local table must not geocode");
  assert.equal(known[0]?.markerText, "R1");
  assert.equal(known[0]?.label, "Relay 1 — Chicago, IL");
  assert.equal(known[0]?.pinShape, "diamond");
  assert.equal(known[0]?.pinColor, mapShared.LOAD_MAP_MARKER_COLOR.relay);
  assert.notEqual(known[0]?.pinColor, mapShared.LOAD_MAP_MARKER_COLOR.pickup);
  assert.notEqual(known[0]?.pinColor, mapShared.LOAD_MAP_MARKER_COLOR.delivery);

  const partial = await relayMap.buildRelayMapPoints(
    [
      { id: 8, sequence: 1, pickup: "", delivery: "Nonesuch Depot ZZ" },
      { id: 9, sequence: 2, pickup: "Nonesuch Depot ZZ", delivery: "Indianapolis, IN" },
    ],
    [],
    async (address) => {
      assert.match(address, /Nonesuch/);
      return null;
    },
  );
  assert.equal(partial.length, 1);
  assert.equal(partial[0]?.markerText, "R2");
  assert.equal(partial[0]?.label, "Relay 2 — Indianapolis, IN");
  assert.equal(partial[0]?.id, "relay-9");

  const geocoded = await relayMap.buildRelayMapPoints(
    [{ id: 3, sequence: 1, pickup: "", delivery: "900 Unknown Spur, ZZ" }],
    [],
    async () => ({ latitude: 40.5, longitude: -95.5 }),
  );
  assert.equal(geocoded[0]?.lat, 40.5);
  assert.equal(geocoded[0]?.lng, -95.5);

  const fitLane = [
    { kind: "pickup", lat: 32.7767, lng: -96.797 },
    { kind: "pickup", lat: 29.7604, lng: -95.3698 },
    { kind: "relay", lat: 35.4676, lng: -97.5164 },
    { kind: "relay", lat: 39.0997, lng: -94.5786 },
    { kind: "delivery", lat: 41.8781, lng: -87.6298 },
    { kind: "delivery", lat: 39.7684, lng: -86.1581 },
    { kind: "truck", lat: 40, lng: -90 },
  ];
  const anchors = mapShared.lanePinsForFit(fitLane);
  assert.equal(anchors.length, 6, "fit list keeps every pickup, relay, and delivery");
  assert.equal(anchors.some((point) => point.kind === "truck"), false);
  const bounds = mapShared.latLngBounds(anchors);
  assert.ok(bounds);
  assert.equal(bounds.minLat, 29.7604, "southern pickup stays inside the fit");
  assert.equal(bounds.maxLat, 41.8781, "northern delivery stays inside the fit");
  assert.equal(bounds.minLng, -97.5164, "western relay expands the fit past the pickups");
  assert.equal(bounds.maxLng, -86.1581, "eastern delivery stays inside the fit");
  const frame = mapShared.laneSketchFrame(anchors, 24, 0.25);
  const projected = anchors.map((point) => ({ x: frame.x(point.lng), y: frame.y(point.lat) }));
  for (const point of projected) {
    assert.ok(point.x >= 24 && point.x <= 76, `sketch x ${point.x} must sit in the padded viewBox`);
    assert.ok(point.y >= 24 && point.y <= 76, `sketch y ${point.y} must sit in the padded viewBox`);
  }
  const relayWest = projected[2];
  assert.ok(relayWest);
  assert.equal(relayWest.x, Math.min(...projected.map((point) => point.x)));
  assert.ok(projected[0].x > relayWest.x, "Dallas stays east of the Oklahoma City relay");
  assert.ok(projected[4].x > projected[0].x, "Chicago stays east of Dallas");

  const diamond = mapShared.loadMapPinSvg({ kind: "relay", pinShape: "diamond", pinColor: "#5b21b6" });
  assert.match(diamond, /L20\.4 13\.2/);
  assert.doesNotMatch(diamond, /C6\.2/);
  const teardrop = mapShared.loadMapPinSvg({ kind: "pickup" });
  assert.match(teardrop, /C6\.2/);
  assert.doesNotMatch(teardrop, /L20\.4 13\.2/);

  const customerId = queries.createCustomer({ name: "Relay Map Co", billing_notes: "", contacts: [] });
  const place = (
    name: string,
    city: string,
    state: string,
    lat: number,
    lng: number,
    role: "shipper" | "receiver",
  ) =>
    queries.createLocation({
      name,
      street: "1 Main",
      city,
      state,
      zip: "00000",
      phone: "",
      notes: "",
      role,
      scheduling_type: "fcfs",
      hours: "",
      scheduling_notes: "",
      latitude: lat,
      longitude: lng,
    });

  const dallas = place("Dallas Dock", "Dallas", "TX", 32.7767, -96.797, "shipper");
  const houston = place("Houston Dock", "Houston", "TX", 29.7604, -95.3698, "shipper");
  const chicagoLoc = place("Chicago Dock", "Chicago", "IL", 41.8781, -87.6298, "receiver");
  const indy = place("Indy Dock", "Indianapolis", "IN", 39.7684, -86.1581, "receiver");
  const loadId = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Chicago, IL",
    pickup_start: pickup,
    pickup_end: pickupEnd,
    delivery_start: delivery,
    delivery_end: deliveryEnd,
    weight: 1000,
    commodity: "Relay map",
    rate: 500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: dallas,
    consignee_location_id: chicagoLoc,
    status: "available",
    truck_id: null,
    driver_id: null,
    contact_name: "Pat Broker",
    contact_phone: "",
  });
  loadStops.addStop(loadId, { kind: "pickup", name: "Dallas Dock", city: "Dallas", state: "TX", location_id: dallas });
  loadStops.addStop(loadId, { kind: "pickup", name: "Houston Dock", city: "Houston", state: "TX", location_id: houston });
  loadStops.addStop(loadId, { kind: "delivery", name: "Chicago Dock", city: "Chicago", state: "IL", location_id: chicagoLoc });
  loadStops.addStop(loadId, { kind: "delivery", name: "Indy Dock", city: "Indianapolis", state: "IN", location_id: indy });
  relayStore.addRelay(loadId, { delivery: "Oklahoma City, OK" });
  relayStore.addRelay(loadId, { delivery: "Kansas City, MO" });

  const model = await mapLib.buildStopsMapModel(loadId);
  const lane = model.points.filter((point) => point.kind === "pickup" || point.kind === "relay" || point.kind === "delivery");
  const orderedLane = mapShared.orderLaneAnchors(lane);
  assert.deepEqual(
    orderedLane.map((point) => point.markerText),
    ["P1", "P2", "R1", "R2", "D1", "D2"],
  );
  assert.equal(orderedLane[2]?.label, "Relay 1 — Oklahoma City, OK");
  assert.equal(orderedLane[3]?.label, "Relay 2 — Kansas City, MO");
  assert.equal(orderedLane[2]?.lat, 35.4676);
  assert.equal(orderedLane[3]?.lat, 39.0997);
  assert.deepEqual(
    model.path.map((point) => point.lat),
    orderedLane.map((point) => point.lat),
    "route line follows P1 P2 R1 R2 D1 D2",
  );

  const framing = mapShared.workbenchCardMapFraming(model.points);
  assert.ok(framing.fitPoints.some((point) => point.lat === 35.4676));
  assert.ok(framing.fitPoints.some((point) => point.lat === 39.0997));

  const fake = Array.from({ length: 24 }, (_, index) => ({ lat: 1 + index * 0.01, lng: 1 }));
  getDb()
    .prepare(
      `UPDATE loads
       SET route_miles = 800, route_source = 'google', route_polyline = ?, route_leg_miles = ?, route_calculated_at = ?
       WHERE id = ?`,
    )
    .run(routing.encodePolyline(fake), "[200,200,200,200]", new Date().toISOString(), loadId);
  const withCache = await mapLib.buildStopsMapModel(loadId);
  assert.ok(withCache.path.some((point) => point.lat === 35.4676), "cached stop polyline must not skip the relay");
  assert.ok(withCache.path.every((point) => point.lat > 20), "relay line uses the lane, not the stored detour");

  const omaha = place("Omaha Dock", "Omaha", "NE", 41.2565, -95.9345, "shipper");
  const missId = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Dallas, TX",
    pickup_start: pickup,
    pickup_end: pickupEnd,
    delivery_start: delivery,
    delivery_end: deliveryEnd,
    weight: 1000,
    commodity: "Missing relay",
    rate: 400,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: omaha,
    consignee_location_id: dallas,
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(missId, { kind: "pickup", name: "Omaha Dock", city: "Omaha", state: "NE", location_id: omaha });
  loadStops.addStop(missId, { kind: "delivery", name: "Dallas Dock", city: "Dallas", state: "TX", location_id: dallas });
  relayStore.addRelay(missId, { delivery: "Nonesuch Depot ZZ" });
  const missed = await mapLib.buildStopsMapModel(missId);
  assert.equal(missed.points.some((point) => point.kind === "relay"), false);
  assert.ok(missed.points.some((point) => point.kind === "pickup" && point.markerText === "P1"));
  assert.ok(missed.points.some((point) => point.kind === "delivery" && point.markerText === "D1"));
  assert.equal(missed.path.length, 0, "no relay pin and no official polyline means the detail map keeps its existing empty path");

  const yardId = place("Cold Storage 9", "Tiny", "NE", 41.11, -96.22, "shipper");
  const yardLoad = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Dallas, TX",
    pickup_start: pickup,
    pickup_end: pickupEnd,
    delivery_start: delivery,
    delivery_end: deliveryEnd,
    weight: 1000,
    commodity: "Yard relay",
    rate: 400,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(yardLoad, { kind: "pickup", name: "Omaha Dock", city: "Omaha", state: "NE", location_id: omaha });
  loadStops.addStop(yardLoad, { kind: "delivery", name: "Dallas Dock", city: "Dallas", state: "TX", location_id: dallas });
  relayStore.addRelay(yardLoad, { delivery: "Cold Storage 9" });
  const yardModel = await mapLib.buildStopsMapModel(yardLoad);
  const yardPin = yardModel.points.find((point) => point.kind === "relay");
  assert.equal(yardPin?.lat, 41.11);
  assert.equal(yardPin?.lng, -96.22);
  assert.equal(yardPin?.label, "Relay 1 — Cold Storage 9");
  assert.equal(yardId > 0, true);

  console.log("relay map tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
