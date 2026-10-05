import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-driver-api-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.TRUSTED_PROXY = "1";

const FIXTURE = path.join(process.cwd(), "scripts/fixtures/driver-api/pod.png");
const BASE = "http://localhost:3000/api/driver/v1";
const DRIVER_PASSWORD = "Driver1$ab";

function loginPayload(email: string, password = DRIVER_PASSWORD) {
  return JSON.stringify({ email, password });
}

function loadInput(
  customerId: number,
  extra: Partial<{
    load_number: string;
    origin: string;
    destination: string;
    status: string;
    driver_id: number | null;
    trailer_id: number | null;
    rate: number | null;
    oo_pay: number | null;
    reference_number: string;
  }> = {},
) {
  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(8, 0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(12, 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(16, 0, 0, 0);
  return {
    customer_id: customerId,
    origin: extra.origin ?? "Jackson, MS",
    destination: extra.destination ?? "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 32000,
    commodity: "Paper rolls",
    rate: extra.rate ?? 1400,
    notes: "Driver API test",
    special_instructions: "Call receiver.",
    appointment_notes: "Dock 2",
    reference_number: extra.reference_number ?? "RC-SECRET",
    po_number: "PO-DRIVER-API",
    reefer_setpoint_f: null,
    trailer_number: "TR-1",
    status: extra.status ?? "assigned",
    truck_id: null,
    driver_id: extra.driver_id ?? null,
    trailer_id: extra.trailer_id ?? null,
    load_number: extra.load_number,
    oo_pay: extra.oo_pay ?? 350,
  };
}

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function read(res: Response): Promise<{ status: number; json: unknown; headers: Headers }> {
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json, headers: res.headers };
}

const API_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATETIME_KEYS = new Set([
  "expires_at",
  "pickup_start",
  "pickup_end",
  "delivery_start",
  "delivery_end",
  "window_start",
  "window_end",
  "arrived_at",
  "departed_at",
  "created_at",
  "occurred_at",
  "recorded_at",
]);

function assertApiDateTimes(value: unknown, trail = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertApiDateTimes(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (DATETIME_KEYS.has(key) && typeof item === "string" && item.trim()) {
      assert.match(item, API_DATETIME, `${trail}.${key} must be ISO-8601 with timezone`);
    }
    assertApiDateTimes(item, `${trail}.${key}`);
  }
}

function assertNoSecrets(value: unknown, trail = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    assert.notEqual(key, "rate", `leaked ${trail}.${key}`);
    assert.notEqual(key, "oo_pay", `leaked ${trail}.${key}`);
    assert.notEqual(key, "oo_percent", `leaked ${trail}.${key}`);
    assert.notEqual(key, "qbo_invoice_number", `leaked ${trail}.${key}`);
    assert.notEqual(key, "tms_invoice_number", `leaked ${trail}.${key}`);
    assert.notEqual(key, "reference_number", `leaked ${trail}.${key}`);
    assert.notEqual(key, "customer_reference", `leaked ${trail}.${key}`);
    assert.notEqual(key, "pin", `leaked ${trail}.${key}`);
    assertNoSecrets(record[key], `${trail}.${key}`);
  }
}

