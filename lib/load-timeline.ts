import { listLoadAudit, type AuditActorKind } from "./audit";
import { getDb } from "./db";
import { isMaterialReeferReading } from "./exceptions";
import { getLoad } from "./queries";
import type { ReeferReading } from "./types";

export type LoadTimelineSource = "dispatcher" | "driver" | "system" | "samsara" | "orbcomm";

export type LoadTimelineEvent = {
  id: string;
  at: string;
  source: LoadTimelineSource;
  actor: string;
  title: string;
  detail: string;
};

type StopStampRow = {
  id: number;
  kind: string;
  name: string;
  sequence: number;
  arrived_at: string;
  departed_at: string;
};

function sourceForActor(kind: AuditActorKind): LoadTimelineSource {
  if (kind === "driver") return "driver";
  if (kind === "dispatcher") return "dispatcher";
  return "system";
}

function titleForAudit(action: string, field: string): string {
  const key = action.trim() || field.trim() || "update";
  return key.replaceAll("_", " ");
}

function detailForAudit(row: {
  action: string;
  field: string;
  old_value: string;
  new_value: string;
}): string {
  if (row.action === "check_call") return row.new_value;
  if (row.action === "sms") {
    return [row.new_value ? `to ${row.new_value}` : "", row.old_value].filter(Boolean).join(" · ");
  }
  if (row.field === "status" || row.action === "status") {
    return [row.old_value, row.new_value].filter(Boolean).join(" → ");
  }
  return [row.field, row.new_value || row.old_value].filter(Boolean).join(" · ");
}

function stopStamps(loadId: number): StopStampRow[] {
  return getDb()
    .prepare(
      `SELECT id, kind, name, sequence, arrived_at, departed_at
       FROM load_stops
       WHERE load_id = ?
       ORDER BY sequence, id`,
    )
    .all(loadId) as StopStampRow[];
}

function reeferReadingsForLoad(loadId: number): ReeferReading[] {
  return getDb()
    .prepare(
      `SELECT * FROM reefer_readings
       WHERE load_id = ?
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all(loadId) as ReeferReading[];
}

function stopRole(kind: string): string {
  return kind === "delivery" ? "delivery" : "pickup";
}

/** First-class load log: real audit, Samsara arrive/depart stamps, material Orbcomm reefer only. Newest first. */
export function listLoadTimeline(loadId: number): LoadTimelineEvent[] {
  const events: LoadTimelineEvent[] = [];

  for (const row of listLoadAudit(loadId)) {
    events.push({
      id: `audit-${row.id}`,
      at: row.action === "check_call" && row.old_value ? row.old_value : row.created_at,
      source: sourceForActor(row.actor_kind),
      actor: row.actor,
      title: titleForAudit(row.action, row.field),
      detail: detailForAudit(row),
    });
  }

  for (const stop of stopStamps(loadId)) {
    const label = stop.name?.trim() || stopRole(stop.kind);
    const role = stopRole(stop.kind);
    if (String(stop.arrived_at ?? "").trim()) {
      events.push({
        id: `samsara-arrive-${stop.id}`,
        at: stop.arrived_at,
        source: "samsara",
        actor: "Samsara",
        title: `Arrived at ${role}`,
        detail: `${label} · 2-mile geofence`,
      });
    }
    if (String(stop.departed_at ?? "").trim()) {
      events.push({
        id: `samsara-depart-${stop.id}`,
        at: stop.departed_at,
        source: "samsara",
        actor: "Samsara",
        title: `Departed ${role}`,
        detail: `${label} · 2-mile geofence`,
      });
    }
  }

  const load = getLoad(loadId);
  if (load) {
    for (const reading of reeferReadingsForLoad(loadId)) {
      if (!isMaterialReeferReading(load, reading)) continue;
      const alarm = reading.alarm?.trim() ?? "";
      events.push({
        id: `orbcomm-reefer-${reading.id}`,
        at: reading.recorded_at,
        source: "orbcomm",
        actor: reading.source === "orbcomm" ? "Orbcomm" : "Reefer",
        title: alarm ? "Reefer alarm / off setpoint" : "Reefer off setpoint",
        detail: [
          reading.temperature_f != null ? `${reading.temperature_f}°F` : null,
          reading.setpoint_f != null ? `set ${reading.setpoint_f}°F` : null,
          alarm || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return events.sort((a, b) => {
    const time = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (time !== 0) return time;
    return b.id.localeCompare(a.id);
  });
}
