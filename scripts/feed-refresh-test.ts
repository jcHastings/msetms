import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { authorizeCronRequest, cronTokensMatch, isLoopbackAddress } from "../lib/cron-auth";
import { formatAgo } from "../lib/format";
import {
  CLOSED_LOAD_STATUSES,
  evaluateFreshness,
  FUEL_STALE_MS,
  GPS_STALE_MS,
  healthcheckTarget,
  isBusinessDay,
  ORBCOMM_STALE_MS,
  qboRefreshPath,
  readFreshnessSnapshot,
  runFeedFreshness,
  SAMSARA_WEBHOOK_STALE_MS,
} from "../server/deploy/msetms-feed-freshness.mjs";

const NOW = Date.parse("2026-10-07T15:00:00.000Z");

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function loopback(extra: Partial<Parameters<typeof authorizeCronRequest>[0]> = {}) {
  return authorizeCronRequest({
    expectedToken: "cron-test-token",
    authorizationHeader: "Bearer cron-test-token",
    hostHeader: "127.0.0.1:3000",
    requestHostname: "127.0.0.1",
    forwardedFor: null,
    realIp: null,
    cfConnectingIp: null,
    ...extra,
  });
}

function freshSnapshot(over: Record<string, unknown> = {}) {
  return {
    orbcommNewest: ago(30 * 60 * 1000),
    activeReeferLoad: true,
    webhookNewest: ago(2 * 60 * 60 * 1000),
    gpsRecordedAts: [ago(30 * 60 * 1000)],
    fuelNewest: ago(2 * 60 * 60 * 1000),
    qboRefreshExists: true,
    ...over,
  };
}

