import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-samsara-routes-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";

type Call = { url: string; method: string; body: Record<string, unknown> | null; auth: string };

function callsOf(seen: Call[]) {
  return {
    postRoutes: () => seen.filter((call) => call.method === "POST" && call.url.endsWith("/fleet/routes")),
    patchRoutes: () => seen.filter((call) => call.method === "PATCH" && call.url.includes("/fleet/routes/")),
    postAddresses: () => seen.filter((call) => call.method === "POST" && call.url.endsWith("/addresses")),
    feed: () => seen.filter((call) => call.url.includes("/fleet/routes/audit-logs/feed")),
  };
}

function mockFetch(seen: Call[], handle: (call: Call) => { status: number; json: unknown }): typeof fetch {
  return (async (input, init) => {
    const headers = init?.headers;
    const auth =
      headers && typeof headers === "object" && !Array.isArray(headers) && "Authorization" in headers
        ? String((headers as { Authorization?: string }).Authorization ?? "")
        : "";
    const call: Call = {
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      auth,
    };
    seen.push(call);
    const result = handle(call);
    return new Response(JSON.stringify(result.json), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function main(): Promise<void> {
  const queries = await import("../lib/queries");
  const stops = await import("../lib/stops");
  const routes = await import("../lib/integrations/samsara-routes");
  const shared = await import("../lib/samsara-routes-shared");
  const { formatDateTime } = await import("../lib/format");

  const actions = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  const relayActions = fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8");
  const editor = fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8");
  const client = fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara-routes.ts"), "utf8");
  assert.equal((actions.match(/await mirrorSamsaraRouteQuiet/g) ?? []).length, 3);
  assert.match(relayActions, /mirrorSamsaraRouteQuiet/);
  assert.match(editor, /Samsara route/);
  assert.match(editor, /SamsaraRouteBadge/);
  assert.match(client, /\/fleet\/routes\/audit-logs\/feed/);
  assert.match(client, /expand=route|expand", "route"/);
  assert.match(client, /POST", "\/fleet\/routes"/);
  assert.match(client, /PATCH", `\/fleet\/routes\//);
  assert.match(client, /\/addresses\/\$\{samsaraExternalPath\(String\(locationId\)\)\}/);
  assert.doesNotMatch(client, /POST", "\/addresses"/);
  assert.doesNotMatch(client, /samsaraAddressBody/);

  const bare = shared.samsaraStopBody(
    {
      externalValue: "stop-x",
      name: "Dock",
      kind: "delivery",
      locationId: null,
      formattedAddress: "1 Main St, Bayonne, NJ 07002",
      latitude: 40.66,
      longitude: -74.11,
      samsaraAddressId: "",
      arrival: "",
      departure: "",
    },
    null,
    1,
  );
  assert.ok(bare);
  assert.equal(bare?.singleUseLocation?.latitude, 40.66);
  assert.equal(bare?.singleUseLocation?.address, "1 Main St, Bayonne, NJ 07002");
  assert.equal(bare?.addressId, undefined);
  assert.equal(bare?.scheduledArrivalTime, undefined);
  assert.equal(bare?.scheduledDepartureTime, undefined);
  assert.equal(bare?.externalIds.msetms, "stop-x");

  const arrival = "2026-09-28T15:00:00.000Z";
  const departure = "2026-09-28T17:00:00.000Z";
  const timedStop = {
    externalValue: "stop-last",
    name: "Last Dock",
    kind: "delivery" as const,
    locationId: null,
    formattedAddress: "9 Pier St, Bayonne, NJ 07002",
    latitude: 40.67,
    longitude: -74.12,
    samsaraAddressId: "",
    arrival,
    departure,
  };
  const lastStop = shared.samsaraStopBody(timedStop, null, 1, 2);
  assert.equal(lastStop?.scheduledArrivalTime, arrival);
  assert.equal(lastStop?.scheduledDepartureTime, undefined);
  const onlyStop = shared.samsaraStopBody({ ...timedStop, kind: "pickup", externalValue: "stop-only" }, null, 0, 1);
  assert.equal(onlyStop?.scheduledArrivalTime, arrival);
  assert.equal(onlyStop?.scheduledDepartureTime, undefined);
  const middleStop = shared.samsaraStopBody({ ...timedStop, externalValue: "stop-mid" }, null, 1, 3);
  assert.equal(middleStop?.scheduledArrivalTime, arrival);
  assert.equal(middleStop?.scheduledDepartureTime, departure);
  const firstStop = shared.samsaraStopBody({ ...timedStop, kind: "pickup", externalValue: "stop-first" }, null, 0, 2);
  assert.equal(firstStop?.scheduledArrivalTime, arrival);
  assert.equal(firstStop?.scheduledDepartureTime, departure);

  const noCoords = shared.samsaraStopBody(
    {
      externalValue: "stop-y",
      name: "Somewhere",
      kind: "pickup",
      locationId: null,
      formattedAddress: "Hastings, NE",
      latitude: null,
      longitude: null,
      samsaraAddressId: "",
      arrival: "2026-09-27T12:00:00.000Z",
      departure: "",
    },
    null,
    0,
  );
  assert.equal(noCoords, null);
  assert.equal(shared.samsaraExternalPath("4"), "msetms:4");

  const reused = shared.samsaraStopBody(
    {
      externalValue: "stop-1",
      name: "Nebraska Cold",
      kind: "pickup",
      locationId: 4,
      formattedAddress: "4100 Industrial Rd, Hastings, NE 68901",
      latitude: 40.586,
      longitude: -98.388,
      samsaraAddressId: "addr-stored",
      arrival: "",
      departure: "",
    },
    "addr-stored",
    0,
  );
  assert.equal(reused?.addressId, "addr-stored");
  assert.equal(reused?.singleUseLocation, undefined);
  assert.equal(reused?.externalIds.msetms, "stop-1");

  const progress = shared.parseRouteProgress({
    id: "route-42",
    externalIds: { msetms: "SO-ROUTE-1" },
    stops: [
      { id: "1", state: "departed", scheduledArrivalTime: "2026-09-27T12:00:00.000Z" },
      {
        id: "2",
        state: "en route",
        scheduledArrivalTime: "2026-09-28T15:00:00.000Z",
        eta: "2026-09-27T18:32:00.000Z",
      },
    ],
  });
  assert.equal(progress?.status, "en route");
  assert.equal(progress?.eta, "2026-09-27T18:32:00.000Z");
  assert.equal(progress?.routeId, "route-42");

  const noEta = shared.parseRouteProgress({
    id: "route-42",
    stops: [{ id: "2", state: "en route", scheduledArrivalTime: "2026-09-28T15:00:00.000Z" }],
  });
  assert.equal(noEta?.status, "en route");
  assert.equal(noEta?.eta, "");
  const cardNoEta = shared.samsaraRouteCard({
    truckAssigned: true,
    driverAssigned: true,
    routeId: "route-42",
    status: "en route",
    eta: "",
    note: "",
  });
  assert.equal(cardNoEta.statusLine, "En route. No ETA from Samsara.");
  assert.equal(cardNoEta.etaLine, "");
  assert.equal(cardNoEta.routeLine, "Route route-42");
  assert.equal(cardNoEta.soft, false);

  const customerId = queries.createCustomer({ name: "Route Broker", billing_notes: "", contacts: [] });
  const truckId = queries.createTruck({
    unit_number: "12",
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "veh-77",
  });
  const bareTruckId = queries.createTruck({
    unit_number: "13",
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "",
  });
  const driverId = queries.createDriver({
    name: "Route Driver",
    phone: "555-0100",
    license: "CDL",
    samsara_driver_id: "drv-88",
    truck_id: null,
    status: "available",
  });
  const pickupId = queries.createLocation({
    name: "Nebraska Cold",
    street: "4100 Industrial Rd",
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
    longitude: -98.388,
  });
  const dropId = queries.createLocation({
    name: "Bayonne Dock",
    street: "1 Port St",
    city: "Bayonne",
    state: "NJ",
    zip: "07002",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 40.668,
    longitude: -74.114,
  });

  function located(name: string, latitude: number | null, longitude: number | null) {
    return queries.createLocation({
      name,
      street: "4100 Industrial Rd",
      city: "Hastings",
      state: "NE",
      zip: "68901",
      phone: "",
      notes: "",
      role: "shipper",
      scheduling_type: "appointment",
      hours: "",
      scheduling_notes: "",
      latitude,
      longitude,
    });
  }

  const pickupStart = "2026-09-27T12:00:00.000Z";
  const pickupEnd = "2026-09-27T14:00:00.000Z";
  const deliveryStart = "2026-09-28T15:00:00.000Z";
  const deliveryEnd = "2026-09-28T17:00:00.000Z";

  function loadInput(extra: { load_number: string; truck_id?: number | null; driver_id?: number | null }) {
    return {
      customer_id: customerId,
      origin: "Hastings, NE",
      destination: "Bayonne, NJ",
      pickup_start: pickupStart,
      pickup_end: pickupEnd,
      delivery_start: deliveryStart,
      delivery_end: deliveryEnd,
      weight: 40000,
      commodity: "Frozen",
      rate: 2200,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "available",
      truck_id: extra.truck_id ?? null,
      driver_id: extra.driver_id ?? null,
      load_number: extra.load_number,
    };
  }

  const missingId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-MISS", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(missingId, truckId, driverId);
  const missing = await routes.syncSamsaraRouteForLoad(missingId, { token: "" });
  assert.equal(missing.ok, true);
  assert.equal(missing.mirrored, false);
  assert.equal(queries.getLoad(missingId)?.samsara_route_note, shared.SAMSARA_ROUTE_MESSAGES.token);
  assert.equal(queries.getLoad(missingId)?.status, "assigned");
  assert.equal(queries.getLoad(missingId)?.truck_id, truckId);

  const unmappedId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-UNMAP", truck_id: bareTruckId, driver_id: driverId }));
  queries.assignLoad(unmappedId, bareTruckId, driverId);
  const unmappedSeen: Call[] = [];
  const unmapped = await routes.syncSamsaraRouteForLoad(unmappedId, {
    token: "test-route-token",
    fetchImpl: mockFetch(unmappedSeen, () => ({ status: 500, json: {} })),
  });
  assert.equal(unmapped.mirrored, false);
  assert.equal(unmappedSeen.length, 0);
  assert.equal(queries.getLoad(unmappedId)?.samsara_route_note, shared.SAMSARA_ROUTE_MESSAGES.unmapped);
  assert.equal(queries.getLoad(unmappedId)?.status, "assigned");
  assert.equal(queries.getLoad(unmappedId)?.truck_id, bareTruckId);

  const thinId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-THIN", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(thinId, truckId, driverId);
  stops.addStop(thinId, { kind: "pickup", name: "Yard", city: "Omaha", state: "NE" });
  stops.addStop(thinId, { kind: "delivery", name: "Dock", city: "Newark", state: "NJ" });
  const thinSeen: Call[] = [];
  const thin = await routes.syncSamsaraRouteForLoad(thinId, {
    token: "test-route-token",
    fetchImpl: mockFetch(thinSeen, () => ({ status: 500, json: {} })),
  });
  assert.equal(thin.mirrored, false);
  assert.equal(thinSeen.length, 0);
  assert.equal(queries.getLoad(thinId)?.samsara_route_note, shared.SAMSARA_ROUTE_MESSAGES.incomplete);
  assert.equal(queries.getLoad(thinId)?.status, "assigned");

  const loadId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-1", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(loadId, truckId, driverId);
  stops.addStop(loadId, {
    kind: "pickup",
    name: "Nebraska Cold",
    city: "Hastings",
    state: "NE",
    location_id: pickupId,
    window_start: pickupStart,
    window_end: pickupEnd,
  });
  stops.addStop(loadId, {
    kind: "delivery",
    name: "Bayonne Dock",
    city: "Bayonne",
    state: "NJ",
    location_id: dropId,
    window_start: deliveryStart,
    window_end: deliveryEnd,
  });

  queries.rememberLocationSamsaraAddressId(pickupId, "addr-pick");
  queries.rememberLocationSamsaraAddressId(pickupId, "addr-other");
  assert.equal(queries.getLocation(pickupId)?.samsara_address_id, "addr-pick");

  const seen: Call[] = [];
  const synced = await routes.syncSamsaraRouteForLoad(loadId, {
    token: "test-route-token",
    fetchImpl: mockFetch(seen, (call) => {
      assert.equal(call.auth, "Bearer test-route-token");
      if (call.method === "GET" && call.url.includes("/addresses/")) {
        assert.equal(call.url, `https://api.samsara.com/addresses/msetms:${dropId}`);
        return { status: 200, json: { data: { id: "addr-drop" } } };
      }
      if (call.method === "POST" && call.url.endsWith("/addresses")) {
        return { status: 500, json: { message: "routing must not create addresses" } };
      }
      if (call.method === "GET" && call.url.includes("/fleet/routes/msetms:")) return { status: 404, json: {} };
      if (call.method === "POST" && call.url.endsWith("/fleet/routes")) {
        return { status: 200, json: { data: { id: "route-42" } } };
      }
      return { status: 500, json: { message: "unexpected" } };
    }),
  });
  assert.equal(synced.mirrored, true);
  assert.equal(synced.routeId, "route-42");
  assert.equal(queries.getLoad(loadId)?.status, "assigned");
  assert.equal(queries.getLoad(loadId)?.samsara_route_id, "route-42");
  assert.equal(queries.getLoad(loadId)?.samsara_route_note, "");
  const posted = callsOf(seen).postRoutes();
  assert.equal(posted.length, 1);
  const routeBody = posted[0]?.body ?? {};
  assert.equal((routeBody.externalIds as { msetms: string }).msetms, "SO-ROUTE-1");
  assert.equal(routeBody.vehicleId, "veh-77");
  assert.equal(routeBody.driverId, "drv-88");
  const routeStops = routeBody.stops as Array<Record<string, unknown>>;
  assert.equal(routeStops.length, 2);
  assert.equal(routeStops[0]?.addressId, "addr-pick");
  assert.equal(routeStops[1]?.addressId, "addr-drop");
  assert.equal(routeStops[0]?.singleUseLocation, undefined);
  assert.equal(routeStops[0]?.scheduledDepartureTime, pickupEnd);
  assert.equal(routeStops[0]?.scheduledArrivalTime, pickupStart);
  assert.equal(routeStops[1]?.scheduledArrivalTime, deliveryStart);
  assert.equal(routeStops[1]?.scheduledDepartureTime, undefined);
  assert.equal(seen.filter((call) => call.url.includes("/addresses/")).length, 1);
  assert.equal(callsOf(seen).postAddresses().length, 0);
  assert.equal(callsOf(seen).patchRoutes().length, 0);
  assert.equal(queries.getLocation(dropId)?.samsara_address_id, "addr-drop");
  assert.equal(queries.getLocation(pickupId)?.samsara_address_id, "addr-pick");

  const seenUpdate: Call[] = [];
  const updated = await routes.syncSamsaraRouteForLoad(loadId, {
    token: "test-route-token",
    fetchImpl: mockFetch(seenUpdate, (call) => {
      if (call.url.includes("/addresses")) return { status: 500, json: { message: "stored ids skip lookup" } };
      if (call.method === "PATCH" && call.url.includes("/fleet/routes/route-42")) {
        return { status: 200, json: { data: { id: "route-42" } } };
      }
      return { status: 500, json: {} };
    }),
  });
  assert.equal(updated.mirrored, true);
  assert.equal(callsOf(seenUpdate).patchRoutes().length, 1);
  assert.equal(callsOf(seenUpdate).postRoutes().length, 0);
  assert.equal(seenUpdate.filter((call) => call.url.includes("/addresses")).length, 0);
  assert.equal(queries.getLoad(loadId)?.truck_id, truckId);

  const deniedId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-DENY", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(deniedId, truckId, driverId);
  stops.addStop(deniedId, {
    kind: "pickup",
    name: "Nebraska Cold",
    city: "Hastings",
    state: "NE",
    location_id: pickupId,
    window_start: pickupStart,
    window_end: pickupEnd,
  });
  stops.addStop(deniedId, {
    kind: "delivery",
    name: "Bayonne Dock",
    city: "Bayonne",
    state: "NJ",
    location_id: dropId,
    window_start: deliveryStart,
    window_end: deliveryEnd,
  });
  const deniedSeen: Call[] = [];
  const denied = await routes.syncSamsaraRouteForLoad(deniedId, {
    token: "test-route-token",
    fetchImpl: mockFetch(deniedSeen, (call) => {
      if (call.url.includes("/addresses")) return { status: 200, json: { data: { id: "addr-ok" } } };
      if (call.method === "GET" && call.url.includes("/fleet/routes/")) return { status: 404, json: {} };
      return { status: 403, json: { message: "forbidden" } };
    }),
  });
  assert.equal(denied.ok, true);
  assert.equal(denied.mirrored, false);
  assert.match(denied.message, /Read Routes \+ Write Routes/);
  assert.equal(queries.getLoad(deniedId)?.status, "assigned");
  assert.equal(queries.getLoad(deniedId)?.samsara_route_id, "");
  assert.equal(deniedSeen.filter((call) => call.url.includes("/addresses")).length, 0);

  const fallPick = located("Fall Pickup", 40.586, -98.388);
  const fallDrop = located("Fall Drop", 40.668, -74.114);
  const fallbackId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-FALL", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(fallbackId, truckId, driverId);
  stops.addStop(fallbackId, {
    kind: "pickup",
    name: "Fall Pickup",
    city: "Hastings",
    state: "NE",
    location_id: fallPick,
    window_start: pickupStart,
    window_end: pickupEnd,
  });
  stops.addStop(fallbackId, {
    kind: "delivery",
    name: "Fall Drop",
    city: "Bayonne",
    state: "NJ",
    location_id: fallDrop,
    window_start: deliveryStart,
    window_end: deliveryEnd,
  });
  const fallbackSeen: Call[] = [];
  const fallback = await routes.syncSamsaraRouteForLoad(fallbackId, {
    token: "test-route-token",
    fetchImpl: mockFetch(fallbackSeen, (call) => {
      if (call.url.includes("/addresses")) return { status: 403, json: {} };
      if (call.method === "GET" && call.url.includes("/fleet/routes/msetms:")) return { status: 404, json: {} };
      if (call.method === "POST" && call.url.endsWith("/fleet/routes")) {
        return { status: 200, json: { data: { id: "route-fall" } } };
      }
      return { status: 500, json: {} };
    }),
  });
  assert.equal(fallback.mirrored, true);
  const fallbackStops = (callsOf(fallbackSeen).postRoutes()[0]?.body?.stops ?? []) as Array<Record<string, unknown>>;
  assert.equal((fallbackStops[0]?.singleUseLocation as { latitude: number }).latitude, 40.586);
  assert.equal(fallbackStops[0]?.addressId, undefined);
  assert.equal(callsOf(fallbackSeen).postAddresses().length, 0);
  assert.equal(queries.getLocation(fallPick)?.samsara_address_id ?? null, null);

  const missPick = located("Miss Pickup", 41.25, -96);
  const missDrop = located("Miss Drop", 40.73, -74.17);
  const missId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-MISSADDR", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(missId, truckId, driverId);
  stops.addStop(missId, {
    kind: "pickup",
    name: "Miss Pickup",
    city: "Hastings",
    state: "NE",
    location_id: missPick,
    window_start: pickupStart,
    window_end: pickupEnd,
  });
  stops.addStop(missId, {
    kind: "delivery",
    name: "Miss Drop",
    city: "Bayonne",
    state: "NJ",
    location_id: missDrop,
    window_start: deliveryStart,
    window_end: deliveryEnd,
  });
  const missSeen: Call[] = [];
  const missed = await routes.syncSamsaraRouteForLoad(missId, {
    token: "test-route-token",
    fetchImpl: mockFetch(missSeen, (call) => {
      if (call.method === "GET" && call.url.includes("/addresses/")) {
        assert.match(call.url, new RegExp(`/addresses/msetms:(${missPick}|${missDrop})$`));
        return { status: 404, json: {} };
      }
      if (call.method === "GET" && call.url.includes("/fleet/routes/msetms:")) return { status: 404, json: {} };
      if (call.method === "POST" && call.url.endsWith("/fleet/routes")) {
        return { status: 200, json: { data: { id: "route-miss" } } };
      }
      return { status: 500, json: {} };
    }),
  });
  assert.equal(missed.mirrored, true);
  const missStops = (callsOf(missSeen).postRoutes()[0]?.body?.stops ?? []) as Array<Record<string, unknown>>;
  assert.equal((missStops[0]?.singleUseLocation as { latitude: number }).latitude, 41.25);
  assert.equal(missStops[0]?.addressId, undefined);
  assert.equal(callsOf(missSeen).postAddresses().length, 0);
  assert.equal(queries.getLocation(missPick)?.samsara_address_id ?? null, null);

  const barePick = located("Bare Pickup", null, null);
  const bareDrop = located("Bare Drop", null, null);
  const bareId = queries.createLoad(loadInput({ load_number: "SO-ROUTE-BARELOC", truck_id: truckId, driver_id: driverId }));
  queries.assignLoad(bareId, truckId, driverId);
  stops.addStop(bareId, {
    kind: "pickup",
    name: "Bare Pickup",
    city: "Hastings",
    state: "NE",
    location_id: barePick,
    window_start: pickupStart,
    window_end: pickupEnd,
  });
  stops.addStop(bareId, {
    kind: "delivery",
    name: "Bare Drop",
    city: "Bayonne",
    state: "NJ",
    location_id: bareDrop,
  });
  const bareSeen: Call[] = [];
  const bareLoc = await routes.syncSamsaraRouteForLoad(bareId, {
    token: "test-route-token",
    fetchImpl: mockFetch(bareSeen, (call) => {
      if (call.url.includes("/addresses")) return { status: 404, json: {} };
      return { status: 500, json: { message: "should not create a route" } };
    }),
  });
  assert.equal(bareLoc.mirrored, false);
  assert.equal(bareLoc.message, shared.SAMSARA_ROUTE_MESSAGES.incomplete);
  assert.equal(callsOf(bareSeen).postRoutes().length, 0);
  assert.equal(callsOf(bareSeen).postAddresses().length, 0);
  assert.equal(queries.getLocation(barePick)?.samsara_address_id ?? null, null);
  assert.equal(queries.getLoad(bareId)?.status, "assigned");

  const boom = await routes.syncSamsaraRouteForLoad(loadId, {
    token: "test-route-token",
    fetchImpl: (async () => {
      throw new Error("socket down");
    }) as typeof fetch,
  });
  assert.equal(boom.ok, true);
  assert.equal(boom.mirrored, false);
  assert.equal(queries.getLoad(loadId)?.status, "assigned");
  assert.equal(queries.getLoad(loadId)?.samsara_route_id, "route-42");

  const eta = "2026-09-27T18:32:00.000Z";
  const progressSeen: Call[] = [];
  const card = await routes.refreshSamsaraRouteProgress(loadId, {
    token: "test-route-token",
    fetchImpl: mockFetch(progressSeen, (call) => {
      if (call.url.includes("/fleet/routes/audit-logs/feed")) {
        assert.match(call.url, /expand=route/);
        return {
          status: 200,
          json: {
            data: [
              {
                operation: "stop ETA updated",
                route: {
                  id: "route-42",
                  externalIds: { msetms: "SO-ROUTE-1" },
                  stops: [{ id: "2", state: "en route", eta, scheduledArrivalTime: deliveryStart }],
                },
              },
            ],
            pagination: { endCursor: "cursor-1", hasNextPage: false },
          },
        };
      }
      if (call.method === "GET" && call.url.includes("/fleet/routes/route-42")) {
        return {
          status: 200,
          json: {
            data: {
              id: "route-42",
              externalIds: { msetms: "SO-ROUTE-1" },
              stops: [
                { id: "1", state: "departed" },
                { id: "2", state: "en route", eta, scheduledArrivalTime: deliveryStart },
              ],
            },
          },
        };
      }
      return { status: 404, json: {} };
    }),
  });
  assert.equal(callsOf(progressSeen).feed().length, 1);
  assert.equal(card.statusLine, "En route.");
  assert.equal(card.etaLine, `ETA ${formatDateTime(eta)}`);
  assert.equal(card.routeLine, "Route route-42");
  assert.equal(card.soft, false);
  assert.doesNotMatch(card.etaLine, /09\/28|2:00/);
  assert.equal(queries.getLoad(loadId)?.samsara_route_eta, eta);
  assert.equal(queries.getLoad(loadId)?.samsara_route_status, "en route");

  const quietSeen: Call[] = [];
  const quiet = await routes.refreshSamsaraRouteProgress(loadId, {
    token: "test-route-token",
    fetchImpl: mockFetch(quietSeen, (call) => {
      if (call.url.includes("/audit-logs/feed")) {
        assert.match(call.url, /after=cursor-1/);
        return {
          status: 200,
          json: {
            data: [
              {
                route: {
                  id: "route-42",
                  externalIds: { msetms: "SO-ROUTE-1" },
                  stops: [{ id: "2", state: "en route", scheduledArrivalTime: deliveryStart }],
                },
              },
            ],
            pagination: { endCursor: "cursor-2", hasNextPage: false },
          },
        };
      }
      return {
        status: 200,
        json: {
          data: {
            id: "route-42",
            stops: [{ id: "2", state: "en route", scheduledArrivalTime: deliveryStart }],
          },
        },
      };
    }),
  });
  assert.equal(quiet.statusLine, "En route. No ETA from Samsara.");
  assert.equal(quiet.etaLine, "");
  assert.equal(queries.getLoad(loadId)?.samsara_route_eta, "");

  queries.saveSamsaraRouteMirror(loadId, { eta, status: "en route", note: "" });
  const deniedRead = await routes.refreshSamsaraRouteProgress(loadId, {
    token: "test-route-token",
    fetchImpl: mockFetch([], () => ({ status: 401, json: {} })),
  });
  assert.equal(deniedRead.soft, true);
  assert.match(deniedRead.statusLine, /Read Routes \+ Write Routes/);
  assert.equal(deniedRead.etaLine, "");
  assert.equal(queries.getLoad(loadId)?.status, "assigned");

  console.log("samsara route mirror ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
