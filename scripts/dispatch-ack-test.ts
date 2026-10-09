/**
 * Driver "Got it" acknowledgement and the desk no-ack flag.
 * The snapshot check proves historical loads are not flooded into the inbox.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-dispatch-ack-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

const HOUR = 3_600_000;

function hoursFromNow(hours: number): { start: string; end: string } {
  const start = new Date(Date.now() + hours * HOUR);
  const end = new Date(start.getTime() + 2 * HOUR);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function main(): Promise<void> {
  const queries = await import("../lib/queries");
  const ack = await import("../lib/dispatch-ack");
  const settings = await import("../lib/settings");
  const exceptions = await import("../lib/exceptions");
  const audit = await import("../lib/audit");
  const timeline = await import("../lib/load-timeline");
  const { closeDb } = await import("../lib/db");

  assert.equal(settings.getDispatchAckHours(), 12);
  assert.ok(settings.getDispatchAckIntroducedAt(), "feature introduction is stamped on first open");
  assert.throws(() => settings.updateDispatchAckHours(0), /between 1 and 168/);
  assert.throws(() => settings.updateDispatchAckHours(200), /between 1 and 168/);
  assert.equal(settings.updateDispatchAckHours(12), 12);

  const source = fs.readFileSync(path.join(process.cwd(), "lib/dispatch-ack.ts"), "utf8");
  assert.doesNotMatch(source, /twilio|whatsapp|nodemailer|sendMail|sendSms/i);
  const actionSource = fs.readFileSync(path.join(process.cwd(), "lib/driver-actions.ts"), "utf8");
  assert.match(actionSource, /export async function driverAcknowledgeDispatchAction[\s\S]*requireDriver\(/);
  const alertsSource = fs.readFileSync(path.join(process.cwd(), "lib/settings-actions.ts"), "utf8");
  assert.match(alertsSource, /export async function saveAlertsAction[\s\S]*requireSettingsEditor\(/);

  const customerId = queries.createCustomer({
    name: "Ack Foods",
    billing_notes: "",
    contacts: [],
  });
  const truckA = queries.createTruck({
    unit_number: "ACK-1",
    type: "sleeper",
    capacity_lbs: 45000,
    status: "available",
    registration_expires: "2030-01-01",
    dot_expires: "2030-01-01",
  });
  const truckB = queries.createTruck({
    unit_number: "ACK-2",
    type: "sleeper",
    capacity_lbs: 45000,
    status: "available",
    registration_expires: "2030-01-01",
    dot_expires: "2030-01-01",
  });
  const driverA = queries.createDriver({
    name: "Ada Ack",
    phone: "402-555-0101",
    license: "NE-1",
    license_expires: "2030-01-01",
    medical_expires: "2030-01-01",
    truck_id: truckA,
    status: "available",
  });
  const driverB = queries.createDriver({
    name: "Ben Ack",
    phone: "402-555-0102",
    license: "NE-2",
    license_expires: "2030-01-01",
    medical_expires: "2030-01-01",
    truck_id: truckB,
    status: "available",
  });

  function makeLoad(number: string, pickupHours: number, origin = "Omaha, NE"): number {
    const pickup = hoursFromNow(pickupHours);
    const delivery = hoursFromNow(pickupHours + 24);
    return queries.createLoad({
      load_number: number,
      customer_id: customerId,
      origin,
      destination: "Denver, CO",
      pickup_start: pickup.start,
      pickup_end: pickup.end,
      delivery_start: delivery.start,
      delivery_end: delivery.end,
      weight: 1000,
      commodity: "Beef",
      rate: 100,
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
  }

  const soonId = makeLoad("ACK-SOON", 6);
  queries.assignLoad(soonId, truckA, driverA, null, { dispatch: true });
  let soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(soon.status, "dispatched");
  assert.equal(ack.driverShouldAcknowledge(soon, driverA), true);
  assert.equal(ack.driverShouldAcknowledge(soon, driverB), false);
  assert.equal(ack.presentDispatchAck(soon).state, "waiting");
  assert.equal(ack.presentDispatchAck(soon).flagged, true);

  const outsideId = makeLoad("ACK-LATER", 30);
  queries.assignLoad(outsideId, truckB, driverB, null, { dispatch: true });
  const outside = queries.getLoad(outsideId);
  assert.ok(outside);
  assert.equal(ack.presentDispatchAck(outside).state, "waiting");
  assert.equal(ack.presentDispatchAck(outside).flagged, false, "outside the 12 hour window stays quiet");

  const bareId = makeLoad("ACK-BARE", 4);
  const bare = queries.getLoad(bareId);
  assert.ok(bare);
  assert.equal(ack.presentDispatchAck(bare).state, "none");
  assert.equal(ack.shouldFlagMissingDispatchAck(bare, ack.dispatchAckRules()), false);

  const flagged = exceptions.listExceptionInbox().items.filter((item) => item.kind === "dispatch_ack");
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0]?.loadNumber, "ACK-SOON");
  assert.equal(flagged[0]?.severity, "MEDIUM");
  assert.match(flagged[0]?.detail ?? "", /no text or email/i);

  audit.runWithAuditActor({ name: "Ada Ack", kind: "driver" }, () => {
    ack.acknowledgeDispatch(soonId, { id: driverA, name: "Ada Ack" });
  });
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(ack.presentDispatchAck(soon).state, "acknowledged");
  assert.equal(ack.presentDispatchAck(soon).flagged, false);
  assert.equal(ack.presentDispatchAck(soon).needsButton, false);
  assert.match(ack.presentDispatchAck(soon).clock, /\d:\d{2}\s[AP]M/);
  assert.equal(soon.dispatch_ack_by, "Ada Ack");
  assert.equal(soon.dispatch_ack_driver_id, driverA);
  const ackRows = audit.listLoadAudit(soonId).filter((row) => row.action === "dispatch_ack");
  assert.equal(ackRows.length, 1);
  assert.equal(ackRows[0]?.actor, "Ada Ack");
  assert.equal(ackRows[0]?.actor_kind, "driver");
  assert.match(
    timeline.listLoadTimeline(soonId).map((row) => row.title).join(" "),
    /Acknowledged dispatch/,
  );
  audit.runWithAuditActor({ name: "Ada Ack", kind: "driver" }, () => {
    ack.acknowledgeDispatch(soonId, { id: driverA, name: "Ada Ack" });
  });
  assert.equal(audit.listLoadAudit(soonId).filter((row) => row.action === "dispatch_ack").length, 1);

  queries.updateLoad(soonId, {
    customer_id: soon.customer_id,
    origin: "Lincoln, NE",
    destination: soon.destination,
    pickup_start: soon.pickup_start,
    pickup_end: soon.pickup_end,
    delivery_start: soon.delivery_start,
    delivery_end: soon.delivery_end,
    weight: soon.weight,
    commodity: soon.commodity,
    rate: soon.rate,
    notes: soon.notes,
    special_instructions: soon.special_instructions,
    appointment_notes: soon.appointment_notes,
    reference_number: soon.reference_number,
    po_number: soon.po_number,
    reefer_setpoint_f: soon.reefer_setpoint_f,
    trailer_number: soon.trailer_number,
    status: soon.status,
    truck_id: soon.truck_id,
    driver_id: soon.driver_id,
    shipper_location_id: soon.shipper_location_id,
  });
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(soon.origin, "Lincoln, NE");
  assert.equal(ack.presentDispatchAck(soon).state, "waiting", "new pickup place asks for Got it again");
  assert.equal(ack.presentDispatchAck(soon).flagged, true);
  assert.equal(soon.dispatch_ack_at.length > 0, true, "the previous stamp stays on the row");

  const moved = hoursFromNow(5);
  queries.updateLoad(soonId, {
    customer_id: soon.customer_id,
    origin: soon.origin,
    destination: soon.destination,
    pickup_start: moved.start,
    pickup_end: moved.end,
    delivery_start: soon.delivery_start,
    delivery_end: soon.delivery_end,
    weight: soon.weight,
    commodity: soon.commodity,
    rate: soon.rate,
    notes: soon.notes,
    special_instructions: soon.special_instructions,
    appointment_notes: soon.appointment_notes,
    reference_number: soon.reference_number,
    po_number: soon.po_number,
    reefer_setpoint_f: soon.reefer_setpoint_f,
    trailer_number: soon.trailer_number,
    status: soon.status,
    truck_id: soon.truck_id,
    driver_id: soon.driver_id,
  });
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(ack.isDispatchAcknowledged(soon), false, "new pickup time clears the ack");

  audit.runWithAuditActor({ name: "Ada Ack", kind: "driver" }, () => {
    ack.acknowledgeDispatch(soonId, { id: driverA, name: "Ada Ack" });
  });
  queries.assignLoad(soonId, truckB, driverB, null, { dispatch: true });
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(soon.driver_id, driverB);
  assert.equal(ack.driverShouldAcknowledge(soon, driverB), true);
  assert.equal(ack.isDispatchAcknowledged(soon), false);

  queries.updateLoadStatus(soonId, "picked_up");
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(ack.shouldFlagMissingDispatchAck(soon, ack.dispatchAckRules()), false);
  queries.updateLoadStatus(soonId, "completed");
  soon = queries.getLoad(soonId);
  assert.ok(soon);
  assert.equal(ack.presentDispatchAck(soon).state, "none");
  assert.equal(
    exceptions.listExceptionInbox().items.some((item) => item.kind === "dispatch_ack" && item.loadId === soonId),
    false,
  );

  const grandfatherId = makeLoad("ACK-OLD", 6, "Grand Island, NE");
  queries.assignLoad(grandfatherId, truckA, driverA, null, { dispatch: true });
  const beforeFeature = new Date(Date.now() + 48 * HOUR).toISOString();
  settings.setDispatchAckIntroducedAt(beforeFeature);
  const grandfather = queries.getLoad(grandfatherId);
  assert.ok(grandfather);
  assert.equal(
    ack.shouldFlagMissingDispatchAck(grandfather, ack.dispatchAckRules()),
    false,
    "pickup already in the past relative to first run is not flagged",
  );
  settings.setDispatchAckIntroducedAt(new Date(Date.now() - HOUR).toISOString());
  assert.equal(ack.shouldFlagMissingDispatchAck(queries.getLoad(grandfatherId)!, ack.dispatchAckRules()), true);

  const pastId = makeLoad("ACK-PAST", -20);
  queries.assignLoad(pastId, truckA, driverA, null, { dispatch: true });
  const past = queries.getLoad(pastId);
  assert.ok(past);
  assert.equal(ack.shouldFlagMissingDispatchAck(past, ack.dispatchAckRules()), false);

  await proveSnapshot(closeDb);
  console.log("dispatch-ack tests passed");
}

async function proveSnapshot(closeDb: () => void): Promise<void> {
  const sourceDb = findSnapshotDb();
  if (!sourceDb) {
    console.log("SKIP: live snapshot not found");
    return;
  }
  const copy = path.join(os.tmpdir(), `tms-ack-snapshot-${Date.now()}.db`);
  fs.copyFileSync(sourceDb, copy);
  closeDb();
  process.env.TMS_DB_PATH = copy;
  process.env.TMS_SKIP_SEED = "1";
  const exceptions = await import("../lib/exceptions");
  const settings = await import("../lib/settings");
  const queries = await import("../lib/queries");
  const introduced = new Date(settings.getDispatchAckIntroducedAt()).getTime();
  assert.ok(Number.isFinite(introduced));
  const loads = queries.listLoads({ status: "all" });
  const flagged = exceptions.listExceptionInbox().items.filter((item) => item.kind === "dispatch_ack");
  const historicalIds = new Set(
    loads
      .filter((load) => {
        const pickup = new Date(load.pickup_start).getTime();
        return Number.isFinite(pickup) && pickup <= introduced;
      })
      .map((load) => load.id),
  );
  const historicalFlagged = flagged.filter((item) => historicalIds.has(item.loadId));
  console.log(
    `snapshot dispatch_ack flags: ${flagged.length}; historical flagged: ${historicalFlagged.length} of ${loads.length} loads`,
  );
  assert.equal(loads.length, 272);
  assert.equal(historicalFlagged.length, 0);
  assert.equal(flagged.length, 0);
}

function findSnapshotDb(): string | null {
  const fromEnv = process.env.TMS_SNAPSHOT_DB?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const loose = "/tmp/tms-snap/tms.db";
  if (fs.existsSync(loose)) return loose;
  const zips = [
    "/home/ubuntu/.cursor/projects/workspace/uploads/tms-db_3285.zip",
    path.join(process.cwd(), "uploads/tms-db.zip"),
  ];
  for (const zip of zips) {
    if (!fs.existsSync(zip)) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tms-ack-zip-"));
    execSync(`unzip -o -q ${JSON.stringify(zip)} -d ${JSON.stringify(dir)}`);
    const db = path.join(dir, "tms.db");
    if (fs.existsSync(db)) return db;
  }
  return null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
