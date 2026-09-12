import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-driver-api-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";

const FIXTURE = path.join(process.cwd(), "scripts/fixtures/driver-api/pod.png");
const BASE = "http://localhost:3000/api/driver/v1";

function loadInput(
  customerId: number,
  extra: Partial<{
    load_number: string;
    origin: string;
    destination: string;
    status: string;
    driver_id: number | null;
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
    load_number: extra.load_number,
    oo_pay: extra.oo_pay ?? 350,
  };
}

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
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
  const progressRoute = await import("../app/api/driver/v1/loads/[id]/progress/route");
  const checkRoute = await import("../app/api/driver/v1/loads/[id]/stops/[stopId]/check/route");
  const attachRoute = await import("../app/api/driver/v1/loads/[id]/attachments/route");

  const customerId = queries.createCustomer({
    name: "Driver API Shipper",
    billing_notes: "",
    contacts: [],
  });
  const driverA = queries.createDriver({
    name: "Alex Rivera",
    phone: "555-0101",
    license: "TN-CDL-A",
    pin: "4321",
    truck_id: null,
    status: "available",
  });
  const driverB = queries.createDriver({
    name: "Blake Soto",
    phone: "555-0102",
    license: "TN-CDL-B",
    pin: "2222",
    truck_id: null,
    status: "available",
  });
  const driverC = queries.createDriver({
    name: "Casey Relay",
    phone: "555-0103",
    license: "TN-CDL-C",
    pin: "3333",
    truck_id: null,
    status: "available",
  });
  const limiter = queries.createDriver({
    name: "Limit Test",
    phone: "555-0199",
    license: "TN-CDL-L",
    pin: "9999",
    truck_id: null,
    status: "available",
  });

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
  assert.equal(roster.status, 200);
  const names = roster.json as Array<{ id: number; display_name: string }>;
  assert.equal(names.some((row) => row.id === driverA && row.display_name === "Alex Rivera"), true);
  assert.equal(
    names.every((row) => Object.keys(row).length === 2 && "id" in row && "display_name" in row),
    true,
    "roster is id + display_name only",
  );
  assertNoSecrets(roster.json);

  const badLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver_id: driverA, pin: "0000" }),
      }),
    ),
  );
  assert.equal(badLogin.status, 401);
  const badBody = badLogin.json as { ok: false; error: string; code?: string };
  assert.equal(badBody.ok, false);
  assert.equal(badBody.code, "UNAUTHORIZED");

  const goodLogin = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver_id: driverA, pin: "4321" }),
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

  const unauth = await read(await loadsRoute.GET(request(`${BASE}/loads?scope=active`)));
  assert.equal(unauth.status, 401);

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
        body: JSON.stringify({ driver_id: driverC, pin: "3333" }),
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

  const { DRIVER_API_ATTACHMENT_KINDS, toDriverApiDateTime } = await import("../lib/driver-api");
  assert.match(toDriverApiDateTime("2026-09-11T15:00:00-05:00"), API_DATETIME);
  assert.equal(toDriverApiDateTime("2026-09-11T20:00:00.000Z"), "2026-09-11T20:00:00.000Z");
  assert.equal(toDriverApiDateTime(""), "");
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("rate_con"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("invoice"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("ifta"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("claim"), true);
  assert.equal(DRIVER_API_ATTACHMENT_KINDS.includes("other"), true);
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
          body: JSON.stringify({ driver_id: limiter, pin: "0000" }),
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
        body: JSON.stringify({ driver_id: limiter, pin: "9999" }),
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
        body: JSON.stringify({ driver_id: driverB, pin: "2222" }),
      }),
    ),
  );
  const tokenB1 = (relogin1.json as { token: string }).token;
  const relogin2 = await read(
    await loginRoute.POST(
      request(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driver_id: driverB, pin: "2222" }),
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
