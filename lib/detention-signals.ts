/** Read-only lookups for the detention end clock. */

import { getDb } from "./db";
import { resolveDetentionEnd, type DetentionEnd } from "./detention-end";
import { classifyOrbcommReeferMode } from "./fleet-map-shared";
import type { LoadStop } from "./stops";

/** Earliest POD on file at or after arrival. Upload time stands in for the signed time. */
export function podTimeForStop(loadId: number, arrivedAt: string): string {
  const row = getDb()
    .prepare(
      `SELECT MIN(created_at) AS at FROM attachments
       WHERE load_id = ? AND kind = 'pod' AND (? = '' OR created_at >= ?)`,
    )
    .get(loadId, arrivedAt, arrivedAt) as { at?: string | null } | undefined;
  const fromFile = String(row?.at ?? "").trim();
  if (fromFile) return fromFile;
  const load = getDb()
    .prepare("SELECT pod_outcome, pod_recorded_at FROM loads WHERE id = ?")
    .get(loadId) as { pod_outcome?: string; pod_recorded_at?: string } | undefined;
  return load?.pod_outcome === "photo" ? String(load.pod_recorded_at ?? "").trim() : "";
}

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[\s_\-#]/g, "");
}

type ReeferRow = { operating_mode?: string; recorded_at?: string };

/**
 * First Orbcomm reefer running -> off for the load's trailer while the truck is at the stop.
 * A reefer that was already off when the truck arrived is not an unload signal.
 */
export function reeferOffAtStop(loadId: number, arrivedAt: string, departedAt: string): string {
  const arrived = Date.parse(arrivedAt);
  if (!Number.isFinite(arrived)) return "";
  const departed = Date.parse(departedAt);
  const trailer = getDb()
    .prepare(
      `SELECT t.unit_number, t.orbcomm_asset_id FROM loads l
       JOIN trailers t ON t.id = l.trailer_id WHERE l.id = ?`,
    )
    .get(loadId) as { unit_number?: string; orbcomm_asset_id?: string } | undefined;
  const keys = [trailer?.orbcomm_asset_id, trailer?.unit_number].map(normalizeKey).filter(Boolean);
  const normalized =
    "lower(replace(replace(replace(replace(trailer_id, ' ', ''), '_', ''), '-', ''), '#', ''))";
  const since = new Date(arrived - 12 * 60 * 60 * 1000).toISOString();
  const until = Number.isFinite(departed) ? new Date(departed).toISOString() : "9999-12-31T00:00:00.000Z";
  const byTrailer = keys.length
    ? `(trailer_id != '' AND ${normalized} IN (${keys.map(() => "?").join(", ")}))`
    : "0";
  const rows = getDb()
    .prepare(
      `SELECT operating_mode, recorded_at FROM reefer_readings
       WHERE (${byTrailer} OR load_id = ?) AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at ASC, id ASC`,
    )
    .all(...keys, loadId, since, until) as ReeferRow[];
  let running = false;
  for (const row of rows) {
    const at = Date.parse(String(row.recorded_at ?? ""));
    if (!Number.isFinite(at)) continue;
    const mode = classifyOrbcommReeferMode(row.operating_mode);
    if (mode === "running") {
      running = true;
      continue;
    }
    if ((mode === "off" || mode === "shutdown") && running && at >= arrived) {
      return new Date(at).toISOString();
    }
    if (mode === "off" || mode === "shutdown") running = false;
  }
  return "";
}

/** Detention end for one stop from the driver tap, POD, reefer, and GPS depart. */
export function detentionEndForStop(stop: LoadStop): DetentionEnd {
  const arrived = String(stop.arrived_at ?? "").trim();
  const departed = String(stop.departed_at ?? "").trim();
  return resolveDetentionEnd({
    arrivedAt: arrived,
    departedAt: departed,
    emptiedAt: stop.emptied_at,
    podAt: arrived ? podTimeForStop(stop.load_id, arrived) : "",
    reeferOffAt: arrived ? reeferOffAtStop(stop.load_id, arrived, departed) : "",
    deskPick: stop.detention_end_pick,
  });
}
