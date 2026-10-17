/**
 * Driver trailer change: warnings, save, audit sentence, custody, office note.
 * Scratch database. Fictional people and places only.
 */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-driver-trailer-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.SESSION_SECRET = "driver-trailer-change-test-secret";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.TMS_SCRIPT_DRIVER_ID;

const NOW = "2026-10-15T16:00:00.000Z";
const LIVE = "2026-10-15T15:50:00.000Z";
const STALE = "2026-10-15T10:00:00.000Z";
const PICKUP = "2026-10-15T12:00:00.000Z";
const PICKUP_END = "2026-10-15T14:00:00.000Z";
const DELIVERY = "2026-10-16T12:00:00.000Z";
const DELIVERY_END = "2026-10-16T16:00:00.000Z";

const OTHER_LOAD = "TR-4402 is on an in-progress load for another driver (load MSE-8802).";
const FAR_GPS = "TR-4402's latest GPS is far from your truck.";
const NOT_ASSIGNED = "Dispatch assigned TR-1108. This is TR-4402.";
const SENTENCE = "Driver changed trailer from TR-1108 to TR-4402";

function gps(source: string, latitude: number, longitude: number, recordedAt: string) {
  return { latitude, longitude, recordedAt, source };
}

async function withCookies<T>(cookieHeader: string, fn: () => Promise<T>): Promise<T> {
  const { RequestCookies } = await import("next/dist/server/web/spec-extension/cookies.js");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external.js");
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const jar = new RequestCookies(headers);
  const unit = {
    type: "request" as const,
    phase: "action" as const,
    cookies: jar,
    mutableCookies: jar,
    userspaceMutableCookies: jar,
  };
  return workAsyncStorage.run({ route: "/", incrementalCache: {} }, () => workUnitAsyncStorage.run(unit, fn));
}