async function main() {
  assert.equal(ORBCOMM_STALE_MS, 60 * 60 * 1000);
  assert.equal(SAMSARA_WEBHOOK_STALE_MS, 24 * 60 * 60 * 1000);
  assert.equal(GPS_STALE_MS, 3 * 60 * 60 * 1000);
  assert.equal(FUEL_STALE_MS, 26 * 60 * 60 * 1000);
  assert.deepEqual(CLOSED_LOAD_STATUSES, ["delivered", "completed", "accounting", "cancelled"]);

  assert.equal(cronTokensMatch("cron-test-token", "cron-test-token"), true);
  assert.equal(cronTokensMatch("cron-test-token", "other-token"), false);
  assert.equal(cronTokensMatch("cron-test-token", "cron-test-token-extra"), false);
  assert.equal(cronTokensMatch("a", ""), false);
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("127.8.8.8"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("localhost"), true);
  assert.equal(isLoopbackAddress("10.0.0.8"), false);
  assert.equal(loopback().ok, true);
  assert.equal(loopback({ hostHeader: "[::1]:3000", requestHostname: "::1" }).ok, true);
  const publicHost = loopback({ hostHeader: "msetms.example", requestHostname: "msetms.example" });
  assert.equal(publicHost.ok, false);
  if (!publicHost.ok) assert.equal(publicHost.status, 403);
  const forwarded = loopback({ forwardedFor: "203.0.113.5" });
  assert.equal(forwarded.ok, false);
  if (!forwarded.ok) assert.equal(forwarded.status, 403);
  const tunnel = loopback({ cfConnectingIp: "203.0.113.8" });
  assert.equal(tunnel.ok, false);
  if (!tunnel.ok) assert.equal(tunnel.status, 403);
  const wrong = loopback({ authorizationHeader: "Bearer nope" });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 401);
  const disabled = loopback({ expectedToken: "  " });
  assert.equal(disabled.ok, false);
  if (!disabled.ok) assert.equal(disabled.status, 503);
  assert.equal(loopback({ forwardedFor: "127.0.0.1" }).ok, true);

  const healthy = evaluateFreshness(freshSnapshot(), NOW);
  for (const feed of ["orbcomm", "samsara", "gps", "fuel", "qbo"] as const) {
    assert.equal(healthy[feed].ok, true, feed);
    assert.equal(healthy[feed].reason, "");
  }
  assert.equal(evaluateFreshness(freshSnapshot({ orbcommNewest: ago(ORBCOMM_STALE_MS) }), NOW).orbcomm.ok, true);
  assert.equal(
    evaluateFreshness(freshSnapshot({ orbcommNewest: ago(ORBCOMM_STALE_MS + 1) }), NOW).orbcomm.reason,
    "reading older than 60 min",
  );
  assert.equal(evaluateFreshness(freshSnapshot({ orbcommNewest: null }), NOW).orbcomm.reason, "no reading");
  assert.equal(
    evaluateFreshness(freshSnapshot({ activeReeferLoad: false, orbcommNewest: ago(5 * ORBCOMM_STALE_MS) }), NOW).orbcomm.ok,
    true,
  );
  assert.equal(
    evaluateFreshness(freshSnapshot({ webhookNewest: ago(SAMSARA_WEBHOOK_STALE_MS) }), NOW).samsara.ok,
    true,
  );
  assert.equal(
    evaluateFreshness(freshSnapshot({ webhookNewest: ago(SAMSARA_WEBHOOK_STALE_MS + 1) }), NOW).samsara.reason,
    "webhook older than 24h",
  );
  assert.equal(evaluateFreshness(freshSnapshot({ webhookNewest: null }), NOW).samsara.reason, "no webhook");
  assert.equal(evaluateFreshness(freshSnapshot({ gpsRecordedAts: [ago(GPS_STALE_MS)] }), NOW).gps.ok, true);
  assert.equal(
    evaluateFreshness(freshSnapshot({ gpsRecordedAts: [ago(GPS_STALE_MS + 1)] }), NOW).gps.reason,
    "gps older than 3h",
  );
  assert.equal(evaluateFreshness(freshSnapshot({ gpsRecordedAts: [""] }), NOW).gps.reason, "gps missing");
  assert.equal(evaluateFreshness(freshSnapshot({ gpsRecordedAts: [] }), NOW).gps.ok, true);
  assert.equal(isBusinessDay(new Date("2026-10-07T15:00:00.000Z")), true);
  assert.equal(isBusinessDay(new Date("2026-10-10T15:00:00.000Z")), false);
  assert.equal(isBusinessDay(new Date("2026-10-12T03:30:00.000Z")), false);
  assert.equal(isBusinessDay(new Date("2026-10-12T12:00:00.000Z")), true);
  const weekend = Date.parse("2026-10-10T15:00:00.000Z");
  assert.equal(
    evaluateFreshness(freshSnapshot({ fuelNewest: ago(10 * FUEL_STALE_MS) }), weekend).fuel.ok,
    true,
  );
  assert.equal(evaluateFreshness(freshSnapshot({ fuelNewest: ago(FUEL_STALE_MS) }), NOW).fuel.ok, true);
  assert.equal(
    evaluateFreshness(freshSnapshot({ fuelNewest: ago(FUEL_STALE_MS + 1) }), NOW).fuel.reason,
    "fuel import older than 26h",
  );
  assert.equal(evaluateFreshness(freshSnapshot({ fuelNewest: null }), NOW).fuel.reason, "no fuel import");
  assert.equal(evaluateFreshness(freshSnapshot({ qboRefreshExists: false }), NOW).qbo.reason, "qbo-refresh.json missing");
  assert.equal(formatAgo(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW), "5 min ago");

  const root = process.cwd();
  const refreshUnit = fs.readFileSync(path.join(root, "server/deploy/msetms-feed-refresh.timer"), "utf8");
  const freshUnit = fs.readFileSync(path.join(root, "server/deploy/msetms-feed-freshness.timer"), "utf8");
  const refreshService = fs.readFileSync(path.join(root, "server/deploy/msetms-feed-refresh.service"), "utf8");
  const freshService = fs.readFileSync(path.join(root, "server/deploy/msetms-feed-freshness.service"), "utf8");
  const refreshBin = fs.readFileSync(path.join(root, "server/deploy/msetms-feed-refresh"), "utf8");
  assert.match(refreshUnit, /OnCalendar=\*:0\/10/);
  assert.match(refreshUnit, /Persistent=true/);
  assert.match(freshUnit, /OnCalendar=\*:0\/15/);
  assert.match(freshUnit, /Persistent=true/);
  assert.match(refreshService, /EnvironmentFile=\/etc\/msetms\/msetms\.env/);
  assert.match(refreshService, /User=msetms/);
  assert.match(freshService, /User=msetms/);
  assert.match(freshService, /TMS_DB_PATH=\/srv\/msetms\/shared\/data\/tms\.db/);
  assert.match(refreshBin, /http:\/\/127\.0\.0\.1:3000\/api\/internal\/feeds\/refresh/);
  assert.match(refreshBin, /-H @"\$hdr"/);
  assert.doesNotMatch(refreshBin, /set -x/);
  assert.doesNotMatch(refreshBin, /echo\s+["']?\$\{?TMS_CRON_TOKEN/);
  assert.doesNotMatch(refreshBin, /Authorization: Bearer \$\{TMS_CRON_TOKEN\}/);
  assert.doesNotMatch(refreshBin.slice(refreshBin.indexOf("\ncurl ")), /TMS_CRON_TOKEN/);
  assert.equal(healthcheckTarget("http://example.test/abc", false), "");
  assert.equal(healthcheckTarget("https://hc-ping.com/uuid", true), "https://hc-ping.com/uuid/fail");
  assert.equal(qboRefreshPath({ TMS_DATA_DIR: "/srv/msetms/shared/data" }), "/srv/msetms/shared/data/qbo-refresh.json");

  const scratch = path.join(os.tmpdir(), `tms-feed-fresh-${Date.now()}-${process.pid}.db`);
  const setup = new DatabaseSync(scratch);
  setup.exec(`
    CREATE TABLE loads (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      equipment TEXT NOT NULL DEFAULT '',
      trailer_id INTEGER,
      truck_id INTEGER,
      reefer_setpoint_f REAL,
      reefer_mode TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE trailers (id INTEGER PRIMARY KEY, type TEXT NOT NULL DEFAULT '');
    CREATE TABLE trucks (id INTEGER PRIMARY KEY, gps_recorded_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE reefer_readings (id INTEGER PRIMARY KEY, source TEXT NOT NULL, recorded_at TEXT NOT NULL);
    CREATE TABLE samsara_webhook_events (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE fuel_import_sources (source_file TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE fuel_transactions (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    INSERT INTO trailers (id, type) VALUES (1, 'reefer');
    INSERT INTO trucks (id, gps_recorded_at) VALUES (1, '2026-10-07T14:00:00.000Z');
    INSERT INTO loads (id, status, equipment, trailer_id, truck_id, reefer_setpoint_f, reefer_mode)
      VALUES (1, 'in_transit', 'reefer_53', 1, 1, 34, 'continuous');
    INSERT INTO loads (id, status, equipment, trailer_id, truck_id) VALUES (2, 'delivered', 'reefer_53', 1, 1);
    INSERT INTO reefer_readings (source, recorded_at) VALUES ('orbcomm', '2026-10-07T14:10:00.000Z');
    INSERT INTO reefer_readings (source, recorded_at) VALUES ('demo', '2026-10-07T14:50:00.000Z');
    INSERT INTO samsara_webhook_events (created_at) VALUES ('2026-10-07T01:00:00.000Z');
    INSERT INTO fuel_import_sources (source_file, created_at) VALUES ('sheet.csv', '2026-10-06T20:00:00.000Z');
    INSERT INTO fuel_transactions (created_at) VALUES ('2026-10-07T12:00:00.000Z');
  `);
  const read = readFreshnessSnapshot(setup);
  assert.equal(read.orbcommNewest, "2026-10-07T14:10:00.000Z");
  assert.equal(read.activeReeferLoad, true);
  assert.equal(read.webhookNewest, "2026-10-07T01:00:00.000Z");
  assert.deepEqual(read.gpsRecordedAts, ["2026-10-07T14:00:00.000Z"]);
  assert.equal(read.fuelNewest, "2026-10-07T12:00:00.000Z");
  setup.close();

  const qboFile = path.join(os.tmpdir(), `qbo-refresh-missing-${process.pid}`);
  const pings: string[] = [];
  const outcome = await runFeedFreshness({
    env: {
      HC_ORBCOMM_URL: "https://hc-ping.com/orb-test",
      HC_QBO_URL: "https://hc-ping.com/qbo-test",
      HC_FUEL_URL: "http://insecure.example/fuel",
      TMS_QBO_REFRESH_PATH: qboFile,
    },
    dbPath: scratch,
    now: NOW,
    exists: () => false,
    fetchImpl: async (url: string, init?: { body?: string }) => {
      pings.push(`${url} ${init?.body ?? ""}`);
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(outcome.results.qbo.ok, false);
  assert.equal(outcome.exitCode, 1);
  assert.equal(pings.length, 2);
  assert.match(pings.join("\n"), /https:\/\/hc-ping\.com\/orb-test /);
  assert.match(pings.join("\n"), /https:\/\/hc-ping\.com\/qbo-test\/fail qbo-refresh\.json missing/);
  assert.doesNotMatch(pings.join("\n"), /insecure\.example/);

  const quiet = await runFeedFreshness({
    env: {},
    dbPath: scratch,
    now: NOW,
    exists: () => false,
    fetchImpl: async () => {
      throw new Error("should not ping");
    },
  });
  assert.equal(quiet.exitCode, 0);

  const dbPath = path.join(os.tmpdir(), `tms-feed-dedupe-${Date.now()}-${process.pid}.db`);
  process.env.TMS_DB_PATH = dbPath;
  process.env.TMS_SKIP_SEED = "1";
  delete process.env.TMS_REEFER_RETENTION_DAYS;
  delete process.env.TMS_CRON_TOKEN;
  delete process.env.ORBCOMM_USERNAME;
  delete process.env.ORBCOMM_PASSWORD;
  delete process.env.ORBCOMM_ACCOUNT_ID;
  const orbcomm = await import("../lib/integrations/orbcomm");
  const db = await import("../lib/db");
  assert.equal(orbcomm.reeferRetentionDays(), null);

  const base = {
    loadId: null,
    truckId: null,
    tractorId: "",
    trailerId: "UNIT-TEST-1",
    setpointF: 34,
    temperatureF: 34.2,
    returnAirF: 34.1,
    supplyAirF: 33.8,
    doorOpen: null,
    powerOn: true,
    operatingMode: "Power On",
    alarm: "",
    latitude: 41.25,
    longitude: -95.93,
    address: "Omaha, NE",
    source: "orbcomm" as const,
    recordedAt: "2026-10-07T12:00:00.000Z",
    messageTimeKnown: true,
  };
  assert.equal(orbcomm.persistLiveReeferReadings([base], []), 1);
  assert.equal(orbcomm.persistLiveReeferReadings([base], []), 0);
  assert.equal(
    orbcomm.persistLiveReeferReadings([{ ...base, recordedAt: "2026-10-07T11:00:00.000Z" }], []),
    0,
  );
  assert.equal(
    orbcomm.persistLiveReeferReadings([{ ...base, recordedAt: "2026-10-07T12:10:00.000Z" }], []),
    1,
  );
  assert.equal(
    orbcomm.persistLiveReeferReadings([
      { ...base, recordedAt: "2026-10-07T12:20:00.000Z", messageTimeKnown: false, returnAirF: 34.1 },
    ], []),
    0,
  );
  assert.equal(
    orbcomm.persistLiveReeferReadings([
      { ...base, recordedAt: "2026-10-07T12:05:00.000Z", returnAirF: 40, address: "Lincoln, NE" },
    ], []),
    1,
  );
  const last = orbcomm.shouldSkipUnchangedReefer(
    { ...base, recordedAt: "2026-10-07T12:30:00.000Z", messageTimeKnown: true, returnAirF: 40, address: "Lincoln, NE" },
    {
      id: 1,
      load_id: null,
      truck_id: null,
      trailer_id: "UNIT-TEST-1",
      setpoint_f: 34,
      temperature_f: 34.2,
      return_air_f: 40,
      supply_air_f: 33.8,
      door_open: null,
      alarm: "",
      operating_mode: "Power On",
      latitude: 41.25,
      longitude: -95.93,
      address: "Lincoln, NE",
      source: "orbcomm",
      recorded_at: "2026-10-07T12:05:00.000Z",
    },
  );
  assert.equal(last, false);

  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "UNIT-TEST-1",
    setpoint_f: 34,
    temperature_f: 1,
    return_air_f: 1,
    supply_air_f: 1,
    door_open: null,
    alarm: "",
    operating_mode: "old",
    latitude: 1,
    longitude: 1,
    address: "Old",
    source: "orbcomm",
    recorded_at: "2020-01-01T00:00:00.000Z",
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "UNIT-DEMO",
    setpoint_f: 34,
    temperature_f: 1,
    return_air_f: 1,
    supply_air_f: 1,
    door_open: null,
    alarm: "",
    operating_mode: "",
    latitude: null,
    longitude: null,
    address: "",
    source: "demo",
    recorded_at: "2020-01-01T00:00:00.000Z",
  });
  assert.equal(orbcomm.pruneOrbcommReadingsIfEnabled(NOW), 0);
  const before = db.getDb().prepare("SELECT COUNT(*) AS count FROM reefer_readings").get() as { count: number };
  process.env.TMS_REEFER_RETENTION_DAYS = "30";
  assert.equal(orbcomm.reeferRetentionDays(), 30);
  const pruned = orbcomm.pruneOrbcommReadingsIfEnabled(NOW);
  assert.ok(pruned >= 1);
  const oldOrbcomm = db
    .getDb()
    .prepare("SELECT COUNT(*) AS count FROM reefer_readings WHERE source = 'orbcomm' AND recorded_at < '2026-01-01'")
    .get() as { count: number };
  const demoLeft = db
    .getDb()
    .prepare("SELECT COUNT(*) AS count FROM reefer_readings WHERE source = 'demo'")
    .get() as { count: number };
  assert.equal(oldOrbcomm.count, 0);
  assert.equal(demoLeft.count, 1);
  delete process.env.TMS_REEFER_RETENTION_DAYS;
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "UNIT-TEST-1",
    setpoint_f: 0,
    temperature_f: 0,
    return_air_f: 0,
    supply_air_f: 0,
    door_open: null,
    alarm: "",
    operating_mode: "kept",
    latitude: 0,
    longitude: 0,
    address: "kept",
    source: "orbcomm",
    recorded_at: "2020-06-01T00:00:00.000Z",
  });
  assert.equal(orbcomm.pruneOrbcommReadingsIfEnabled(NOW), 0);
  assert.equal(orbcomm.reeferRetentionDays(), null);
  assert.ok(before.count > 0);

  process.env.TMS_CRON_TOKEN = "cron-test-token";
  const route = await import("../app/api/internal/feeds/refresh/route");
  const forbidden = await route.POST(
    new Request("http://msetms.example/api/internal/feeds/refresh", {
      method: "POST",
      headers: { host: "msetms.example", authorization: "Bearer cron-test-token" },
    }),
  );
  assert.equal(forbidden.status, 403);
  const unauthorized = await route.POST(
    new Request("http://127.0.0.1:3000/api/internal/feeds/refresh", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", authorization: "Bearer wrong-token" },
    }),
  );
  assert.equal(unauthorized.status, 401);
  delete process.env.TMS_CRON_TOKEN;
  const off = await route.POST(
    new Request("http://127.0.0.1:3000/api/internal/feeds/refresh", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", authorization: "Bearer cron-test-token" },
    }),
  );
  assert.equal(off.status, 503);
  const bodies = [await forbidden.json(), await unauthorized.json(), await off.json()] as Array<{ error?: string }>;
  for (const body of bodies) assert.doesNotMatch(JSON.stringify(body), /cron-test-token/);

  const perfPath = path.join(os.tmpdir(), `tms-feed-perf-${Date.now()}-${process.pid}.db`);
  process.env.TMS_DB_PATH = perfPath;
  process.env.TMS_SKIP_SEED = "1";
  process.env.SAMSARA_API_TOKEN = "synthetic-fleet-token";
  const perfDb = await import("../lib/db");
  perfDb.closeDb();
  const database = perfDb.getDb();
  const stamp = "2026-10-01T12:00:00.000Z";
  database.prepare("INSERT INTO customers (name, created_at, updated_at) VALUES ('Perf', ?, ?)").run(stamp, stamp);
  const customerId = Number(
    (database.prepare("SELECT id FROM customers ORDER BY id DESC LIMIT 1").get() as { id: number }).id,
  );
  const insTruck = database.prepare(
    `INSERT INTO trucks (unit_number, type, capacity_lbs, status, samsara_vehicle_id, created_at, updated_at)
     VALUES (?, 'sleeper', 45000, 'available', ?, ?, ?)`,
  );
  const insLoad = database.prepare(
    `INSERT INTO loads (load_number, customer_id, origin, destination, pickup_start, pickup_end, delivery_start, delivery_end, status, truck_id, created_at, updated_at)
     VALUES (?, ?, 'A', 'B', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insStop = database.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, city, state)
     VALUES (?, ?, ?, ?, 'Hastings', 'NE')`,
  );
  const insLoc = database.prepare(
    `INSERT INTO locations (name, street, city, state, zip, phone, notes, role, created_at, updated_at)
     VALUES (?, '', 'Hastings', 'NE', '', '', '', 'both', ?, ?)`,
  );
  const insPing = database.prepare(
    `INSERT INTO truck_gps_readings (truck_id, recorded_at, latitude, longitude, address, source)
     VALUES (?, ?, ?, ?, '', 'samsara')`,
  );
  const trucks = 40;
  const loadsPerTruck = 30;
  const pingCount = 250;
  database.exec("BEGIN");
  for (let i = 0; i < 600; i += 1) insLoc.run(`Warehouse ${i} Cold Storage`, stamp, stamp);
  for (let t = 0; t < trucks; t += 1) {
    const truckId = Number(insTruck.run(`P${t}`, `veh-${t}`, stamp, stamp).lastInsertRowid);
    for (let p = 0; p < pingCount; p += 1) {
      insPing.run(truckId, new Date(Date.UTC(2024, 0, 1, 0, p)).toISOString(), 41 + (p % 10) * 0.01, -96);
    }
    for (let l = 0; l < loadsPerTruck; l += 1) {
      const loadId = Number(
        insLoad.run(
          `PERF-${t}-${l}`,
          customerId,
          stamp,
          stamp,
          stamp,
          stamp,
          l < 2 ? "in_transit" : "delivered",
          truckId,
          stamp,
          stamp,
        ).lastInsertRowid,
      );
      for (let s = 0; s < 4; s += 1) {
        insStop.run(loadId, s, s % 2 ? "delivery" : "pickup", `Dock ${t}-${l}-${s} Cold`);
      }
    }
  }
  database.exec("COMMIT");

  const fleetVehicles = Array.from({ length: 400 }, (_, index) => ({
    id: `veh-${index}`,
    name: `Unit ${index}`,
    gps: [
      {
        latitude: 41.25,
        longitude: -96.1,
        speedMilesPerHour: 12,
        time: "2026-10-09T12:00:00.000Z",
        reverseGeo: { formattedLocation: "Omaha, NE" },
      },
    ],
    engineStates: [{ value: "On" }],
    obdOdometerMeters: [{ value: 160934, time: "2026-10-09T12:00:00.000Z" }],
  }));
  const routeEntries = Array.from({ length: 1500 }, (_, index) => ({
    route: {
      id: `route-${index}`,
      externalIds: { msetms: index < 3 ? `PERF-0-${index}` : `HIST-${index}` },
      stops: [
        { id: "1", state: "departed" },
        { id: "2", state: "en route", eta: "2026-10-09T18:00:00.000Z" },
      ],
    },
  }));
  const previousFetch = globalThis.fetch;
  let overlap: { busy?: boolean } | null = null;
  const { refreshIntegrationFeeds } = await import("../lib/feed-refresh");
  const samsara = await import("../lib/integrations/samsara");
  samsara.resetSamsaraCacheForTests();
  globalThis.fetch = async (input) => {
    const href = input instanceof URL ? input.href : String(input);
    if (href.includes("/fleet/vehicles/stats") && !overlap) {
      overlap = await refreshIntegrationFeeds();
    }
    let body: unknown = { code: 1000, accessToken: "synthetic", data: [] };
    if (href.includes("/fleet/routes/audit-logs/feed")) {
      body = { data: routeEntries, pagination: { endCursor: "feed-end", hasNextPage: false } };
    } else if (href.includes("/fleet/vehicles/stats") || href.includes("/fleet/vehicles?")) {
      body = { data: fleetVehicles, pagination: { hasNextPage: false, endCursor: "" } };
    } else if (href.includes("/fleet/hos/clocks")) {
      body = { data: [], pagination: { hasNextPage: false } };
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const started = Date.now();
  const summary = await refreshIntegrationFeeds();
  const elapsed = Date.now() - started;
  globalThis.fetch = previousFetch;
  delete process.env.SAMSARA_API_TOKEN;
  assert.equal(overlap?.busy, true);
  assert.equal(summary.busy, undefined);
  assert.ok(summary.saved.fleet >= trucks, `fleet saved ${summary.saved.fleet}`);
  assert.ok(summary.saved.routes >= 1, `routes saved ${summary.saved.routes}`);
  assert.ok(elapsed < 2000, `large samsara refresh took ${elapsed}ms`);
  assert.ok(!summary.errors.some((error) => error.startsWith("fleet:") || error.startsWith("routes:")));

  db.closeDb();
  fs.rmSync(scratch, { force: true });
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(perfPath, { force: true });
  fs.rmSync(`${perfPath}-wal`, { force: true });
  fs.rmSync(`${perfPath}-shm`, { force: true });
  console.log("feed-refresh-test ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
