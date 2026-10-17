import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-pod-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

const pickup = "2026-04-01T12:00:00.000Z";
const pickupEnd = "2026-04-01T14:00:00.000Z";
const delivery = "2026-04-02T12:00:00.000Z";
const deliveryEnd = "2026-04-02T16:00:00.000Z";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function main() {
  const shared = await import("../lib/pod-delivery-shared");
  const ready = await import("../lib/invoice-ready");

  assert.equal(shared.missingPodAlert({ customer_name: "M & S Loads LLC." }, false).show, true);
  assert.equal(shared.missingPodAlert({ customer_name: "M & S Loads LLC." }, false).severity, "HIGH");
  assert.equal(shared.missingPodAlert({ customer_name: "M & S Loads LLC." }, false).title, "Missing POD");
  assert.equal(shared.missingPodAlert({ customer_name: "Anyone" }, true).show, false);
  assert.equal(
    shared.missingPodAlert({ customer_name: "Yard", pod_outcome: "reason", pod_reason: "receiver_kept" }, false).show,
    false,
  );
  assert.equal(
    shared.missingPodAlert({ customer_name: "Yard", pod_outcome: "reason", pod_reason: "sent_to_customer" }, false).show,
    false,
  );
  const later = shared.missingPodAlert(
    { customer_name: "Yard", pod_outcome: "reason", pod_reason: "upload_later" },
    false,
  );
  assert.equal(later.show, true);
  assert.equal(later.severity, "LOW");
  assert.equal(later.title, "POD later");
  const other = shared.missingPodAlert(
    { customer_name: "Yard", pod_outcome: "reason", pod_reason: "other", pod_reason_note: "Left at the guard shack" },
    false,
  );
  assert.equal(other.severity, "LOW");
  assert.match(other.detail, /guard shack/);

  const pass = ready.buildInvoiceReadyChecklist({
    hasPod: true,
    hasBol: true,
    hasLumperReceipt: false,
    podOutcome: "photo",
    podReason: "",
    podNote: "",
    lumperLine: false,
    detentionLine: false,
    detentionClock: false,
    invoiceAmount: 1800,
    rateConAmount: 1800,
  });
  assert.equal(pass.items.every((item) => item.status === "pass"), true);
  assert.equal(pass.items.length, 5);

  const warn = ready.buildInvoiceReadyChecklist({
    hasPod: false,
    hasBol: false,
    hasLumperReceipt: false,
    podOutcome: "",
    podReason: "",
    podNote: "",
    lumperLine: true,
    detentionLine: true,
    detentionClock: false,
    invoiceAmount: 2000,
    rateConAmount: 1800,
  });
  assert.deepEqual(
    warn.items.map((item) => item.status),
    ["warn", "warn", "warn", "warn", "warn"],
  );
  assert.match(warn.items.find((item) => item.id === "rate")?.detail ?? "", /2,000/);
  const reasonPass = ready.buildInvoiceReadyChecklist({
    hasPod: false,
    hasBol: true,
    hasLumperReceipt: true,
    podOutcome: "reason",
    podReason: "receiver_kept",
    podNote: "",
    lumperLine: true,
    detentionLine: true,
    detentionClock: true,
    invoiceAmount: 900,
    rateConAmount: 900,
  });
  assert.equal(reasonPass.items.find((item) => item.id === "pod")?.status, "pass");
  assert.match(reasonPass.items.find((item) => item.id === "pod")?.detail ?? "", /Receiver kept/);

  const noRate = ready.buildInvoiceReadyChecklist({
    hasPod: true,
    hasBol: true,
    hasLumperReceipt: false,
    podOutcome: "",
    podReason: "",
    podNote: "",
    lumperLine: false,
    detentionLine: false,
    detentionClock: false,
    invoiceAmount: 500,
    rateConAmount: null,
  });
  assert.equal(noRate.items.find((item) => item.id === "rate")?.status, "warn");

  for (const rel of [
    "lib/db.ts",
    "lib/types.ts",
    "lib/pod-delivery.ts",
    "lib/pod-delivery-shared.ts",
    "lib/exceptions.ts",
    "lib/invoice-ready.ts",
    "lib/dispatcher-actions.ts",
    "components/driver-load-actions.tsx",
    "components/invoice-ready-checklist.tsx",
  ]) {
    assert.equal(read(rel).includes("brokerage"), false, rel);
  }
  assert.match(read("components/driver-load-actions.tsx"), /data-pod-delivery-sheet/);
  assert.match(read("components/driver-load-actions.tsx"), /Delivered/);
  assert.match(read("components/invoice-ready-checklist.tsx"), /Invoice ready\?/);
  assert.match(read("components/invoice-ready-checklist.tsx"), /Send stays available/);
  assert.match(read("components/send-to-accounting.tsx"), /InvoiceReadyChecklist/);
  assert.match(read("components/email-invoice-button.tsx"), /InvoiceReadyChecklist/);
  assert.doesNotMatch(read("components/send-to-accounting.tsx"), /checklist\.items/);

  const { getDb } = await import("../lib/db");
  const columns = getDb().prepare("PRAGMA table_info(loads)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  assert.equal(names.has("brokerage_load"), false);
  for (const name of ["pod_outcome", "pod_reason", "pod_reason_note", "pod_recorded_at", "rate_con_amount"]) {
    assert.equal(names.has(name), true, name);
  }

  const queries = await import("../lib/queries");
  const ops = await import("../lib/driver-ops");
  const stopsApi = await import("../lib/stops");
  const pay = await import("../lib/pay-items");
  const files = await import("../lib/files");
  const pod = await import("../lib/pod-delivery");
  const { listLoadTimeline } = await import("../lib/load-timeline");
  const { listExceptionInbox } = await import("../lib/exceptions");

  const customerId = queries.createCustomer({ name: "POD Yard", billing_notes: "", contacts: [] });
  const truckId = queries.createTruck({
    unit_number: "POD-1",
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
  });
  const driverId = queries.createDriver({
    name: "Pat Driver",
    phone: "402-555-0100",
    license: "D123",
    truck_id: truckId,
    status: "on_duty",
  });
  const driver = queries.getDriver(driverId);
  assert.ok(driver);

  function makeLoad(number: string, rate: number) {
    return queries.createLoad({
      load_number: number,
      customer_id: customerId,
      origin: "Avenel, NJ",
      destination: "Hastings, NE",
      pickup_start: pickup,
      pickup_end: pickupEnd,
      delivery_start: delivery,
      delivery_end: deliveryEnd,
      weight: 40000,
      commodity: "Beef",
      rate,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      reefer_mode: "",
      trailer_number: "",
      status: "assigned",
      truck_id: truckId,
      driver_id: driverId,
    });
  }

  function deliver(loadId: number, podInput: { outcome: "photo" | "reason"; reason: shared.PodDeliveryReason | ""; note: string }) {
    const stops = stopsApi.ensureDefaultStops(loadId);
    const pickupStop = stops.find((stop) => stop.kind === "pickup");
    const deliveryStop = stops.find((stop) => stop.kind === "delivery");
    assert.ok(pickupStop && deliveryStop);
    ops.performDriverStopCheck({ driver: driver!, loadId, stopId: pickupStop.id, kind: "arrive" });
    ops.performDriverStopCheck({ driver: driver!, loadId, stopId: pickupStop.id, kind: "depart" });
    ops.performDriverStopCheck({ driver: driver!, loadId, stopId: deliveryStop.id, kind: "arrive" });
    ops.performDriverStopCheck({
      driver: driver!,
      loadId,
      stopId: deliveryStop.id,
      kind: "depart",
      pod: podInput.outcome === "photo" ? { outcome: "photo", reason: "", note: "" } : podInput,
    });
  }

  const keptId = makeLoad("POD-KEPT", 1500);
  deliver(keptId, { outcome: "reason", reason: "receiver_kept", note: "" });
  const kept = queries.getLoad(keptId);
  assert.equal(kept?.status, "delivered");
  assert.equal(kept?.pod_outcome, "reason");
  assert.equal(kept?.pod_reason, "receiver_kept");
  const keptLog = listLoadTimeline(keptId);
  assert.ok(keptLog.some((row) => row.title === "POD at delivery" && /Receiver kept/.test(row.detail)));
  assert.equal(
    listExceptionInbox().items.some((item) => item.loadId === keptId && item.kind === "missing_pod"),
    false,
  );

  const laterId = makeLoad("POD-LATER", 1600);
  deliver(laterId, { outcome: "reason", reason: "upload_later", note: "" });
  const laterRow = listExceptionInbox().items.find((item) => item.loadId === laterId && item.kind === "missing_pod");
  assert.equal(laterRow?.severity, "LOW");
  assert.equal(laterRow?.title, "POD later");

  const bareId = makeLoad("POD-BARE", 1700);
  queries.updateDriverProgress(bareId, driverId, "delivered");
  const bareRow = listExceptionInbox().items.find((item) => item.loadId === bareId && item.kind === "missing_pod");
  assert.equal(bareRow?.severity, "HIGH");
  assert.equal(bareRow?.title, "Missing POD");

  const photoId = makeLoad("POD-PHOTO", 1800);
  pod.captureRateConAmount(photoId, 1800);
  files.addAttachment({
    loadId: photoId,
    kind: "pod",
    originalName: "pod.pdf",
    buffer: Buffer.from("%PDF-1.1"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  pod.recordPodDelivery(photoId, { outcome: "photo", reason: "", note: "" });
  files.addAttachment({
    loadId: photoId,
    kind: "bol",
    originalName: "bol.pdf",
    buffer: Buffer.from("%PDF-1.1"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  queries.updateDriverProgress(photoId, driverId, "delivered");
  assert.equal(queries.getLoad(photoId)?.pod_outcome, "photo");
  assert.equal(
    listExceptionInbox().items.some((item) => item.loadId === photoId && item.kind === "missing_pod"),
    false,
  );
  const photoReady = ready.invoiceReadyForLoad(queries.getLoad(photoId)!);
  assert.equal(photoReady.items.find((item) => item.id === "pod")?.status, "pass");
  assert.equal(photoReady.items.find((item) => item.id === "bol")?.status, "pass");
  assert.equal(photoReady.items.find((item) => item.id === "rate")?.status, "pass");

  pay.addPayItem(photoId, {
    side: "income",
    bill_to: "customer",
    payee: "",
    category: "flat_rate",
    rate: 2200,
    qty: 1,
    total: 2200,
    notes: "",
  });
  assert.equal(queries.getLoad(photoId)?.rate_con_amount, 1800);
  assert.equal(ready.invoiceReadyForLoad(queries.getLoad(photoId)!).items.find((item) => item.id === "rate")?.status, "warn");

  pay.addPayItem(photoId, {
    side: "income",
    bill_to: "customer",
    payee: "",
    category: "lumper",
    rate: 80,
    qty: 1,
    total: 80,
    notes: "",
  });
  assert.equal(ready.invoiceReadyForLoad(queries.getLoad(photoId)!).items.find((item) => item.id === "lumper")?.status, "warn");
  files.addAttachment({
    loadId: photoId,
    kind: "lumper",
    originalName: "lumper.pdf",
    buffer: Buffer.from("%PDF-1.1"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  assert.equal(ready.invoiceReadyForLoad(queries.getLoad(photoId)!).items.find((item) => item.id === "lumper")?.status, "pass");

  pay.addPayItem(photoId, {
    side: "income",
    bill_to: "customer",
    payee: "",
    category: "detention",
    rate: 50,
    qty: 1,
    total: 50,
    notes: "",
  });
  assert.equal(
    ready.invoiceReadyForLoad(queries.getLoad(photoId)!).items.find((item) => item.id === "detention")?.status,
    "warn",
  );
  const deliveryStop = stopsApi.ensureDefaultStops(photoId).find((stop) => stop.kind === "delivery");
  assert.ok(deliveryStop);
  stopsApi.stampStopTime(deliveryStop.id, "arrived_at", "2026-04-02T12:00:00.000Z");
  stopsApi.stampStopTime(deliveryStop.id, "departed_at", "2026-04-02T16:30:00.000Z");
  assert.equal(
    ready.invoiceReadyForLoad(queries.getLoad(photoId)!).items.find((item) => item.id === "detention")?.status,
    "pass",
  );

  console.log("pod delivery tests passed");
}

main()
  .then(() => {
    fs.rmSync(dbPath, { force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