async function main(): Promise<void> {
  if (!("AsyncLocalStorage" in globalThis)) {
    Object.assign(globalThis, { AsyncLocalStorage });
  }

  const change = await import("../lib/driver-trailer-change");
  const plainFacts = {
    asOf: NOW,
    quietHours: 2,
    farMiles: 25,
    assignedUnit: "TR-1108",
    suggestedUnit: "TR-1108",
    suggestionSource: "current" as const,
    latestUnit: "TR-2204",
    truck: gps("samsara", 41.25, -95.93, LIVE),
    trailers: [
      {
        id: 11,
        unitNumber: "TR-1108",
        gps: gps("orbcomm", 41.26, -95.94, LIVE),
        otherLoadNumber: "",
      },
      {
        id: 44,
        unitNumber: "TR-4402",
        gps: gps("orbcomm", 40.5, -96.8, LIVE),
        otherLoadNumber: "MSE-8802",
      },
    ],
  };
  assert.deepEqual(change.driverTrailerWarnings({ facts: plainFacts, trailerId: 11, customNumber: "" }), []);
  assert.deepEqual(change.driverTrailerWarnings({ facts: plainFacts, trailerId: 44, customNumber: "" }), [
    OTHER_LOAD,
    FAR_GPS,
    NOT_ASSIGNED,
  ]);
  assert.deepEqual(change.driverTrailerWarnings({ facts: plainFacts, trailerId: null, customNumber: "tr-4402" }), [
    OTHER_LOAD,
    FAR_GPS,
    NOT_ASSIGNED,
  ]);
  assert.deepEqual(change.driverTrailerWarnings({ facts: plainFacts, trailerId: 11, customNumber: "YARD-9" }), [
    "Dispatch assigned TR-1108. This is YARD-9.",
  ]);
  const stale = {
    ...plainFacts,
    trailers: plainFacts.trailers.map((trailer) =>
      trailer.id === 44 ? { ...trailer, gps: gps("orbcomm", 40.5, -96.8, STALE), otherLoadNumber: "" } : trailer,
    ),
  };
  assert.deepEqual(change.driverTrailerWarnings({ facts: stale, trailerId: 44, customNumber: "" }), [NOT_ASSIGNED]);
  const wrongSource = {
    ...plainFacts,
    trailers: plainFacts.trailers.map((trailer) =>
      trailer.id === 44 ? { ...trailer, gps: gps("demo", 40.5, -96.8, LIVE), otherLoadNumber: "" } : trailer,
    ),
  };
  assert.deepEqual(change.driverTrailerWarnings({ facts: wrongSource, trailerId: 44, customNumber: "" }), [NOT_ASSIGNED]);
  const close = {
    ...plainFacts,
    trailers: plainFacts.trailers.map((trailer) =>
      trailer.id === 44 ? { ...trailer, gps: gps("orbcomm", 41.27, -95.94, LIVE), otherLoadNumber: "" } : trailer,
    ),
  };
  const closeMiles = change.trailerTruckSeparationMiles(close.truck, close.trailers[1].gps, new Date(NOW), 2);
  assert.ok(closeMiles != null && closeMiles < 25, `close miles ${closeMiles}`);
  assert.deepEqual(change.driverTrailerWarnings({ facts: close, trailerId: 44, customNumber: "" }), [NOT_ASSIGNED]);
  const farMiles = change.trailerTruckSeparationMiles(plainFacts.truck, plainFacts.trailers[1].gps, new Date(NOW), 2);
  assert.ok(farMiles != null && farMiles >= 25, `far miles ${farMiles}`);
  assert.equal(change.suggestDriverTrailer({ currentUnit: "TR-1108", latestUnit: "TR-2204" }).source, "current");
  assert.deepEqual(change.suggestDriverTrailer({ currentUnit: "", latestUnit: "TR-2204" }), {
    unit: "TR-2204",
    source: "latest",
  });
  assert.equal(change.driverTrailerChangeSentence("", "TR-2204"), "Driver changed trailer from none to TR-2204");
  assert.equal(change.trailerOnOtherLoadWarning("TR-4402", ""), "TR-4402 is on an in-progress load for another driver.");
  assert.doesNotMatch(OTHER_LOAD, /Ellis|Mara|driver id|trailer id/i);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-trailer-change.tsx"), "utf8"), /driverTrailerWarnings/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8"), /Change trailer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /data-driver-trailer-flag/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8"), /data-desk-trailer-flags/);
  const dbSource = fs.readFileSync(path.join(process.cwd(), "lib/driver-trailer-change-db.ts"), "utf8");
  assert.doesNotMatch(dbSource, /settlement|load-swap|relay-pay|nodemailer|sendMail|sendSms|twilio|whatsapp/i);
  const pureSource = fs.readFileSync(path.join(process.cwd(), "lib/driver-trailer-change.ts"), "utf8");
  assert.doesNotMatch(pureSource, /settlement|nodemailer|sendMail|sendSms|twilio/i);

  const { getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const store = await import("../lib/driver-trailer-change-db");
  const custody = await import("../lib/trailer-custody");
  const audit = await import("../lib/audit");
  const timeline = await import("../lib/load-timeline");
  const sessionToken = await import("../lib/session-token");
  const driverSession = await import("../lib/driver-session");
  const driverActions = await import("../lib/driver-actions");

  const customerId = queries.createCustomer({
    name: "Northwind Produce",
    billing_notes: "",
    contacts: [],
  });
  const truckId = queries.createTruck({
    unit_number: "28",
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
  });
  const otherTruckId = queries.createTruck({
    unit_number: "41",
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
  });
  const assignedId = queries.createTrailer({ unit_number: "TR-1108", type: "reefer", status: "available" });
  const farId = queries.createTrailer({ unit_number: "TR-4402", type: "reefer", status: "available" });
  const latestId = queries.createTrailer({ unit_number: "TR-2204", type: "reefer", status: "available" });
  const parkedId = queries.createTrailer({
    unit_number: "TR-7700",
    type: "reefer",
    status: "out_of_service",
    active: 0,
  });
  const maraId = queries.createDriver({
    name: "Mara Quinn",
    phone: "555-0148",
    email: "mara.quinn@example.com",
    license: "NE-CDL-MARA",
    password: "Testpass1!",
    truck_id: truckId,
    status: "available",
  });
  const ellisId = queries.createDriver({
    name: "Ellis Ward",
    phone: "555-0162",
    email: "ellis.ward@example.com",
    license: "NE-CDL-ELLIS",
    truck_id: otherTruckId,
    status: "available",
  });

  function loadInput(extra: Record<string, unknown> = {}) {
    return {
      customer_id: customerId,
      origin: "Rivermark, NE",
      destination: "Elm Crossing, IA",
      pickup_start: PICKUP,
      pickup_end: PICKUP_END,
      delivery_start: DELIVERY,
      delivery_end: DELIVERY_END,
      weight: 28000,
      commodity: "Apples",
      rate: 1800,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: 34,
      trailer_number: "",
      status: "in_transit",
      truck_id: truckId,
      driver_id: maraId,
      oo_percent: 70,
      oo_pay: 420,
      ...extra,
    };
  }

  const priorId = queries.createLoad({
    ...loadInput(),
    load_number: "MSE-8800",
    status: "delivered",
    trailer_id: latestId,
    trailer_number: "TR-2204",
  });
  const loadId = queries.createLoad({
    ...loadInput(),
    load_number: "MSE-8801",
    trailer_id: assignedId,
    trailer_number: "TR-1108",
  });
  const otherLoadId = queries.createLoad({
    ...loadInput(),
    load_number: "MSE-8802",
    truck_id: otherTruckId,
    driver_id: ellisId,
    trailer_id: farId,
    trailer_number: "TR-4402",
    oo_pay: 300,
  });

  getDb()
    .prepare(
      `UPDATE trucks SET gps_latitude = ?, gps_longitude = ?, gps_address = ?, gps_recorded_at = ?, gps_source = ? WHERE id = ?`,
    )
    .run(41.25, -95.93, "100 North Dock Street, Rivermark, NE", LIVE, "samsara", truckId);
  getDb()
    .prepare(
      `UPDATE trailers SET gps_latitude = ?, gps_longitude = ?, gps_address = ?, gps_recorded_at = ?, gps_source = ? WHERE id = ?`,
    )
    .run(41.26, -95.94, "100 North Dock Street, Rivermark, NE", LIVE, "orbcomm", assignedId);
  getDb()
    .prepare(
      `UPDATE trailers SET gps_latitude = ?, gps_longitude = ?, gps_address = ?, gps_recorded_at = ?, gps_source = ? WHERE id = ?`,
    )
    .run(40.5, -96.8, "500 South Yard Road, Elm Crossing, IA", LIVE, "orbcomm", farId);

  const facts = store.loadDriverTrailerChangeFacts({ driverId: maraId, loadId, asOf: NOW });
  assert.equal(facts.assignedUnit, "TR-1108");
  assert.equal(facts.suggestionSource, "current");
  assert.equal(facts.latestUnit, "TR-2204");
  assert.equal(facts.trailers.some((trailer) => trailer.id === parkedId), false);
  assert.deepEqual(change.driverTrailerWarnings({ facts, trailerId: farId, customNumber: "" }), [
    OTHER_LOAD,
    FAR_GPS,
    NOT_ASSIGNED,
  ]);
  assert.deepEqual(change.initialTrailerSelection(facts), { trailerId: assignedId, customNumber: "" });

  const emptyId = queries.createLoad({
    ...loadInput(),
    load_number: "MSE-8803",
    trailer_id: null,
    trailer_number: "",
  });
  const emptyFacts = store.loadDriverTrailerChangeFacts({ driverId: maraId, loadId: emptyId, asOf: NOW });
  assert.equal(emptyFacts.suggestionSource, "latest");
  assert.equal(emptyFacts.suggestedUnit, "TR-1108");
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/driver-trailer-change.tsx"), "utf8"),
    /Suggested from your latest load/,
  );

  const smsBefore = (
    getDb().prepare("SELECT COUNT(*) AS count FROM load_audit WHERE action = 'sms'").get() as { count: number }
  ).count;
  const before = queries.getLoad(loadId);
  assert.equal(before?.oo_pay, 420);
  const auditBefore = audit.listLoadAudit(loadId).length;
  assert.equal(store.driverChangeLoadTrailer({ driverId: maraId, loadId, trailerId: assignedId, customNumber: "" }).changed, false);
  assert.equal(audit.listLoadAudit(loadId).length, auditBefore);

  audit.runWithAuditActor({ name: "Mara Quinn", kind: "driver" }, () => {
    const saved = store.driverChangeLoadTrailer({
      driverId: maraId,
      loadId,
      trailerId: farId,
      customNumber: "",
    });
    assert.equal(saved.changed, true);
  });

  const after = queries.getLoad(loadId);
  assert.equal(after?.trailer_id, farId);
  assert.equal(after?.trailer_number, "TR-4402");
  assert.equal(after?.driver_trailer_note, SENTENCE);
  assert.equal(after?.oo_pay, 420);
  assert.equal(after?.rate, 1800);
  assert.equal(after?.driver_id, maraId);
  assert.equal(after?.truck_id, truckId);
  assert.equal(after?.status, "in_transit");
  assert.equal(queries.getDriver(maraId)?.last_trailer_id, farId);
  assert.equal(queries.getLoad(otherLoadId)?.trailer_id, farId);
  assert.equal(queries.getLoad(otherLoadId)?.oo_pay, 300);

  const log = audit.listLoadLog(loadId);
  assert.ok(log.some((row) => row.action === "driver_trailer" && row.old_value === "TR-1108" && row.new_value === "TR-4402"));
  assert.equal(log.find((row) => row.action === "driver_trailer")?.actor_kind, "driver");
  const events = timeline.listLoadTimeline(loadId);
  assert.ok(events.some((row) => row.title === "Driver changed trailer" && row.detail === SENTENCE));
  const smsAfter = (
    getDb().prepare("SELECT COUNT(*) AS count FROM load_audit WHERE action = 'sms'").get() as { count: number }
  ).count;
  assert.equal(smsAfter, smsBefore);

  const closedOld = custody.listTrailerCustody(assignedId).some((row) => row.to_at && row.load_number === "MSE-8801");
  assert.equal(closedOld, true);
  const opened = custody
    .listTrailerCustody(farId)
    .some((row) => row.to_at == null && row.load_number === "MSE-8801" && row.driver_id === maraId && row.source === "load_assign");
  assert.equal(opened, true);

  assert.throws(
    () => store.driverChangeLoadTrailer({ driverId: ellisId, loadId, trailerId: latestId, customNumber: "" }),
    /not assigned to you/,
  );
  assert.throws(
    () => store.driverChangeLoadTrailer({ driverId: maraId, loadId: priorId, trailerId: latestId, customNumber: "" }),
    /closed/,
  );
  assert.throws(
    () => store.driverChangeLoadTrailer({ driverId: maraId, loadId, trailerId: null, customNumber: "@@" }),
    /letters and numbers/,
  );

  const cookie = `${driverSession.DRIVER_SESSION_COOKIE}=${sessionToken.createSignedSessionToken({
    id: maraId,
    issuedAt: Date.now(),
    typ: driverSession.DRIVER_SESSION_TYP,
  })}`;
  const form = new FormData();
  form.set("load_id", String(loadId));
  form.set("trailer_id", "");
  form.set("custom_number", "YARD-9");
  let redirected = false;
  try {
    const result = await withCookies(cookie, () => driverActions.driverChangeTrailerAction(null, form));
    assert.equal(result.ok, true, result.ok ? "" : result.error);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    redirected = digest.includes("NEXT_REDIRECT");
    if (!redirected) throw error;
  }
  assert.equal(redirected, true);
  const customSaved = queries.getLoad(loadId);
  assert.equal(customSaved?.trailer_id, null);
  assert.equal(customSaved?.trailer_number, "YARD-9");
  assert.equal(customSaved?.driver_trailer_note, "Driver changed trailer from TR-4402 to YARD-9");
  assert.equal(customSaved?.oo_pay, 420);
  const yardOpen = custody.listTrailerCustody(farId).some((row) => row.to_at == null && row.load_number === "MSE-8801");
  assert.equal(yardOpen, false);
  const smsFinal = (
    getDb().prepare("SELECT COUNT(*) AS count FROM load_audit WHERE action = 'sms'").get() as { count: number }
  ).count;
  assert.equal(smsFinal, smsBefore);

  console.log("driver trailer change ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
