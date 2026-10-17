#!/usr/bin/env node
/**
 * Read-only feed freshness check. Pings one healthchecks.io URL per feed.
 * Skips a feed when its HC_* URL is unset. Never writes the database.
 * Never prints tokens, URLs, or file contents.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const ORBCOMM_STALE_MS = 60 * 60 * 1000;
export const SAMSARA_WEBHOOK_STALE_MS = 24 * 60 * 60 * 1000;
export const GPS_STALE_MS = 3 * 60 * 60 * 1000;
export const FUEL_STALE_MS = 26 * 60 * 60 * 1000;
export const OFFICE_TZ = "America/New_York";
export const CLOSED_LOAD_STATUSES = ["delivered", "completed", "accounting", "cancelled"];

const FEEDS = [
  ["HC_ORBCOMM_URL", "orbcomm"],
  ["HC_SAMSARA_URL", "samsara"],
  ["HC_GPS_URL", "gps"],
  ["HC_FUEL_URL", "fuel"],
  ["HC_QBO_URL", "qbo"],
];

export function isBusinessDay(now, timeZone = OFFICE_TZ) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return weekday !== "Sat" && weekday !== "Sun";
}

function ageMs(iso, now) {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return null;
  return now - ms;
}

function olderThan(iso, now, limit) {
  const age = ageMs(iso, now);
  if (age == null) return true;
  return age > limit;
}

/**
 * @param {{
 *   orbcommNewest: string | null,
 *   activeReeferLoad: boolean,
 *   webhookNewest: string | null,
 *   gpsRecordedAts: string[],
 *   fuelNewest: string | null,
 *   qboRefreshExists: boolean,
 *   orbcommError?: boolean,
 *   webhookError?: boolean,
 *   gpsError?: boolean,
 *   fuelError?: boolean,
 * }} snapshot
 */
export function evaluateFreshness(snapshot, now = Date.now()) {
  const orbcomm = (() => {
    if (snapshot.orbcommError) return { ok: false, reason: "error" };
    if (!snapshot.activeReeferLoad) return { ok: true, reason: "" };
    if (!snapshot.orbcommNewest) return { ok: false, reason: "no reading" };
    if (olderThan(snapshot.orbcommNewest, now, ORBCOMM_STALE_MS)) {
      return { ok: false, reason: "reading older than 60 min" };
    }
    return { ok: true, reason: "" };
  })();

  const samsara = (() => {
    if (snapshot.webhookError) return { ok: false, reason: "error" };
    if (!snapshot.webhookNewest) return { ok: false, reason: "no webhook" };
    if (olderThan(snapshot.webhookNewest, now, SAMSARA_WEBHOOK_STALE_MS)) {
      return { ok: false, reason: "webhook older than 24h" };
    }
    return { ok: true, reason: "" };
  })();

  const gps = (() => {
    if (snapshot.gpsError) return { ok: false, reason: "error" };
    if (snapshot.gpsRecordedAts.length === 0) return { ok: true, reason: "" };
    const missing = snapshot.gpsRecordedAts.some((value) => !String(value ?? "").trim());
    if (missing) return { ok: false, reason: "gps missing" };
    const stale = snapshot.gpsRecordedAts.some((value) => olderThan(value, now, GPS_STALE_MS));
    if (stale) return { ok: false, reason: "gps older than 3h" };
    return { ok: true, reason: "" };
  })();

  const fuel = (() => {
    if (!isBusinessDay(now)) return { ok: true, reason: "" };
    if (snapshot.fuelError) return { ok: false, reason: "error" };
    if (!snapshot.fuelNewest) return { ok: false, reason: "no fuel import" };
    if (olderThan(snapshot.fuelNewest, now, FUEL_STALE_MS)) {
      return { ok: false, reason: "fuel import older than 26h" };
    }
    return { ok: true, reason: "" };
  })();

  const qbo = snapshot.qboRefreshExists
    ? { ok: true, reason: "" }
    : { ok: false, reason: "qbo-refresh.json missing" };

  return { orbcomm, samsara, gps, fuel, qbo };
}

function closedList() {
  return CLOSED_LOAD_STATUSES.map((status) => `'${status}'`).join(", ");
}

function one(db, sql) {
  try {
    const row = db.prepare(sql).get();
    return { row: row && typeof row === "object" ? row : null, error: false };
  } catch {
    return { row: null, error: true };
  }
}

function textField(row, key) {
  if (!row || row[key] == null) return null;
  const value = String(row[key]).trim();
  return value || null;
}

