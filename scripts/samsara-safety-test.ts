import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-samsara-safety-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function main() {
  const safetySrc = fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara-safety.ts"), "utf8");
  const sharedSrc = fs.readFileSync(path.join(process.cwd(), "lib/samsara-safety-shared.ts"), "utf8");
  const truckPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/[id]/page.tsx"), "utf8");
  const timelineUi = fs.readFileSync(path.join(process.cwd(), "components/load-log-section.tsx"), "utf8");
  const tracking = fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8");
  const actions = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  assert.match(safetySrc, /\/fleet\/safety-events\/stream/);
  assert.match(safetySrc, /queryByTimeField/);
  assert.match(safetySrc, /createdAtTime/);
  assert.match(safetySrc, /includeVgOnlyEvents/);
  assert.match(safetySrc, /assetIds/);
  assert.doesNotMatch(safetySrc, /cameras\/media/);
  assert.doesNotMatch(safetySrc, /console\.log/);
  assert.match(sharedSrc, /Read Safety Events & Scores/);
  assert.match(truckPage, /SamsaraSafetyPanel/);
  assert.match(truckPage, /listTruckSamsaraSafety/);
  assert.match(timelineUi, /withSamsaraSafetyEvents/);
  assert.match(timelineUi, /data-samsara-safety-notice/);
  assert.match(tracking, /listLoadSamsaraSafety/);
  assert.doesNotMatch(actions, /listLoadSamsaraSafety|safety-events\/stream/);

  const shared = await import("../lib/samsara-safety-shared");
  const safety = await import("../lib/integrations/samsara-safety");
  const { withSamsaraSafetyEvents } = await import("../lib/load-timeline");
  const { fromOfficeDateTime } = await import("../lib/format");
  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");

  assert.equal(shared.safetyLabel("Speeding"), "Speeding");
  assert.equal(shared.safetyLabel("Braking"), "Braking");
  assert.equal(shared.safetyLabel("Acceleration"), "Acceleration");
  assert.equal(shared.safetyLabel("HarshTurn"), "Harsh turn");
  assert.equal(shared.safetyLabel("MobileUsage"), "Mobile");
  assert.equal(shared.safetyLabel("GenericDistraction"), "Distraction");
  assert.equal(shared.safetyLabel("EdgeDistractedDriving"), "Distraction");
  assert.equal(shared.safetyLabel("BrandNewLabel"), "Brand new label");
  assert.equal(shared.safetyTitle(["Braking", "MobileUsage"]), "Braking · Mobile");
  assert.equal(shared.safetyTitle([]), "Safety event");
  assert.equal(shared.safetyTitle(["FollowingDistance", "FollowingDistanceSevere"]), "Following distance");

  const closedWindow = shared.safetyWindowForLoad(
    {
      pickup_start: "2026-09-20T08:00",
      delivery_end: "2026-09-20T18:00",
      status: "delivered",
    },
    new Date("2026-09-27T12:00:00Z"),
  );
  assert.equal(closedWindow?.start, fromOfficeDateTime("2026-09-20T08:00"));
  assert.equal(closedWindow?.end, fromOfficeDateTime("2026-09-20T18:00"));

  const openWindow = shared.safetyWindowForLoad(
    {
      pickup_start: "2026-09-20T08:00:00.000Z",
      delivery_end: "2026-09-20T12:00:00.000Z",
      status: "in_transit",
    },
    new Date("2026-09-20T20:00:00.000Z"),
  );
  assert.equal(openWindow?.end, "2026-09-20T20:00:00.000Z");
  assert.equal(shared.safetyWindowForLoad({ status: "assigned", pickup_start: "" }, new Date()), null);
  assert.equal(
    shared.safetyWindowForLoad(
      {
        pickup_start: "2026-09-21T08:00:00.000Z",
        delivery_end: "2026-09-20T08:00:00.000Z",
        status: "delivered",
      },
      new Date("2026-09-22T00:00:00.000Z"),
    ),
    null,
  );

  const window = { start: "2026-09-20T08:00:00.000Z", end: "2026-09-20T20:00:00.000Z" };
  const parsed = shared.parseSamsaraSafetyEvents(
    [
      {
        id: "evt-brake",
        startMs: "2026-09-20T14:10:00.000Z",
        eventState: "needsReview",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Braking", source: "automated" }],
      },
      {
        id: "evt-speed",
        startMs: "2026-09-20T15:00:00.000Z",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Speeding" }, { label: "HarshTurn" }],
      },
      {
        id: "evt-mobile",
        time: "2026-09-20T16:00:00.000Z",
        vehicle: { id: "veh-12" },
        behaviorLabels: [{ label: "MobileUsage" }],
      },
      {
        id: "evt-unknown",
        createdAtTime: "2026-09-20T16:30:00.000Z",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "BrandNewLabel" }],
      },
      {
        id: "evt-dismissed",
        startMs: "2026-09-20T13:00:00.000Z",
        eventState: "dismissed",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Acceleration" }],
      },
      {
        id: "evt-other-truck",
        startMs: "2026-09-20T14:00:00.000Z",
        asset: { id: "veh-99" },
        behaviorLabels: [{ label: "Crash" }],
      },
      {
        id: "evt-outside",
        startMs: "2026-09-19T14:00:00.000Z",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Braking" }],
      },
      {
        id: "",
        startMs: "2026-09-20T14:00:00.000Z",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Braking" }],
      },
      {
        id: "evt-no-time",
        asset: { id: "veh-12" },
        behaviorLabels: [{ label: "Braking" }],
      },
      {
        id: "evt-numeric",
        startMs: Date.parse("2026-09-20T12:00:00.000Z"),
        asset: { id: "veh-12,veh-other" },
        behaviorLabels: [],
      },
    ],
    { vehicleId: "veh-12", ...window },
  );
  assert.deepEqual(
    parsed.map((event) => event.id),
    ["evt-unknown", "evt-mobile", "evt-speed", "evt-brake", "evt-dismissed", "evt-numeric"],
  );
  assert.equal(parsed.find((event) => event.id === "evt-speed")?.title, "Speeding · Harsh turn");
  assert.equal(parsed.find((event) => event.id === "evt-unknown")?.title, "Brand new label");
  assert.equal(parsed.find((event) => event.id === "evt-mobile")?.title, "Mobile");
  assert.equal(parsed.find((event) => event.id === "evt-brake")?.title, "Braking");
  assert.equal(parsed.find((event) => event.id === "evt-dismissed")?.title, "Acceleration");
  assert.equal(parsed.find((event) => event.id === "evt-dismissed")?.detail, "event evt-dismissed · dismissed");
  assert.equal(parsed.find((event) => event.id === "evt-brake")?.detail, "event evt-brake");
  assert.equal(parsed.find((event) => event.id === "evt-numeric")?.title, "Safety event");
  assert.equal(parsed.some((event) => event.id === "evt-other-truck"), false);
  assert.equal(parsed.some((event) => event.id === "evt-outside"), false);

  const merged = withSamsaraSafetyEvents(
    [
      {
        id: "audit-1",
        at: "2026-09-20T14:00:00.000Z",
        source: "dispatcher",
        actor: "Pat",
        title: "status",
        detail: "assigned",
      },
    ],
    parsed.filter((event) => event.id === "evt-brake" || event.id === "evt-mobile"),
  );
  assert.equal(merged[0]?.id, "samsara-safety-evt-mobile");
  assert.match(merged[0]?.detail ?? "", /evt-mobile/);
  assert.equal(merged[0]?.source, "samsara");
  assert.equal(merged.at(-1)?.id, "audit-1");
  const times = merged.map((row) => Date.parse(row.at));
  for (let index = 1; index < times.length; index += 1) {
    assert.ok(times[index] <= times[index - 1], "safety rows stay newest first");
  }

  getDb();
  const customerId = queries.createCustomer({
    name: "Safety Smoke Shipper",
    billing_notes: "",
    contacts: [{ name: "Pat", role: "Shipping", phone: "555-0100", email: "pat@example.com" }],
  });
  const mappedTruck = queries.createTruck({
    unit_number: "SAFE-12",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    samsara_vehicle_id: "veh-12",
  });
  const bareTruck = queries.createTruck({
    unit_number: "SAFE-BARE",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    samsara_vehicle_id: "",
  });
  const loadInput = {
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup_start: "2026-09-20T08:00:00.000Z",
    pickup_end: "2026-09-20T10:00:00.000Z",
    delivery_start: "2026-09-20T16:00:00.000Z",
    delivery_end: "2026-09-20T18:00:00.000Z",
    weight: 10000,
    commodity: "Dry",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "SAFE-MAPPED",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "in_transit" as const,
    driver_id: null,
  };
  const safetyLoad = queries.createLoad({ ...loadInput, truck_id: mappedTruck });
  const bareLoad = queries.createLoad({
    ...loadInput,
    truck_id: bareTruck,
    reference_number: "SAFE-BARE",
    destination: "Austin, TX",
  });
  const noTruckLoad = queries.createLoad({
    ...loadInput,
    truck_id: null,
    reference_number: "SAFE-NONE",
    destination: "Waco, TX",
    status: "available",
  });

  const savedToken = process.env.SAMSARA_API_TOKEN;
  const savedFetch = globalThis.fetch;
  const now = new Date("2026-09-20T20:00:00.000Z");
  let fetches = 0;

  try {
    delete process.env.SAMSARA_API_TOKEN;
    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () => {
      fetches += 1;
      return jsonResponse({ data: [] });
    }) as typeof fetch;
    const missingToken = await safety.listLoadSamsaraSafety(safetyLoad, now);
    assert.equal(missingToken.reason, "token_missing");
    assert.equal(missingToken.ok, false);
    assert.equal(missingToken.events.length, 0);
    assert.match(missingToken.message, /Samsara is not connected/);
    assert.match(missingToken.message, /Read Safety Events & Scores/);
    assert.equal(fetches, 0, "missing token must not call Samsara");

    const unmapped = await safety.listLoadSamsaraSafety(bareLoad, now);
    assert.equal(unmapped.reason, "unmapped");
    assert.match(unmapped.message, /No Samsara ID/);
    assert.equal(fetches, 0, "unmapped truck must not call Samsara");

    const noTruck = await safety.listLoadSamsaraSafety(noTruckLoad, now);
    assert.equal(noTruck.reason, "no_truck");
    assert.equal(noTruck.message, "No truck assigned.");
    assert.equal(fetches, 0);

    const truckBare = await safety.listTruckSamsaraSafety("  ", now);
    assert.equal(truckBare.reason, "unmapped");
    assert.equal(fetches, 0);

    process.env.SAMSARA_API_TOKEN = "test-safety-not-a-real-token";
    safety.resetSamsaraSafetyCacheForTests();
    let seenUrl = "";
    let auth = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetches += 1;
      seenUrl = requestUrl(input);
      auth = new Headers(init?.headers).get("authorization") ?? "";
      return jsonResponse({ message: "missing scope" }, 403);
    }) as typeof fetch;
    const denied = await safety.listLoadSamsaraSafety(safetyLoad, now);
    assert.equal(denied.reason, "scopes");
    assert.equal(denied.ok, false);
    assert.deepEqual(denied.events, []);
    assert.match(denied.message, /Read Safety Events & Scores/);
    assert.match(auth, /^Bearer test-safety-not-a-real-token$/);
    assert.doesNotMatch(seenUrl, /test-safety/);
    const decoded = decodeURIComponent(seenUrl);
    assert.match(decoded, /\/fleet\/safety-events\/stream/);
    assert.match(decoded, /startTime=2026-09-20T08:00:00.000Z/);
    assert.match(decoded, /endTime=2026-09-20T20:00:00.000Z/);
    assert.match(decoded, /queryByTimeField=createdAtTime/);
    assert.match(decoded, /assetIds=veh-12/);
    assert.match(decoded, /includeVgOnlyEvents=true/);
    assert.doesNotMatch(decoded, /cameras\/media|behaviorLabels=/);

    queries.updateLoadDetails(safetyLoad, { appointment_confirmation: "CONF-SAFE" });
    queries.updateLoadStatus(safetyLoad, "in_transit");
    const afterDeny = queries.getLoad(safetyLoad);
    assert.equal(afterDeny?.status, "in_transit", "scope miss must not block save / status");
    assert.equal(afterDeny?.appointment_confirmation, "CONF-SAFE");

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const unauthorized = await safety.listTruckSamsaraSafety("veh-12", now);
    assert.equal(unauthorized.reason, "scopes");
    assert.equal(unauthorized.events.length, 0);

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () => new Response("slow", { status: 429 })) as typeof fetch;
    const limited = await safety.listTruckSamsaraSafety("veh-12", now);
    assert.equal(limited.reason, "rate_limit");
    assert.equal(limited.events.length, 0);

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () => new Response("down", { status: 500 })) as typeof fetch;
    const down = await safety.listLoadSamsaraSafety(safetyLoad, now);
    assert.equal(down.reason, "unavailable");
    assert.equal(down.events.length, 0);
    assert.equal(queries.getLoad(safetyLoad)?.status, "in_transit");

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const thrown = await safety.listTruckSamsaraSafety("veh-12", now);
    assert.equal(thrown.reason, "unavailable");
    assert.equal(thrown.ok, false);

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () =>
      jsonResponse({
        data: [
          {
            id: "evt-brake",
            startMs: "2026-09-20T14:10:00.000Z",
            asset: { id: "veh-12" },
            behaviorLabels: [{ label: "Braking" }],
            eventState: "needsReview",
          },
          {
            id: "evt-late",
            startMs: "2026-09-20T19:30:00.000Z",
            asset: { id: "veh-12" },
            behaviorLabels: [{ label: "HarshTurn" }],
          },
          {
            id: "evt-other-truck",
            startMs: "2026-09-20T14:00:00.000Z",
            asset: { id: "veh-99" },
            behaviorLabels: [{ label: "Crash" }],
          },
        ],
        pagination: { hasNextPage: false, endCursor: "" },
      })) as typeof fetch;
    const live = await safety.listLoadSamsaraSafety(safetyLoad, now);
    assert.equal(live.ok, true);
    assert.deepEqual(
      live.events.map((event) => event.id),
      ["evt-late", "evt-brake"],
    );
    assert.equal(live.events[1]?.title, "Braking");
    assert.equal(live.events[0]?.title, "Harsh turn");
    assert.match(live.events[1]?.detail ?? "", /evt-brake/);
    const timeline = withSamsaraSafetyEvents([], live.events);
    assert.equal(timeline[0]?.title, "Harsh turn");
    assert.match(timeline[1]?.detail ?? "", /event evt-brake/);
    assert.equal(queries.getLoad(safetyLoad)?.status, "in_transit");

    getDb().prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(safetyLoad);
    safety.resetSamsaraSafetyCacheForTests();
    const afterDelivery = await safety.listLoadSamsaraSafety(safetyLoad, new Date("2026-09-21T12:00:00.000Z"));
    assert.deepEqual(
      afterDelivery.events.map((event) => event.id),
      ["evt-brake"],
      "closed load keeps the delivery window and does not pull later events",
    );

    safety.resetSamsaraSafetyCacheForTests();
    let pageCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      pageCalls += 1;
      const after = new URL(requestUrl(input)).searchParams.get("after");
      const n = after ? Number(after) : 1;
      return jsonResponse({
        data: [
          {
            id: `page-${n}`,
            startMs: "2026-09-20T14:00:00.000Z",
            asset: { id: "veh-12" },
            behaviorLabels: [{ label: "Braking" }],
          },
        ],
        pagination: { hasNextPage: true, endCursor: String(n + 1) },
      });
    }) as typeof fetch;
    const paged = await safety.listTruckSamsaraSafety("veh-12", new Date("2026-09-21T00:00:00.000Z"));
    assert.equal(pageCalls, shared.SAMSARA_SAFETY_PAGE_CAP);
    assert.equal(paged.truncated, true);
    assert.equal(paged.events.length, shared.SAMSARA_SAFETY_PAGE_CAP);
    assert.match(paged.events[0]?.detail ?? "", /event page-/);

    safety.resetSamsaraSafetyCacheForTests();
    globalThis.fetch = (async () =>
      jsonResponse({ data: [], pagination: { hasNextPage: false, endCursor: "" } })) as typeof fetch;
    const none = await safety.listTruckSamsaraSafety("veh-12", new Date("2026-09-21T00:00:00.000Z"));
    assert.equal(none.reason, "empty");
    assert.deepEqual(none.events, [], "empty Samsara page must not invent events");

    let windowFetches = 0;
    globalThis.fetch = (async () => {
      windowFetches += 1;
      return jsonResponse({ data: [] });
    }) as typeof fetch;
    getDb().prepare("UPDATE loads SET pickup_start = '', pickup_end = '' WHERE id = ?").run(safetyLoad);
    safety.resetSamsaraSafetyCacheForTests();
    const noWindow = await safety.listLoadSamsaraSafety(safetyLoad, now);
    assert.equal(noWindow.reason, "no_window");
    assert.equal(noWindow.events.length, 0);
    assert.match(noWindow.message, /pickup/);
    assert.equal(windowFetches, 0, "bad load window must not call Samsara");

    const missingLoad = await safety.listLoadSamsaraSafety(-1, now);
    assert.equal(missingLoad.reason, "unavailable");
    assert.equal(missingLoad.events.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedToken == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = savedToken;
    safety.resetSamsaraSafetyCacheForTests();
    closeDb();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  }

  console.log("Samsara safety events test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