async function main() {
  assert.equal(fs.existsSync(FIXTURE), true, "POD fixture");
  const queries = await import("../lib/queries");
  const { addRelay } = await import("../lib/relay-store");
  const rosterRoute = await import("../app/api/driver/v1/auth/roster/route");
  const loginRoute = await import("../app/api/driver/v1/auth/login/route");
  const logoutRoute = await import("../app/api/driver/v1/auth/logout/route");
  const meRoute = await import("../app/api/driver/v1/me/route");
  const loadsRoute = await import("../app/api/driver/v1/loads/route");
  const loadRoute = await import("../app/api/driver/v1/loads/[id]/route");
  const trailerRoute = await import("../app/api/driver/v1/loads/[id]/trailer/route");
  const progressRoute = await import("../app/api/driver/v1/loads/[id]/progress/route");
  const checkRoute = await import("../app/api/driver/v1/loads/[id]/stops/[stopId]/check/route");
  const attachRoute = await import("../app/api/driver/v1/loads/[id]/attachments/route");
  const assistRoute = await import("../app/api/driver/v1/assist/route");
  const assistDocRoute = await import("../app/api/driver/v1/assist/docs/[fleetDocumentId]/route");
  const { formatDateTime } = await import("../lib/format");

  const customerId = queries.createCustomer({
    name: "Driver API Shipper",
    billing_notes: "",
    contacts: [],
  });
  const driverA = queries.createDriver({
    name: "Alex Rivera",
    phone: "555-0101",
    email: "alex.rivera@msloads.test",
    license: "TN-CDL-A",
    pin: "4321",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  const driverB = queries.createDriver({
    name: "Blake Soto",
    phone: "555-0102",
    email: "blake.soto@msloads.test",
    license: "TN-CDL-B",
    pin: "2222",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  const driverC = queries.createDriver({
    name: "Casey Relay",
    phone: "555-0103",
    email: "casey.relay@msloads.test",
    license: "TN-CDL-C",
    pin: "3333",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  queries.createDriver({
    name: "Limit Test",
    phone: "555-0199",
    email: "limit.test@msloads.test",
    license: "TN-CDL-L",
    pin: "9999",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  const assistDriverA = queries.createDriver({
    name: "Assist Driver A",
    phone: "555-0601",
    email: "assist.a@msloads.test",
    license: "TN-CDL-AA",
    pin: "6601",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  const assistDriverB = queries.createDriver({
    name: "Assist Driver B",
    phone: "555-0602",
    email: "assist.b@msloads.test",
    license: "TN-CDL-AB",
    pin: "6602",
    password: DRIVER_PASSWORD,
    truck_id: null,
    status: "available",
  });
  const assistTruckA = queries.createTruck({
    unit_number: "8601",
    type: "sleeper",
    capacity_lbs: 50000,
    status: "available",
  });
  const assistTruckB = queries.createTruck({
    unit_number: "8602",
    type: "sleeper",
    capacity_lbs: 50000,
    status: "available",
  });
  const assistTrailerA = queries.createTrailer({
    unit_number: "MSA8601",
    type: "reefer",
  });
  const assistTrailerB = queries.createTrailer({
    unit_number: "MSA8602",
    type: "reefer",
  });
  queries.assignDriverToTruck(assistTruckA, assistDriverA);
  queries.assignDriverToTruck(assistTruckB, assistDriverB);

  const blankHoursLocationId = queries.createLocation({
    name: "No Hours Pickup",
    street: "100 Empty Hours Rd",
    city: "Jackson",
    state: "MS",
    zip: "39201",
    phone: "555-0800",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
  });
  const normalHoursLocationId = queries.createLocation({
    name: "Open Hours Delivery",
    street: "200 Working Dock Ave",
    city: "Birmingham",
    state: "AL",
    zip: "35203",
    phone: "555-0801",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "Mon-Fri 07:00-17:00",
    scheduling_notes: "",
  });
  const assistPickupHeader = "2026-11-01T08:00:00.000Z";
  const assistPickupWindowStart = "2026-11-01T14:30:00.000Z";
  const assistLoadA = queries.createLoad({
    ...loadInput(customerId, {
      load_number: "MSE-API-AI-1",
      driver_id: assistDriverA,
      status: "dispatched",
      origin: "Jackson, MS",
      destination: "Birmingham, AL",
    }),
    truck_id: assistTruckA,
    trailer_id: assistTrailerA,
    trailer_number: "MSA8601",
    shipper_location_id: blankHoursLocationId,
    consignee_location_id: normalHoursLocationId,
    pickup_start: assistPickupHeader,
    pickup_end: "2026-11-01T10:00:00.000Z",
    delivery_start: "2026-11-02T09:00:00.000Z",
    delivery_end: "2026-11-02T12:00:00.000Z",
  });
  const assistLoadB = queries.createLoad({
    ...loadInput(customerId, {
      load_number: "MSE-API-AI-2",
      driver_id: assistDriverB,
      status: "dispatched",
      origin: "Memphis, TN",
      destination: "Atlanta, GA",
    }),
    truck_id: assistTruckB,
    trailer_id: assistTrailerB,
    trailer_number: "MSA8602",
  });
  const { ensureDefaultStops } = await import("../lib/stops");
  const assistStops = ensureDefaultStops(assistLoadA);
  const assistPickupStop = assistStops.find((stop) => stop.kind === "pickup");
  assert.ok(assistPickupStop, "assist pickup stop");
  const assistDb = (await import("../lib/db")).getDb();
  assistDb
    .prepare("UPDATE load_stops SET window_start = ?, schedule_type = 'appointment', confirmation = ? WHERE id = ?")
    .run(assistPickupWindowStart, "APPT-4451", assistPickupStop!.id);
  assistDb
    .prepare("UPDATE loads SET truck_id = ?, trailer_id = ? WHERE id = ?")
    .run(assistTruckB, assistTrailerB, assistLoadB);

  const { addFleetDocument } = await import("../lib/files");
  const fixtureBytes = fs.readFileSync(FIXTURE);
  const assistDocA = addFleetDocument({
    ownerType: "truck",
    ownerId: assistTruckA,
    kind: "registration",
    originalName: "assist-a-registration.png",
    buffer: fixtureBytes,
    mimeType: "image/png",
  });
  const assistDocB = addFleetDocument({
    ownerType: "truck",
    ownerId: assistTruckB,
    kind: "registration",
    originalName: "assist-b-registration.png",
    buffer: fixtureBytes,
    mimeType: "image/png",
  });

  const { hasDriverPassword } = await import("../lib/driver-password");
  const fleetSaveId = queries.createDriver({
    name: "Fleet Save Repro",
    phone: "555-0744",
    license: "MS-CDL-SAVE",
    truck_id: null,
    status: "available",
    city: "",
    state: "",
  });
  assert.equal(queries.getDriver(fleetSaveId)?.email, "");
  assert.equal(hasDriverPassword(fleetSaveId), false);
  assert.throws(
    () =>
      queries.updateDriver(fleetSaveId, {
        name: "Fleet Save Repro",
        phone: "555-0744",
        email: "apple.dev.live@msloads.test",
        license: "MS-CDL-SAVE",
        password: "short",
        truck_id: null,
        status: "available",
      }),
    /8 characters|uppercase|symbol/i,
  );
  assert.equal(queries.getDriver(fleetSaveId)?.email, "", "invalid password must not persist email");
  assert.equal(hasDriverPassword(fleetSaveId), false);

  queries.updateDriver(fleetSaveId, {
    name: "Fleet Save Repro",
    phone: "555-0744",
    email: "apple.dev.live@msloads.test",
    license: "MS-CDL-SAVE",
    password: "Demo1234!",
    truck_id: null,
    status: "available",
    city: "",
    state: "",
  });
  assert.equal(queries.getDriver(fleetSaveId)?.email, "apple.dev.live@msloads.test");
  assert.equal(hasDriverPassword(fleetSaveId), true, "updateDriver must persist password_hash with email");
  assert.equal(queries.authenticateDriverByEmail("apple.dev.live@msloads.test", "Demo1234!").id, fleetSaveId);

  queries.updateDriver(fleetSaveId, {
    name: "Fleet Save Repro",
    phone: "555-0744",
    email: "",
    license: "MS-CDL-SAVE",
    password: "Demo5678!",
    truck_id: null,
    status: "available",
  });
  assert.equal(queries.getDriver(fleetSaveId)?.email, "apple.dev.live@msloads.test");
  assert.equal(queries.authenticateDriverByEmail("apple.dev.live@msloads.test", "Demo5678!").id, fleetSaveId);

  const activeId = queries.createLoad(
    loadInput(customerId, { load_number: "MSE-API-1", driver_id: driverA, status: "assigned" }),
  );
  const otherId = queries.createLoad(
    loadInput(customerId, {
      load_number: "MSE-API-2",
      driver_id: driverB,
      status: "assigned",
      origin: "Memphis, TN",
      destination: "Atlanta, GA",
    }),
  );
  const recentId = queries.createLoad(
    loadInput(customerId, { load_number: "MSE-API-3", driver_id: driverA, status: "delivered" }),
  );
  const relayId = queries.createLoad(
    loadInput(customerId, {
      load_number: "MSE-API-4",
      driver_id: driverA,
      status: "in_transit",
      origin: "Nashville, TN",
      destination: "Louisville, KY",
    }),
  );
  addRelay(relayId, {
    pickup: "Nashville, TN",
    delivery: "Bowling Green, KY",
    from_driver_id: driverA,
    driver_id: driverC,
  });

  const roster = await read(await rosterRoute.GET(request(`${BASE}/auth/roster`)));
  assert.equal(roster.status, 404);
  const rosterBody = roster.json as { ok: false; error: string; code?: string };
  assert.equal(rosterBody.ok, false);
  assert.equal(rosterBody.code, "NOT_FOUND");
  assert.equal(JSON.stringify(roster.json).includes("Alex Rivera"), false, "roster does not list drivers");

  const pinLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver_id: driverA, pin: "4321" }),
      }),
    ),
  );
  assert.equal(pinLogin.status, 409);
  assert.equal((pinLogin.json as { code?: string }).code, "CONFLICT");

  const namePinLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name_or_email: "Alex Rivera", pin: "4321" }),
      }),
    ),
  );
  assert.equal(namePinLogin.status, 409);

  const badLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("alex.rivera@msloads.test", "Wrong1$ab"),
      }),
    ),
  );
  assert.equal(badLogin.status, 401);
  const badBody = badLogin.json as { ok: false; error: string; code?: string };
  assert.equal(badBody.ok, false);
  assert.equal(badBody.code, "UNAUTHORIZED");
  assert.match(badBody.error, /Driver or password is not recognized/);

  const unknownEmail = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("nobody@msloads.test", DRIVER_PASSWORD),
      }),
    ),
  );
  assert.equal(unknownEmail.status, 401);
  assert.equal((unknownEmail.json as { error?: string }).error, badBody.error);

  const dbMod = await import("../lib/db");
  const fixture = await import("../lib/driver-login-fixture");
  assert.equal(fixture.appleDevDriverFixtureEnabled(), false);
  const fixtureBefore = dbMod
    .getDb()
    .prepare("SELECT id FROM drivers WHERE LOWER(TRIM(email)) = ?")
    .get(fixture.APPLE_DEV_DRIVER_EMAIL) as { id: number } | undefined;
  assert.equal(fixtureBefore, undefined, "getDb() must not seed demo.driver without APPLE_DEV_DRIVER_FIXTURE");
  fixture.ensureAppleDevDriverLogin(dbMod.getDb(), { force: true });
  const appleDevLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload(fixture.APPLE_DEV_DRIVER_EMAIL, fixture.APPLE_DEV_DRIVER_PASSWORD),
      }),
    ),
  );
  assert.equal(appleDevLogin.status, 200, `Apple Dev fixture ${JSON.stringify(appleDevLogin.json)}`);
  assert.match((appleDevLogin.json as { token: string }).token, /^drv_/);
  assert.equal((appleDevLogin.json as { driver: { display_name: string } }).driver.display_name, "Demo Driver");

  const goodLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("alex.rivera@msloads.test"),
      }),
    ),
  );
  assert.equal(goodLogin.status, 200, `login ${JSON.stringify(goodLogin.json)}`);
  assert.equal(goodLogin.headers.get("set-cookie"), null, "no office/driver cookies");
  const session = goodLogin.json as {
    token: string;
    expires_at: string;
    driver: { id: number; display_name: string; first_name: string; phone: string };
  };
  assert.match(session.token, /^drv_/);
  assert.equal(session.driver.id, driverA);
  assert.equal(session.driver.display_name, "Alex Rivera");
  assert.equal(session.driver.first_name, "Alex");
  assert.equal(session.driver.phone, "555-0101");
  assert.match(session.expires_at, API_DATETIME);
  assertNoSecrets(session);
  assertApiDateTimes(session);

  const auth = { Authorization: `Bearer ${session.token}` };

  const me = await read(await meRoute.GET(request(`${BASE}/me`, { headers: auth })));
  assert.equal(me.status, 200);
  assert.deepEqual(me.json, session.driver);

  const assistLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("assist.a@msloads.test"),
      }),
    ),
  );
  assert.equal(assistLogin.status, 200);
  const assistToken = (assistLogin.json as { token: string }).token;
  const assistAuth = { Authorization: `Bearer ${assistToken}`, "content-type": "application/json" };

  const assistHours = await read(
    await assistRoute.POST(
      request(`${BASE}/assist`, {
        method: "POST",
        headers: assistAuth,
        body: JSON.stringify({ question: "What are pickup hours?" }),
      }),
    ),
  );
  assert.equal(assistHours.status, 200);
  const assistHoursBody = assistHours.json as { answer: string; unknown: boolean; documents: unknown[] };
  assert.equal(assistHoursBody.answer, "Not in TMS.");
  assert.equal(assistHoursBody.unknown, true);
  assert.deepEqual(assistHoursBody.documents, []);

  const assistAppointment = await read(
    await assistRoute.POST(
      request(`${BASE}/assist`, {
        method: "POST",
        headers: assistAuth,
        body: JSON.stringify({ question: "What is the pickup appointment time?" }),
      }),
    ),
  );
  assert.equal(assistAppointment.status, 200);
  const assistAppointmentBody = assistAppointment.json as { answer: string; unknown: boolean };
  assert.equal(assistAppointmentBody.unknown, false);
  const expectedWindow = formatDateTime(assistPickupWindowStart);
  const headerWindow = formatDateTime(assistPickupHeader);
  assert.match(assistAppointmentBody.answer, new RegExp(escapeRegExp(expectedWindow)));
  assert.doesNotMatch(assistAppointmentBody.answer, new RegExp(escapeRegExp(headerWindow)));
  assert.match(assistAppointmentBody.answer, /APPT-4451/);

  const assistJunk = await read(
    await assistRoute.POST(
      request(`${BASE}/assist`, {
        method: "POST",
        headers: assistAuth,
        body: JSON.stringify({ question: "Should I stop for dinner in Birmingham?" }),
      }),
    ),
  );
  assert.equal(assistJunk.status, 200);
  const assistJunkBody = assistJunk.json as { answer: string; unknown: boolean };
  assert.equal(assistJunkBody.unknown, true);
  assert.match(assistJunkBody.answer, /assigned load and assigned equipment documents/i);

  const ownAssistDoc = await assistDocRoute.GET(
    request(`${BASE}/assist/docs/${assistDocA.id}`, { headers: { Authorization: `Bearer ${assistToken}` } }),
    { params: Promise.resolve({ fleetDocumentId: String(assistDocA.id) }) },
  );
  assert.equal(ownAssistDoc.status, 200);
  assert.equal(ownAssistDoc.headers.get("content-type"), "image/png");
  assert.ok((await ownAssistDoc.arrayBuffer()).byteLength > 0);

  const forbiddenAssistDoc = await read(
    await assistDocRoute.GET(
      request(`${BASE}/assist/docs/${assistDocB.id}`, { headers: { Authorization: `Bearer ${assistToken}` } }),
      { params: Promise.resolve({ fleetDocumentId: String(assistDocB.id) }) },
    ),
  );
  assert.equal(forbiddenAssistDoc.status, 403);

  const unauth = await read(await loadsRoute.GET(request(`${BASE}/loads?scope=active`)));
  assert.equal(unauth.status, 401);
  assert.equal((unauth.json as { error?: string }).error, "Sign in with your email and password.");
  assert.doesNotMatch(String((unauth.json as { error?: string }).error), /PIN/);

  const active = await read(await loadsRoute.GET(request(`${BASE}/loads?scope=active`, { headers: auth })));
  assert.equal(active.status, 200);
  const activeLoads = active.json as Array<{ id: number; load_number: string; next_actions: { allowed_progress: string[]; can_check_stops: boolean } }>;
  const activeIds = activeLoads.map((row) => row.id);
  assert.equal(activeIds.includes(activeId), true);
  assert.equal(activeIds.includes(relayId), true);
  assert.equal(activeIds.includes(otherId), false, "other driver's load stays off the list");
  assert.equal(activeIds.includes(recentId), false);
  const summary = activeLoads.find((row) => row.id === activeId)!;
  assert.deepEqual(summary.next_actions.allowed_progress, ["en_route_pickup"]);
  assert.equal(summary.next_actions.can_check_stops, true);
  assertNoSecrets(active.json);
  assertApiDateTimes(active.json);

  const recent = await read(await loadsRoute.GET(request(`${BASE}/loads?scope=recent`, { headers: auth })));
  assert.equal(recent.status, 200);
  const recentIds = (recent.json as Array<{ id: number }>).map((row) => row.id);
  assert.equal(recentIds.includes(recentId), true);
  assert.equal(recentIds.includes(activeId), false);
  const deliveredScope = await read(await loadsRoute.GET(request(`${BASE}/loads?scope=delivered`, { headers: auth })));
  assert.equal(deliveredScope.status, 200);
  assert.deepEqual(
    (deliveredScope.json as Array<{ id: number }>).map((row) => row.id),
    recentIds,
    "scope=delivered is an alias of recent",
  );

  const missing = await read(
    await loadRoute.GET(request(`${BASE}/loads/999999`, { headers: auth }), { params: Promise.resolve({ id: "999999" }) }),
  );
  assert.equal(missing.status, 404);

  const forbidden = await read(
    await loadRoute.GET(request(`${BASE}/loads/${otherId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(otherId) }),
    }),
  );
  assert.equal(forbidden.status, 403);
  assert.equal((forbidden.json as { code?: string }).code, "FORBIDDEN");

  const detail = await read(
    await loadRoute.GET(request(`${BASE}/loads/${activeId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  assert.equal(detail.status, 200);
  const loadDetail = detail.json as {
    id: number;
    stops: Array<{ id: number; kind: string; schedule_type: string }>;
    attachments: unknown[];
    next_actions: { allowed_progress: string[] };
  };
  assert.equal(loadDetail.id, activeId);
  assert.ok(loadDetail.stops.some((stop) => stop.kind === "pickup"));
  assert.ok(loadDetail.stops.some((stop) => stop.kind === "delivery"));
  assertNoSecrets(detail.json);
  assertApiDateTimes(detail.json);

  const { getDb } = await import("../lib/db");
  getDb().prepare("UPDATE loads SET pickup_start = ? WHERE id = ?").run("2026-09-11T15:00:00", activeId);
  const naive = await read(
    await loadRoute.GET(request(`${BASE}/loads/${activeId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  const naiveStart = (naive.json as { pickup_start: string }).pickup_start;
  assert.match(naiveStart, API_DATETIME, "naive pickup_start is rewritten with timezone");
  assert.notEqual(naiveStart, "2026-09-11T15:00:00");

  const loginC = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("casey.relay@msloads.test"),
      }),
    ),
  );
  const tokenC = (loginC.json as { token: string }).token;
  const relayDetail = await read(
    await loadRoute.GET(request(`${BASE}/loads/${relayId}`, { headers: { Authorization: `Bearer ${tokenC}` } }), {
      params: Promise.resolve({ id: String(relayId) }),
    }),
  );
  assert.equal(relayDetail.status, 200, "relay driver can open the load");
  assert.ok((relayDetail.json as { relay_leg?: { lane: string } }).relay_leg?.lane);

  const noTrailer = await read(
    await trailerRoute.GET(request(`${BASE}/loads/${activeId}/trailer`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  assert.equal(noTrailer.status, 404, "assigned load without trailer is 404");
  assert.equal((noTrailer.json as { code?: string }).code, "NOT_FOUND");

  const forbiddenTrailer = await read(
    await trailerRoute.GET(request(`${BASE}/loads/${otherId}/trailer`, { headers: auth }), {
      params: Promise.resolve({ id: String(otherId) }),
    }),
  );
  assert.equal(forbiddenTrailer.status, 403);
  assert.equal((forbiddenTrailer.json as { code?: string }).code, "FORBIDDEN");

  const trailerId = queries.createTrailer({
    unit_number: "MS2201",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-api-trailer",
  });
  const trailerLoadId = queries.createLoad(
    loadInput(customerId, {
      load_number: "MSE-API-TRAILER",
      driver_id: driverA,
      status: "assigned",
      trailer_id: trailerId,
    }),
  );
  const emptyGps = await read(
    await trailerRoute.GET(request(`${BASE}/loads/${trailerLoadId}/trailer`, { headers: auth }), {
      params: Promise.resolve({ id: String(trailerLoadId) }),
    }),
  );
  assert.equal(emptyGps.status, 200, "trailer with no coords is 200");
  const emptyGpsBody = emptyGps.json as {
    trailer_id: number;
    unit_number: string;
    latitude: number | null;
    longitude: number | null;
    source: string | null;
    point: { lat: number; lng: number } | null;
  };
  assert.equal(emptyGpsBody.trailer_id, trailerId);
  assert.equal(emptyGpsBody.unit_number, "MS2201");
  assert.equal(emptyGpsBody.latitude, null);
  assert.equal(emptyGpsBody.longitude, null);
  assert.equal(emptyGpsBody.point, null);
  assertNoSecrets(emptyGps.json);

  queries.saveTrailerGps(trailerId, {
    latitude: 41.12,
    longitude: -96.0,
    address: "Driver API trailer pin",
    recordedAt: "2026-08-20T14:00:00.000Z",
    source: "orbcomm",
  });
  const withGps = await read(
    await trailerRoute.GET(request(`${BASE}/loads/${trailerLoadId}/trailer`, { headers: auth }), {
      params: Promise.resolve({ id: String(trailerLoadId) }),
    }),
  );
  assert.equal(withGps.status, 200);
  const gpsBody = withGps.json as {
    latitude: number | null;
    longitude: number | null;
    address: string;
    recorded_at: string;
    source: string | null;
    heading_deg: number | null;
    speed_mph: number | null;
    point: { lat: number; lng: number } | null;
  };
  assert.equal(gpsBody.latitude, 41.12);
  assert.equal(gpsBody.longitude, -96.0);
  assert.equal(gpsBody.address, "Driver API trailer pin");
  assert.equal(gpsBody.source, "stored");
  assert.equal(gpsBody.point?.lat, 41.12);
  assert.equal(gpsBody.point?.lng, -96.0);
  assert.equal(gpsBody.heading_deg, null);
  assert.equal(gpsBody.speed_mph, null);
  assertApiDateTimes(withGps.json);
  assertNoSecrets(withGps.json);

  const progressBody = { progress: "en_route_pickup", client_request_id: "progress-1" };
  const firstProgress = await read(
    await progressRoute.POST(
      request(`${BASE}/loads/${activeId}/progress`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify(progressBody),
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(firstProgress.status, 200, `progress ${JSON.stringify(firstProgress.json)}`);
  const firstLoad = (firstProgress.json as { load: { driver_progress: string; next_actions: { allowed_progress: string[] } } }).load;
  assert.equal(firstLoad.driver_progress, "en_route_pickup");
  assert.deepEqual(firstLoad.next_actions.allowed_progress, ["loaded"]);
  const replayProgress = await read(
    await progressRoute.POST(
      request(`${BASE}/loads/${activeId}/progress`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify(progressBody),
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(replayProgress.status, 200);
  assert.deepEqual(replayProgress.json, firstProgress.json);

  const skipProgress = await read(
    await progressRoute.POST(
      request(`${BASE}/loads/${activeId}/progress`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ progress: "delivered", client_request_id: "progress-skip" }),
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(skipProgress.status, 409);

  const pickup = loadDetail.stops.find((stop) => stop.kind === "pickup")!;
  const delivery = loadDetail.stops.find((stop) => stop.kind === "delivery")!;

  const deliveryFirst = await read(
    await checkRoute.POST(
      request(`${BASE}/loads/${activeId}/stops/${delivery.id}/check`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ kind: "arrive", client_request_id: "bad-delivery" }),
      }),
      { params: Promise.resolve({ id: String(activeId), stopId: String(delivery.id) }) },
    ),
  );
  assert.equal(deliveryFirst.status, 409);
  assert.match(String((deliveryFirst.json as { error?: string }).error), /pickup/i);

  const departFirst = await read(
    await checkRoute.POST(
      request(`${BASE}/loads/${activeId}/stops/${pickup.id}/check`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ kind: "depart", client_request_id: "bad-depart" }),
      }),
      { params: Promise.resolve({ id: String(activeId), stopId: String(pickup.id) }) },
    ),
  );
  assert.equal(departFirst.status, 409);
  assert.match(String((departFirst.json as { error?: string }).error), /Check in first/);

  const arrivePickup = await read(
    await checkRoute.POST(
      request(`${BASE}/loads/${activeId}/stops/${pickup.id}/check`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ kind: "arrive", client_request_id: "pickup-arrive" }),
      }),
      { params: Promise.resolve({ id: String(activeId), stopId: String(pickup.id) }) },
    ),
  );
  assert.equal(arrivePickup.status, 200, `arrive ${JSON.stringify(arrivePickup.json)}`);

  const replayArrive = await read(
    await checkRoute.POST(
      request(`${BASE}/loads/${activeId}/stops/${pickup.id}/check`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ kind: "arrive", client_request_id: "pickup-arrive" }),
      }),
      { params: Promise.resolve({ id: String(activeId), stopId: String(pickup.id) }) },
    ),
  );
  assert.deepEqual(replayArrive.json, arrivePickup.json);

  const bytes = fs.readFileSync(FIXTURE);
  const form = new FormData();
  form.set("kind", "pod");
  form.set("client_request_id", "pod-1");
  form.set("file", new File([bytes], "pod.png", { type: "image/png" }));
  const uploaded = await read(
    await attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, { method: "POST", headers: auth, body: form }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(uploaded.status, 200, `upload ${JSON.stringify(uploaded.json)}`);
  const attachment = (uploaded.json as { attachment: { kind: string; original_name: string; uploaded_by: string } }).attachment;
  assert.equal(attachment.kind, "pod");
  assert.equal(attachment.original_name, "pod.png");
  assert.match(attachment.uploaded_by, /Alex Rivera|driver/);
  assertNoSecrets(uploaded.json);
  assertApiDateTimes(uploaded.json);

  const otherForm = new FormData();
  otherForm.set("kind", "other");
  otherForm.set("client_request_id", "other-1");
  otherForm.set("file", new File([bytes], "note.png", { type: "image/png" }));
  const otherUpload = await read(
    await attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, { method: "POST", headers: auth, body: otherForm }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(otherUpload.status, 200, `other kind ${JSON.stringify(otherUpload.json)}`);
  assert.equal((otherUpload.json as { attachment: { kind: string } }).attachment.kind, "other");

  const rateForm = new FormData();
  rateForm.set("kind", "rate_con");
  rateForm.set("client_request_id", "rate-1");
  rateForm.set("file", new File([bytes], "rate.png", { type: "image/png" }));
  const rateUpload = await read(
    await attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, { method: "POST", headers: auth, body: rateForm }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(rateUpload.status, 409);

  const invoiceForm = new FormData();
  invoiceForm.set("kind", "invoice");
  invoiceForm.set("client_request_id", "invoice-1");
  invoiceForm.set("file", new File([bytes], "invoice.png", { type: "image/png" }));
  const invoiceUpload = await read(
    await attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, { method: "POST", headers: auth, body: invoiceForm }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(invoiceUpload.status, 409, "kind=invoice rejected on upload");

  const { performDriverUpload } = await import("../lib/driver-ops");
  const driverRow = queries.getDriver(driverA)!;
  await assert.rejects(
    () =>
      performDriverUpload({
        driver: driverRow,
        loadId: activeId,
        kind: "ifta",
        file: new File([bytes], "ifta.png", { type: "image/png" }),
        allowKinds: "web",
      }),
    /Pick a document type/,
  );
  await assert.rejects(
    () =>
      performDriverUpload({
        driver: driverRow,
        loadId: activeId,
        kind: "claim",
        file: new File([bytes], "claim.png", { type: "image/png" }),
      }),
    /Pick a document type/,
  );
  const webBlocked = await performDriverUpload({
    driver: driverRow,
    loadId: activeId,
    kind: "ifta",
    file: new File([bytes], "ifta.png", { type: "image/png" }),
    allowKinds: "api",
  });
  assert.equal(webBlocked.attachment.kind, "ifta");

  const {
    DRIVER_API_ATTACHMENT_KINDS,
    DRIVER_API_UPLOAD_KINDS,
    DRIVER_API_IDEMPOTENCY_PENDING_TTL_MS,
    driverApiRequestIp,
    toDriverApiDateTime,
  } = await import("../lib/driver-api");
  assert.match(toDriverApiDateTime("2026-09-11T15:00:00-05:00"), API_DATETIME);
  assert.equal(toDriverApiDateTime("2026-09-11T20:00:00.000Z"), "2026-09-11T20:00:00.000Z");
  assert.equal(toDriverApiDateTime(""), "");
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("rate_con"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("invoice"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("ifta"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("claim"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("other"), true);
  assert.equal(DRIVER_API_UPLOAD_KINDS.includes("ifta"), true);
  assert.equal(DRIVER_API_UPLOAD_KINDS.includes("other"), true);
  assert.equal(DRIVER_API_UPLOAD_KINDS.includes("rate_con"), false);
  assert.equal(DRIVER_API_UPLOAD_KINDS.includes("invoice"), false);
  assert.equal(DRIVER_API_IDEMPOTENCY_PENDING_TTL_MS, 45_000);
  const savedProxy = process.env.TRUSTED_PROXY;
  delete process.env.TRUSTED_PROXY;
  assert.equal(
    driverApiRequestIp(request(`${BASE}/auth/roster`, { headers: { "x-forwarded-for": "203.0.113.9" } })),
    "",
    "XFF ignored without TRUSTED_PROXY",
  );
  assert.equal(
    driverApiRequestIp(request(`${BASE}/auth/roster`, { headers: { "cf-connecting-ip": "198.51.100.2" } })),
    "198.51.100.2",
    "Cloudflare Connecting-IP works without TRUSTED_PROXY",
  );
  process.env.TRUSTED_PROXY = "1";
  assert.equal(
    driverApiRequestIp(
      request(`${BASE}/auth/roster`, { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }),
    ),
    "203.0.113.9",
  );
  process.env.TRUSTED_PROXY = savedProxy;
  assert.equal(fs.existsSync(path.join(process.cwd(), "app/api/driver/v1/auth/refresh/route.ts")), false);

  const replayUpload = await read(
    await attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, {
        method: "POST",
        headers: auth,
        body: (() => {
          const again = new FormData();
          again.set("kind", "pod");
          again.set("client_request_id", "pod-1");
          again.set("file", new File([bytes], "pod.png", { type: "image/png" }));
          return again;
        })(),
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.deepEqual(replayUpload.json, uploaded.json);

  const afterUpload = await read(
    await loadRoute.GET(request(`${BASE}/loads/${activeId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  const files = (afterUpload.json as { attachments: Array<{ kind: string }> }).attachments;
  assert.equal(files.some((file) => file.kind === "pod"), true);

  const sharedId = "shared-cross-endpoint";
  const sharedProgress = await read(
    await progressRoute.POST(
      request(`${BASE}/loads/${activeId}/progress`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ progress: "loaded", client_request_id: sharedId }),
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(sharedProgress.status, 200, `shared progress ${JSON.stringify(sharedProgress.json)}`);
  const sharedCheck = await read(
    await checkRoute.POST(
      request(`${BASE}/loads/${activeId}/stops/${pickup.id}/check`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ kind: "depart", client_request_id: sharedId }),
      }),
      { params: Promise.resolve({ id: String(activeId), stopId: String(pickup.id) }) },
    ),
  );
  assert.equal(sharedCheck.status, 200, `scoped idempotency ${JSON.stringify(sharedCheck.json)}`);
  const afterShared = await read(
    await loadRoute.GET(request(`${BASE}/loads/${activeId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  const departed = (afterShared.json as { stops: Array<{ kind: string; departed_at: string }> }).stops.find(
    (stop) => stop.kind === "pickup",
  );
  assert.ok(departed?.departed_at, "same UUID on another path must not replay progress");

  const concurrentId = "concurrent-pod";
  const concurrentBodies = [1, 2].map(() => {
    const form = new FormData();
    form.set("kind", "bol");
    form.set("client_request_id", concurrentId);
    form.set("file", new File([bytes], "bol.png", { type: "image/png" }));
    return attachRoute.POST(
      request(`${BASE}/loads/${activeId}/attachments`, { method: "POST", headers: auth, body: form }),
      { params: Promise.resolve({ id: String(activeId) }) },
    );
  });
  const concurrent = await Promise.all(concurrentBodies);
  const concurrentReads = await Promise.all(concurrent.map((res) => read(res)));
  assert.equal(concurrentReads[0]?.status, 200);
  assert.equal(concurrentReads[1]?.status, 200);
  assert.deepEqual(concurrentReads[0]?.json, concurrentReads[1]?.json);
  const afterConcurrent = await read(
    await loadRoute.GET(request(`${BASE}/loads/${activeId}`, { headers: auth }), {
      params: Promise.resolve({ id: String(activeId) }),
    }),
  );
  const bols = (afterConcurrent.json as { attachments: Array<{ kind: string; original_name: string }> }).attachments.filter(
    (file) => file.kind === "bol" && file.original_name === "bol.png",
  );
  assert.equal(bols.length, 1, "concurrent same client_request_id applies once");

  const stalePath = `/api/driver/v1/loads/${activeId}/attachments`;
  const staleAt = new Date(Date.now() - 60_000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO driver_api_idempotency
        (driver_id, method, path, client_request_id, status, body, created_at)
       VALUES (?, 'POST', ?, 'stale-reclaim-1', 0, '', ?)`,
    )
    .run(driverA, stalePath, staleAt);
  const reclaimForm = new FormData();
  reclaimForm.set("kind", "scale_ticket");
  reclaimForm.set("client_request_id", "stale-reclaim-1");
  reclaimForm.set("file", new File([bytes], "scale.png", { type: "image/png" }));
  const reclaimed = await read(
    await attachRoute.POST(
      request(`http://localhost:3000${stalePath}`, {
        method: "POST",
        headers: auth,
        body: reclaimForm,
      }),
      { params: Promise.resolve({ id: String(activeId) }) },
    ),
  );
  assert.equal(reclaimed.status, 200, `stale pending reclaim ${JSON.stringify(reclaimed.json)}`);
  assert.equal((reclaimed.json as { attachment: { kind: string } }).attachment.kind, "scale_ticket");

  const fuelTxRoute = await import("../app/api/driver/v1/fuel/transactions/route");
  const fuelTxIdRoute = await import("../app/api/driver/v1/fuel/transactions/[id]/route");
  const fuelTxReceiptRoute = await import("../app/api/driver/v1/fuel/transactions/[id]/receipt/route");
  const fuelReceiptsRoute = await import("../app/api/driver/v1/fuel/receipts/route");
  const fuelMatchRoute = await import("../app/api/driver/v1/fuel/receipts/[id]/match/route");
  const nowFuel = new Date().toISOString();
  const insertFuel = dbMod.getDb().prepare(
    `INSERT INTO fuel_transactions (
      occurred_at, driver_id, truck_id, load_id, location, gallons, price_per_gallon, amount,
      card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
      prompt_data, dedup_key, created_at
    ) VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, 'driver-api', 'truck_diesel', '', '', '', '', ?, ?)`,
  );
  const fuelA = Number(
    insertFuel.run(nowFuel, driverA, "Pilot Jackson MS", 40, 140.4, "8899", "api-fuel-a", nowFuel).lastInsertRowid,
  );
  const fuelB = Number(
    insertFuel.run(nowFuel, driverB, "Loves Memphis", 20, 70.2, "2211", "api-fuel-b", nowFuel).lastInsertRowid,
  );

  const fuelList = await read(await fuelTxRoute.GET(request(`${BASE}/fuel/transactions`, { headers: auth })));
  assert.equal(fuelList.status, 200);
  const fuelRows = fuelList.json as Array<{ id: number; receipt_id: number | null; amount: number | null }>;
  assert.equal(fuelRows.some((row) => row.id === fuelA), true);
  assert.equal(fuelRows.some((row) => row.id === fuelB), false);
  assertNoSecrets(fuelList.json);
  assertApiDateTimes(fuelList.json);

  const fuelForbidden = await read(
    await fuelTxIdRoute.GET(request(`${BASE}/fuel/transactions/${fuelB}`, { headers: auth }), {
      params: Promise.resolve({ id: String(fuelB) }),
    }),
  );
  assert.equal(fuelForbidden.status, 403);

  const orphanForm = new FormData();
  orphanForm.set("client_request_id", "fuel-orphan-1");
  orphanForm.set("file", new File([bytes], "fuel.png", { type: "image/png" }));
  orphanForm.set("amount", "140.40");
  orphanForm.set("gallons", "40");
  orphanForm.set("merchant", "Pilot Jackson MS");
  orphanForm.set("card_last4", "8899");
  orphanForm.set("occurred_at", nowFuel);
  const orphan = await read(
    await fuelReceiptsRoute.POST(request(`${BASE}/fuel/receipts`, { method: "POST", headers: auth, body: orphanForm })),
  );
  assert.equal(orphan.status, 200, `orphan ${JSON.stringify(orphan.json)}`);
  const orphanReceipt = (orphan.json as { receipt: { id: number; status: string; fuel_transaction_id: number | null } }).receipt;
  assert.equal(orphanReceipt.status, "matched");
  assert.equal(orphanReceipt.fuel_transaction_id, fuelA);

  const pendingList = await read(
    await fuelReceiptsRoute.GET(request(`${BASE}/fuel/receipts?status=pending_match`, { headers: auth })),
  );
  assert.equal(pendingList.status, 200);
  assert.equal((pendingList.json as Array<{ id: number }>).some((row) => row.id === orphanReceipt.id), false);

  const matchedList = await read(
    await fuelReceiptsRoute.GET(request(`${BASE}/fuel/receipts?status=matched`, { headers: auth })),
  );
  assert.equal((matchedList.json as Array<{ id: number }>).some((row) => row.id === orphanReceipt.id), true);

  const laterForm = new FormData();
  laterForm.set("client_request_id", "fuel-orphan-2");
  laterForm.set("file", new File([bytes], "fuel-late.png", { type: "image/png" }));
  laterForm.set("amount", "55.00");
  laterForm.set("card_last4", "3344");
  const later = await read(
    await fuelReceiptsRoute.POST(request(`${BASE}/fuel/receipts`, { method: "POST", headers: auth, body: laterForm })),
  );
  assert.equal(later.status, 200);
  const laterReceipt = (later.json as { receipt: { id: number; status: string } }).receipt;
  assert.equal(laterReceipt.status, "pending_match");

  const manualTx = Number(
    insertFuel.run(nowFuel, driverA, "TA Nashville", 12, 55, "3344", "api-fuel-manual", nowFuel).lastInsertRowid,
  );
  const matchedManual = await read(
    await fuelMatchRoute.POST(
      request(`${BASE}/fuel/receipts/${laterReceipt.id}/match`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ fuel_transaction_id: manualTx, client_request_id: "fuel-match-1" }),
      }),
      { params: Promise.resolve({ id: String(laterReceipt.id) }) },
    ),
  );
  assert.equal(matchedManual.status, 200, `match ${JSON.stringify(matchedManual.json)}`);
  assert.equal((matchedManual.json as { receipt: { status: string; fuel_transaction_id: number } }).receipt.status, "matched");
  assert.equal((matchedManual.json as { receipt: { fuel_transaction_id: number } }).receipt.fuel_transaction_id, manualTx);

  const attachForm = new FormData();
  attachForm.set("client_request_id", "fuel-on-tx");
  attachForm.set("file", new File([bytes], "on-tx.png", { type: "image/png" }));
  const extraTx = Number(
    insertFuel.run(nowFuel, driverA, "Shell Birmingham", 8, 28.8, "5566", "api-fuel-attach", nowFuel).lastInsertRowid,
  );
  const attached = await read(
    await fuelTxReceiptRoute.POST(
      request(`${BASE}/fuel/transactions/${extraTx}/receipt`, { method: "POST", headers: auth, body: attachForm }),
      { params: Promise.resolve({ id: String(extraTx) }) },
    ),
  );
  assert.equal(attached.status, 200, `tx receipt ${JSON.stringify(attached.json)}`);
  assert.equal((attached.json as { receipt: { status: string; fuel_transaction_id: number } }).receipt.status, "matched");
  assert.equal((attached.json as { receipt: { fuel_transaction_id: number } }).receipt.fuel_transaction_id, extraTx);

  const fuelImportRoute = await import("../app/api/fuel/import/route");
  const unauthImport = await read(
    await fuelImportRoute.POST(request("http://localhost:3000/api/fuel/import", { method: "POST" })),
  );
  assert.equal(unauthImport.status, 401);
  process.env.TMS_FUEL_IMPORT_TOKEN = "fuel-bot-test-token";
  const botCsv = [
    "Date,Time,Driver Name,Driver ID,Unit,Location,Category,Gallons,Price,Total,Card Number",
    "9/13/2026,08:00,Alex Rivera,,1,Pilot Jackson,Diesel,10,3.00,30.00,****8899",
  ].join("\n");
  const botForm = new FormData();
  botForm.set("file", new File([botCsv], "bot.csv", { type: "text/csv" }));
  const botImport = await read(
    await fuelImportRoute.POST(
      request("http://localhost:3000/api/fuel/import", {
        method: "POST",
        headers: { Authorization: "Bearer fuel-bot-test-token" },
        body: botForm,
      }),
    ),
  );
  assert.equal(botImport.status, 200, `fuel import ${JSON.stringify(botImport.json)}`);
  const botBody = botImport.json as { ok: boolean; created?: number; unmatched?: number };
  assert.equal(botBody.ok, true);
  assert.ok((botBody.created ?? 0) + (botBody.unmatched ?? 0) >= 1);
  delete process.env.TMS_FUEL_IMPORT_TOKEN;

  const loggedOut = await read(await logoutRoute.POST(request(`${BASE}/auth/logout`, { method: "POST", headers: auth })));
  assert.equal(loggedOut.status, 204);
  const meAfter = await read(await meRoute.GET(request(`${BASE}/me`, { headers: auth })));
  assert.equal(meAfter.status, 401);

  for (let i = 0; i < 5; i += 1) {
    const failed = await read(
      await loginRoute.POST(
        request(`${BASE}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
          body: loginPayload("limit.test@msloads.test", "Wrong1$ab"),
        }),
      ),
    );
    assert.equal(failed.status, 401, `rate-limit setup ${i}`);
  }
  const limited = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: loginPayload("limit.test@msloads.test"),
      }),
    ),
  );
  assert.equal(limited.status, 429);
  assert.equal((limited.json as { code?: string }).code, "RATE_LIMITED");

  const relogin1 = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("blake.soto@msloads.test"),
      }),
    ),
  );
  const tokenB1 = (relogin1.json as { token: string }).token;
  const relogin2 = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: loginPayload("blake.soto@msloads.test"),
      }),
    ),
  );
  const tokenB2 = (relogin2.json as { token: string }).token;
  const oldMe = await read(await meRoute.GET(request(`${BASE}/me`, { headers: { Authorization: `Bearer ${tokenB1}` } })));
  const newMe = await read(await meRoute.GET(request(`${BASE}/me`, { headers: { Authorization: `Bearer ${tokenB2}` } })));
  assert.equal(oldMe.status, 401, "prior bearer revoked on relogin");
  assert.equal(newMe.status, 200);
  assert.equal((newMe.json as { id: number }).id, driverB);

  console.log("driver-api-v1-test: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
