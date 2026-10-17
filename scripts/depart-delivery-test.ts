/**
 * A load stays AT DEL after the truck leaves the receiver.
 * Pickup window 10/09. Arrive 10/13 4:30 PM ET, an edge ping at 2.0 miles
 * at 4:39 PM, real exit 10:27 PM. Delivery arrive 10/14 12:10 PM, depart 3:06 PM.
 * Fictional stops only. No live database.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-depart-delivery-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

const PICKUP = { latitude: 31.1498, longitude: -81.4915 };
const DELIVERY = { latitude: 37.2279, longitude: -77.4019 };

const PICKUP_ARRIVE = "2026-10-13T16:30:00-04:00";
const PICKUP_EDGE = "2026-10-13T16:39:00-04:00";
const PICKUP_EXIT = "2026-10-13T22:27:00-04:00";
const DELIVERY_ARRIVE = "2026-10-14T12:10:00-04:00";
const DELIVERY_EXIT = "2026-10-14T15:06:00-04:00";

function northOf(origin: { latitude: number; longitude: number }, miles: number) {
  const dLat = (miles / 3959) * (180 / Math.PI);
  return { latitude: origin.latitude + dLat, longitude: origin.longitude };
}

async function main() {
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const stops = await import("../lib/stops");
  const settings = await import("../lib/settings");
  const { milesBetween, applyGeofenceArrivals, GEOFENCE_MILES, GEOFENCE_DEPART_MILES } = await import(
    "../lib/geofence"
  );
  const { applyWorkflowAfterGeofence, markLeftReceiverDelivered } = await import("../lib/workflow");
  const { parseWorkflowSettings, DEFAULT_WORKFLOW_SETTINGS } = await import("../lib/workflow-shared");
  const { detentionVisitPhrase } = await import("../lib/detention-clock");
  const { listExceptionInbox } = await import("../lib/exceptions");

  assert.equal(GEOFENCE_MILES, 2);
  assert.equal(GEOFENCE_DEPART_MILES, 2.5);
  assert.equal(DEFAULT_WORKFLOW_SETTINGS.departDeliveryAction, "flag");
  assert.equal(parseWorkflowSettings("").departDeliveryAction, "flag");
  assert.equal(parseWorkflowSettings('{"departDeliveryAction":"delivered"}').departDeliveryAction, "delivered");
  assert.equal(parseWorkflowSettings('{"departDeliveryAction":"off"}').departDeliveryAction, "off");
  assert.equal(parseWorkflowSettings('{"departDeliveryAction":"nope"}').departDeliveryAction, "flag");
  assert.equal(
    detentionVisitPhrase({
      role: "receiver",
      arrivedAt: DELIVERY_ARRIVE,
      departedAt: DELIVERY_EXIT,
      timeZone: "America/New_York",
    }),
    "Was at receiver 2h 56m (left 3:06 PM)",
  );
  assert.equal(
    detentionVisitPhrase({
      role: "shipper",
      arrivedAt: PICKUP_ARRIVE,
      departedAt: PICKUP_EXIT,
      timeZone: "America/New_York",
    }),
    "Was at shipper 5h 57m (left 10:27 PM)",
  );

  const workflowUi = fs.readFileSync(path.join(process.cwd(), "components/workflow-engine.tsx"), "utf8");
  assert.match(workflowUi, /name="depart_delivery_action"/);
  assert.match(workflowUi, /Flag the desk: Left receiver, mark delivered/);
  assert.match(workflowUi, /Mark the load delivered/);
  assert.match(workflowUi, /Leave the status as it is/);
  const issueUi = fs.readFileSync(path.join(process.cwd(), "components/exception-issue-line.tsx"), "utf8");
  assert.match(issueUi, /Mark delivered/);
  assert.match(issueUi, /markLeftReceiverDeliveredAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/settings-actions.ts"), "utf8"), /depart_delivery_action/);

  const edge = northOf(PICKUP, 2);
  const edgeMiles = milesBetween(PICKUP, edge);
  assert.ok(Math.abs(edgeMiles - 2) < 0.0001, `edge ping should be 2.0 miles, was ${edgeMiles}`);
  assert.ok(edgeMiles <= GEOFENCE_DEPART_MILES);
  const soft = northOf(PICKUP, 2.2);
  const softMiles = milesBetween(PICKUP, soft);
  assert.ok(softMiles > GEOFENCE_MILES && softMiles <= GEOFENCE_DEPART_MILES, `soft exit ${softMiles}`);
  const hard = northOf(PICKUP, 3);
  assert.ok(milesBetween(PICKUP, hard) > GEOFENCE_DEPART_MILES);

  const db = getDb();
  const customerId = queries.createCustomer({
    name: "Hartwell Produce Co",
    billing_notes: "",
    contacts: [],
  });

  function blankLoad(origin: string, destination: string, commodity: string) {
    return queries.createLoad({
      customer_id: customerId,
      origin,
      destination,
      pickup_start: "2026-10-09T08:00:00-04:00",
      pickup_end: "2026-10-09T17:00:00-04:00",
      delivery_start: "2026-10-14T08:00:00-04:00",
      delivery_end: "2026-10-14T11:00:00-04:00",
      weight: 38000,
      commodity,
      rate: 2400,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: 34,
      trailer_number: "",
      status: "dispatched",
      truck_id: null,
      driver_id: null,
    });
  }

  function place(
    name: string,
    street: string,
    city: string,
    state: string,
    zip: string,
    point: { latitude: number; longitude: number },
    role: "shipper" | "receiver",
  ) {
    return queries.createLocation({
      name,
      street,
      city,
      state,
      zip,
      phone: "",
      notes: "",
      role,
      scheduling_type: "appointment",
      hours: "",
      scheduling_notes: "",
      latitude: point.latitude,
      longitude: point.longitude,
    });
  }

  function backdate(loadId: number) {
    db.prepare("UPDATE loads SET created_at = ? WHERE id = ?").run("2026-10-08T12:00:00.000Z", loadId);
    db.prepare("UPDATE load_audit SET created_at = ? WHERE load_id = ?").run("2026-10-08T12:00:00.000Z", loadId);
  }

  function ping(
    truckId: number,
    point: { latitude: number; longitude: number },
    at: string,
    label: string,
  ) {
    queries.recordTruckGpsReading(truckId, {
      latitude: point.latitude,
      longitude: point.longitude,
      address: label,
      recordedAt: at,
      source: "samsara",
    });
  }

  const pickupId = place(
    "North Wharf Cooler",
    "418 Lantern St",
    "Brunswick",
    "GA",
    "31520",
    PICKUP,
    "shipper",
  );
  const deliveryId = place(
    "Cedar Fork Market",
    "77 Orchard Bend",
    "Petersburg",
    "VA",
    "23803",
    DELIVERY,
    "receiver",
  );
  const truckId = queries.createTruck({
    unit_number: "HV-441",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const driverId = queries.createDriver({
    name: "Marisol Vega",
    phone: "555-0148",
    license: "GA-HV-441",
    pin: "4418",
    truck_id: truckId,
    status: "available",
  });
  const loadId = blankLoad("Brunswick, GA", "Petersburg, VA", "Citrus");
  queries.assignLoad(loadId, truckId, driverId, null, { dispatch: true });
  const pickupStop = stops.addStop(loadId, {
    kind: "pickup",
    name: "North Wharf Cooler",
    street: "418 Lantern St",
    city: "Brunswick",
    state: "GA",
    zip: "31520",
    location_id: pickupId,
    schedule_type: "fcfs",
    window_start: "2026-10-09T08:00:00-04:00",
    window_end: "2026-10-09T17:00:00-04:00",
  });
  const deliveryStop = stops.addStop(loadId, {
    kind: "delivery",
    name: "Cedar Fork Market",
    street: "77 Orchard Bend",
    city: "Petersburg",
    state: "VA",
    zip: "23803",
    location_id: deliveryId,
    schedule_type: "appointment",
    window_start: "2026-10-14T08:00:00-04:00",
    window_end: "2026-10-14T11:00:00-04:00",
  });
  backdate(loadId);

  ping(truckId, PICKUP, PICKUP_ARRIVE, "North Wharf Cooler");
  ping(truckId, edge, PICKUP_EDGE, "Lantern St edge");
  applyGeofenceArrivals(loadId, new Date(PICKUP_EDGE));
  assert.equal(stops.getStop(pickupStop)?.arrived_at, PICKUP_ARRIVE);
  assert.equal(stops.getStop(pickupStop)?.departed_at, "", "a single ping at 2.0 miles is not a depart");
  assert.equal(queries.getLoad(loadId)?.status, "at_pickup");
  const atShipper = listExceptionInbox(new Date("2026-10-13T17:00:00-04:00"));
  assert.ok(
    atShipper.items.some((item) => item.loadId === loadId && item.title === "Late to pickup"),
    "late to pickup while the truck has not left",
  );
  assert.equal(
    atShipper.items.some((item) => item.loadId === loadId && item.title === "Late to delivery"),
    false,
  );

  const stillThere = listExceptionInbox(new Date("2026-10-13T19:30:00-04:00"));
  assert.ok(
    stillThere.items.some(
      (item) => item.loadId === loadId && item.kind === "detention" && /still at shipper/.test(item.title),
    ),
    "still at the shipper before the real exit",
  );

  ping(truckId, northOf(PICKUP, 8), PICKUP_EXIT, "South of Brunswick");
  applyGeofenceArrivals(loadId, new Date(PICKUP_EXIT));
  assert.equal(stops.getStop(pickupStop)?.arrived_at, PICKUP_ARRIVE);
  assert.equal(stops.getStop(pickupStop)?.departed_at, PICKUP_EXIT, "depart is the real exit, not the 4:39 edge");
  assert.equal(queries.getLoad(loadId)?.status, "in_transit");
  const afterPickup = listExceptionInbox(new Date(PICKUP_EXIT));
  assert.equal(
    afterPickup.items.some((item) => item.loadId === loadId && item.title === "Late to pickup"),
    false,
    "late to pickup stops once pickup has departed",
  );
  assert.ok(
    afterPickup.items.some(
      (item) => item.loadId === loadId && item.title === "Was at shipper 5h 57m (left 10:27 PM)",
    ),
  );
  assert.equal(
    afterPickup.items.some((item) => item.loadId === loadId && item.kind === "detention" && /still at/i.test(item.title)),
    false,
  );

  ping(truckId, DELIVERY, DELIVERY_ARRIVE, "Cedar Fork Market");
  applyGeofenceArrivals(loadId, new Date(DELIVERY_ARRIVE));
  assert.equal(stops.getStop(deliveryStop)?.arrived_at, DELIVERY_ARRIVE);
  assert.equal(stops.getStop(deliveryStop)?.departed_at, "");
  assert.equal(queries.getLoad(loadId)?.status, "at_delivery");
  const atReceiver = listExceptionInbox(new Date(DELIVERY_ARRIVE));
  assert.ok(atReceiver.items.some((item) => item.loadId === loadId && item.title === "Late to delivery"));
  assert.equal(
    atReceiver.items.some((item) => item.loadId === loadId && item.title === "Late to pickup"),
    false,
  );

  ping(truckId, northOf(DELIVERY, 8), DELIVERY_EXIT, "North of Petersburg");
  applyGeofenceArrivals(loadId, new Date(DELIVERY_EXIT));
  assert.equal(stops.getStop(deliveryStop)?.departed_at, DELIVERY_EXIT);
  assert.equal(queries.getLoad(loadId)?.status, "at_delivery", "flag mode leaves the load at delivery");
  const left = listExceptionInbox(new Date("2026-10-14T16:00:00-04:00"));
  const leftItem = left.items.find((item) => item.loadId === loadId && item.kind === "left_receiver");
  assert.ok(leftItem);
  assert.equal(leftItem.title, "Left receiver, mark delivered");
  assert.match(leftItem.detail, /Cedar Fork Market/);
  const receiverDetention = left.items.find(
    (item) => item.loadId === loadId && item.kind === "detention" && item.title.startsWith("Was at receiver"),
  );
  assert.equal(receiverDetention?.title, "Was at receiver 2h 56m (left 3:06 PM)");
  assert.equal(
    left.items.some((item) => item.loadId === loadId && item.kind === "detention" && /still at/i.test(item.title)),
    false,
  );

  const deliveredAudits = () =>
    db
      .prepare(
        "SELECT action, field, old_value, new_value FROM load_audit WHERE load_id = ? AND field = 'status' AND new_value = 'delivered'",
      )
      .all(loadId) as Array<{ action: string; field: string; old_value: string; new_value: string }>;
  applyGeofenceArrivals(loadId, new Date("2026-10-14T16:30:00-04:00"));
  assert.equal(queries.getLoad(loadId)?.status, "at_delivery");
  assert.equal(deliveredAudits().length, 0, "flag mode does not write a delivered audit");
  assert.equal(stops.getStop(pickupStop)?.departed_at, PICKUP_EXIT);
  assert.equal(stops.getStop(deliveryStop)?.departed_at, DELIVERY_EXIT);

  assert.equal(markLeftReceiverDelivered(loadId), true);
  assert.equal(queries.getLoad(loadId)?.status, "delivered");
  const clickAudit = deliveredAudits();
  assert.equal(clickAudit.length, 1);
  assert.equal(clickAudit[0].action, "status");
  assert.equal(clickAudit[0].old_value, "at_delivery");
  assert.equal(clickAudit[0].new_value, "delivered");
  applyGeofenceArrivals(loadId, new Date("2026-10-14T17:00:00-04:00"));
  assert.equal(deliveredAudits().length, 1, "a second pass does not write another delivered audit");
  assert.equal(
    listExceptionInbox(new Date("2026-10-14T17:00:00-04:00")).items.some(
      (item) => item.loadId === loadId && item.kind === "left_receiver",
    ),
    false,
  );

  settings.updateWorkflowSettings({
    ...settings.getWorkflowSettings(),
    departDeliveryAction: "delivered",
  });
  const autoTruck = queries.createTruck({
    unit_number: "HV-442",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const autoDriver = queries.createDriver({
    name: "Ellis Harlow",
    phone: "555-0172",
    license: "VA-HV-442",
    pin: "4428",
    truck_id: autoTruck,
    status: "available",
  });
  const autoLoad = blankLoad("Brunswick, GA", "Petersburg, VA", "Greens");
  queries.assignLoad(autoLoad, autoTruck, autoDriver, null, { dispatch: true });
  stops.addStop(autoLoad, {
    kind: "pickup",
    name: "North Wharf Cooler",
    city: "Brunswick",
    state: "GA",
    location_id: pickupId,
    window_start: "2026-10-09T08:00:00-04:00",
    window_end: "2026-10-09T17:00:00-04:00",
    arrived_at: PICKUP_ARRIVE,
    departed_at: PICKUP_EXIT,
  });
  stops.addStop(autoLoad, {
    kind: "delivery",
    name: "Cedar Fork Market",
    city: "Petersburg",
    state: "VA",
    location_id: deliveryId,
    window_start: "2026-10-14T08:00:00-04:00",
    window_end: "2026-10-14T11:00:00-04:00",
    arrived_at: DELIVERY_ARRIVE,
    departed_at: DELIVERY_EXIT,
  });
  assert.equal(queries.getLoad(autoLoad)?.status, "delivered", "stamped stops still run the delivered rule");
  const autoAudit = db
    .prepare(
      "SELECT new_value FROM load_audit WHERE load_id = ? AND field = 'status' AND new_value = 'delivered'",
    )
    .all(autoLoad) as Array<{ new_value: string }>;
  assert.equal(autoAudit.length, 1);

  settings.updateWorkflowSettings({
    ...settings.getWorkflowSettings(),
    departDeliveryAction: "off",
  });
  const offTruck = queries.createTruck({
    unit_number: "HV-443",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const offDriver = queries.createDriver({
    name: "Nia Pell",
    phone: "555-0194",
    license: "GA-HV-443",
    pin: "4438",
    truck_id: offTruck,
    status: "available",
  });
  const offLoad = blankLoad("Brunswick, GA", "Petersburg, VA", "Melons");
  queries.assignLoad(offLoad, offTruck, offDriver, null, { dispatch: true });
  const offPickup = stops.addStop(offLoad, {
    kind: "pickup",
    name: "North Wharf Cooler",
    city: "Brunswick",
    state: "GA",
    location_id: pickupId,
    arrived_at: PICKUP_ARRIVE,
    departed_at: PICKUP_EXIT,
  });
  const offDelivery = stops.addStop(offLoad, {
    kind: "delivery",
    name: "Cedar Fork Market",
    city: "Petersburg",
    state: "VA",
    location_id: deliveryId,
    arrived_at: DELIVERY_ARRIVE,
    departed_at: DELIVERY_EXIT,
  });
  assert.equal(queries.getLoad(offLoad)?.status, "at_delivery");
  applyWorkflowAfterGeofence(offLoad);
  applyGeofenceArrivals(offLoad, new Date("2026-10-14T18:00:00-04:00"));
  assert.equal(queries.getLoad(offLoad)?.status, "at_delivery");
  assert.equal(stops.getStop(offPickup)?.departed_at, PICKUP_EXIT);
  assert.equal(stops.getStop(offDelivery)?.departed_at, DELIVERY_EXIT);
  assert.equal(
    listExceptionInbox(new Date("2026-10-14T18:00:00-04:00")).items.some(
      (item) => item.loadId === offLoad && item.kind === "left_receiver",
    ),
    false,
  );

  settings.updateWorkflowSettings({
    ...settings.getWorkflowSettings(),
    departDeliveryAction: "flag",
  });
  const hystTruck = queries.createTruck({
    unit_number: "HV-444",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const hystDriver = queries.createDriver({
    name: "Owen Brice",
    phone: "555-0166",
    license: "GA-HV-444",
    pin: "4448",
    truck_id: hystTruck,
    status: "available",
  });
  const hystLoad = blankLoad("Brunswick, GA", "Petersburg, VA", "Squash");
  queries.assignLoad(hystLoad, hystTruck, hystDriver, null, { dispatch: true });
  const hystStop = stops.addStop(hystLoad, {
    kind: "pickup",
    name: "North Wharf Cooler",
    city: "Brunswick",
    state: "GA",
    location_id: pickupId,
    window_start: "2026-10-09T08:00:00-04:00",
    window_end: "2026-10-09T17:00:00-04:00",
  });
  backdate(hystLoad);
  const softA = "2026-10-13T18:00:00-04:00";
  const softB = "2026-10-13T18:05:00-04:00";
  ping(hystTruck, PICKUP, PICKUP_ARRIVE, "North Wharf Cooler");
  ping(hystTruck, soft, softA, "Just outside");
  applyGeofenceArrivals(hystLoad, new Date(softA));
  assert.equal(stops.getStop(hystStop)?.arrived_at, PICKUP_ARRIVE);
  assert.equal(stops.getStop(hystStop)?.departed_at, "", "one ping between 2 and 2.5 miles is not a depart");
  ping(hystTruck, soft, softB, "Still just outside");
  applyGeofenceArrivals(hystLoad, new Date(softB));
  assert.equal(stops.getStop(hystStop)?.departed_at, softB, "two consecutive pings outside the 2-mile fence depart");

  const liveTruck = queries.createTruck({
    unit_number: "HV-445",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const liveDriver = queries.createDriver({
    name: "Priya Solano",
    phone: "555-0133",
    license: "GA-HV-445",
    pin: "4458",
    truck_id: liveTruck,
    status: "available",
  });
  const liveLoad = blankLoad("Brunswick, GA", "Petersburg, VA", "Berries");
  queries.assignLoad(liveLoad, liveTruck, liveDriver, null, { dispatch: true });
  const liveStop = stops.addStop(liveLoad, {
    kind: "pickup",
    name: "North Wharf Cooler",
    city: "Brunswick",
    state: "GA",
    location_id: pickupId,
    window_start: "2026-10-09T08:00:00-04:00",
    window_end: "2026-10-09T17:00:00-04:00",
  });
  backdate(liveLoad);
  const live = (point: { latitude: number; longitude: number }, at: string) => {
    queries.saveTruckGps(liveTruck, {
      latitude: point.latitude,
      longitude: point.longitude,
      address: "Brunswick, GA",
      recordedAt: at,
      source: "samsara",
    });
  };
  live(PICKUP, PICKUP_ARRIVE);
  live(soft, softA);
  assert.equal(stops.getStop(liveStop)?.departed_at, "");
  live(soft, softB);
  assert.equal(stops.getStop(liveStop)?.departed_at, softB, "live pings count the previous outside position");

  const hardTruck = queries.createTruck({
    unit_number: "HV-446",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const hardDriver = queries.createDriver({
    name: "Theo March",
    phone: "555-0181",
    license: "GA-HV-446",
    pin: "4468",
    truck_id: hardTruck,
    status: "available",
  });
  const hardLoad = blankLoad("Brunswick, GA", "Petersburg, VA", "Pears");
  queries.assignLoad(hardLoad, hardTruck, hardDriver, null, { dispatch: true });
  const hardStop = stops.addStop(hardLoad, {
    kind: "pickup",
    name: "North Wharf Cooler",
    city: "Brunswick",
    state: "GA",
    location_id: pickupId,
    window_start: "2026-10-09T08:00:00-04:00",
    window_end: "2026-10-09T17:00:00-04:00",
  });
  backdate(hardLoad);
  const hardAt = "2026-10-13T21:00:00-04:00";
  ping(hardTruck, PICKUP, PICKUP_ARRIVE, "North Wharf Cooler");
  ping(hardTruck, hard, hardAt, "Well outside");
  applyGeofenceArrivals(hardLoad, new Date(hardAt));
  assert.equal(stops.getStop(hardStop)?.departed_at, hardAt, "one ping beyond 2.5 miles is a depart");

  closeDb();
  console.log("depart delivery ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