export function readFreshnessSnapshot(db) {
  const closed = closedList();
  const orbcomm = one(
    db,
    `SELECT MAX(recorded_at) AS newest FROM reefer_readings WHERE source = 'orbcomm' AND trim(recorded_at) != ''`,
  );
  const reeferLoads = one(
    db,
    `SELECT COUNT(*) AS count
     FROM loads
     LEFT JOIN trailers ON trailers.id = loads.trailer_id
     WHERE loads.status NOT IN (${closed})
       AND (
         instr(lower(coalesce(loads.equipment, '')), 'reefer') > 0
         OR lower(coalesce(trailers.type, '')) = 'reefer'
         OR loads.reefer_setpoint_f IS NOT NULL
         OR trim(coalesce(loads.reefer_mode, '')) != ''
       )`,
  );
  const webhooks = one(db, `SELECT MAX(created_at) AS newest FROM samsara_webhook_events`);
  const gps = one(
    db,
    `SELECT trucks.gps_recorded_at AS recorded_at
     FROM loads
     JOIN trucks ON trucks.id = loads.truck_id
     WHERE loads.status NOT IN (${closed})`,
  );
  const fuelSources = one(db, `SELECT MAX(created_at) AS newest FROM fuel_import_sources`);
  const fuelRows = one(db, `SELECT MAX(created_at) AS newest FROM fuel_transactions`);
  const fuelNewest = [textField(fuelSources.row, "newest"), textField(fuelRows.row, "newest")]
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  let gpsRecordedAts = [];
  let gpsError = gps.error;
  if (!gpsError) {
    try {
      gpsRecordedAts = db
        .prepare(
          `SELECT trucks.gps_recorded_at AS recorded_at
           FROM loads
           JOIN trucks ON trucks.id = loads.truck_id
           WHERE loads.status NOT IN (${closed})`,
        )
        .all()
        .map((row) => String(row?.recorded_at ?? ""));
    } catch {
      gpsError = true;
    }
  }
  const count = reeferLoads.row ? Number(reeferLoads.row.count ?? 0) : 0;
  return {
    orbcommNewest: textField(orbcomm.row, "newest"),
    activeReeferLoad: !reeferLoads.error && count > 0,
    webhookNewest: textField(webhooks.row, "newest"),
    gpsRecordedAts,
    fuelNewest,
    qboRefreshExists: false,
    orbcommError: orbcomm.error || reeferLoads.error,
    webhookError: webhooks.error,
    gpsError,
    fuelError: fuelSources.error || fuelRows.error,
  };
}

export function qboRefreshPath(env) {
  const override = String(env.TMS_QBO_REFRESH_PATH ?? "").trim();
  if (override) return override;
  const dataDir = String(env.TMS_DATA_DIR ?? "").trim();
  if (dataDir) return join(dataDir, "qbo-refresh.json");
  const dbPath = String(env.TMS_DB_PATH ?? "").trim();
  if (dbPath) return join(dirname(dbPath), "qbo-refresh.json");
  return "";
}

export function healthcheckTarget(baseUrl, failing) {
  const raw = String(baseUrl ?? "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (failing) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/fail`;
  }
  return url.toString();
}

async function ping(baseUrl, reason, fetchImpl) {
  const target = healthcheckTarget(baseUrl, Boolean(reason));
  if (!target) return "skip";
  try {
    const response = await fetchImpl(target, {
      method: "POST",
      body: reason || undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`healthcheck: HTTP ${response.status}`);
      return "error";
    }
    return "ok";
  } catch {
    console.error("healthcheck: error");
    return "error";
  }
}

export async function runFeedFreshness(options) {
  const env = options.env;
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const exists = options.exists ?? existsSync;
  const qboPath = qboRefreshPath(env);
  let snapshot = {
    orbcommNewest: null,
    activeReeferLoad: false,
    webhookNewest: null,
    gpsRecordedAts: [],
    fuelNewest: null,
    qboRefreshExists: Boolean(qboPath) && exists(qboPath),
    orbcommError: true,
    webhookError: true,
    gpsError: true,
    fuelError: true,
  };
  const dbPath = String(options.dbPath ?? env.TMS_DB_PATH ?? "").trim();
  if (dbPath) {
    let db = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const read = readFreshnessSnapshot(db);
      snapshot = { ...read, qboRefreshExists: snapshot.qboRefreshExists };
    } catch {
      console.error("feed-freshness: database unreadable");
    } finally {
      try {
        db?.close();
      } catch {
        /* already closed */
      }
    }
  } else {
    console.error("feed-freshness: database unreadable");
  }
  if (!qboPath) snapshot.qboRefreshExists = false;
  const results = evaluateFreshness(snapshot, now);
  let exitCode = 0;
  for (const [envName, feed] of FEEDS) {
    const url = String(env[envName] ?? "").trim();
    if (!url) continue;
    const check = results[feed];
    if (!check.ok) {
      console.error(`${feed}: ${check.reason}`);
      exitCode = 1;
    }
    const pinged = await ping(url, check.ok ? "" : check.reason, fetchImpl);
    if (pinged === "error") exitCode = 1;
  }
  return { exitCode, results };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  runFeedFreshness({
    env: process.env,
    dbPath: process.env.TMS_DB_PATH || "/srv/msetms/shared/data/tms.db",
    now: Date.now(),
    fetchImpl: fetch,
    exists: existsSync,
  })
    .then((outcome) => {
      process.exit(outcome.exitCode);
    })
    .catch(() => {
      console.error("feed-freshness: error");
      process.exit(1);
    });
}
