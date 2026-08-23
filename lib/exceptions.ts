import { collectAssignmentAlerts } from "./compliance";
import { getDb } from "./db";
import { formatDateTime } from "./format";
import { getDriver, getTrailer, getTruck, listLoads } from "./queries";
import { isBillableStatus, isClosedStatus, isRollingStatus, statusNeedsAssets, type LoadView, type ReeferReading } from "./types";

export const EXCEPTION_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const EXCEPTION_KINDS = ["reefer", "late", "missing_pod", "compliance", "unassigned"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export type InboxException = {
  id: string;
  loadId: number;
  loadNumber: string;
  customerName: string;
  origin: string;
  destination: string;
  kind: ExceptionKind;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  demo: boolean;
};

export type ExceptionInbox = {
  fineCount: number;
  attentionCount: number;
  items: InboxException[];
};

const SEVERITY_RANK: Record<ExceptionSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const KIND_RANK: Record<ExceptionKind, number> = {
  reefer: 0,
  late: 1,
  missing_pod: 2,
  compliance: 3,
  unassigned: 4,
};

function hoursUntil(iso: string, now: Date): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getTime() - now.getTime()) / 3_600_000;
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function coversToday(load: LoadView, now: Date): boolean {
  const start = new Date(load.pickup_start);
  const end = new Date(load.pickup_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (isSameLocalDay(load.pickup_start, now) || isSameLocalDay(load.pickup_end, now)) return true;
  return start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
}

function latestReadingByLoad(): Map<number, ReeferReading> {
  const rows = getDb()
    .prepare(
      `SELECT r.* FROM reefer_readings r
       JOIN (
         SELECT load_id, MAX(recorded_at) AS recorded_at
         FROM reefer_readings
         WHERE load_id IS NOT NULL
         GROUP BY load_id
       ) latest ON latest.load_id = r.load_id AND latest.recorded_at = r.recorded_at`,
    )
    .all() as ReeferReading[];
  return new Map(rows.filter((row) => row.load_id != null).map((row) => [row.load_id as number, row]));
}

function loadIdsWithPod(): Set<number> {
  const rows = getDb()
    .prepare("SELECT DISTINCT load_id FROM attachments WHERE kind = 'pod'")
    .all() as Array<{ load_id: number }>;
  return new Set(rows.map((row) => row.load_id));
}

function withLoad(
  load: LoadView,
  kind: ExceptionKind,
  severity: ExceptionSeverity,
  title: string,
  detail: string,
  demo = false,
): InboxException {
  return {
    id: `${load.id}:${kind}`,
    loadId: load.id,
    loadNumber: load.load_number,
    customerName: load.customer_name,
    origin: load.origin,
    destination: load.destination,
    kind,
    severity,
    title,
    detail,
    demo,
  };
}

function reeferExceptions(load: LoadView, reading: ReeferReading | null): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  const setpoint = load.reefer_setpoint_f ?? reading?.setpoint_f ?? null;
  const temp = reading?.temperature_f ?? null;
  const alarm = reading?.alarm?.trim() ?? "";
  if (setpoint == null || temp == null) {
    if (alarm) {
      return [
        withLoad(
          load,
          "reefer",
          "HIGH",
          "Reefer alarm",
          alarm,
          reading?.source !== "orbcomm",
        ),
      ];
    }
    return [];
  }

  const delta = Math.abs(temp - setpoint);
  let severity: ExceptionSeverity | null = null;
  if (delta >= 8 || (alarm && delta >= 5)) severity = "CRITICAL";
  else if (delta >= 3 || alarm) severity = "HIGH";
  else if (delta >= 2) severity = "MEDIUM";
  if (!severity) return [];

  const title = alarm && delta >= 3 ? "Reefer alarm / off setpoint" : "Reefer off setpoint";
  const detail = [
    `${temp}°F vs set ${setpoint}°F (${delta.toFixed(1)}° off)`,
    alarm ? alarm : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [withLoad(load, "reefer", severity, title, detail, reading?.source !== "orbcomm")];
}

function lateExceptions(load: LoadView, now: Date): InboxException[] {
  if (isClosedStatus(load.status)) return [];

  const pickupEndHours = hoursUntil(load.pickup_end, now);
  const deliveryEndHours = hoursUntil(load.delivery_end, now);
  const notPicked =
    load.status === "available" ||
    load.status === "hold" ||
    load.status === "assigned" ||
    load.status === "dispatched" ||
    load.status === "at_pickup" ||
    load.status === "loading" ||
    load.driver_progress === "" ||
    load.driver_progress === "en_route_pickup";

  if (notPicked && pickupEndHours != null && pickupEndHours < 0) {
    return [
      withLoad(
        load,
        "late",
        "HIGH",
        "Late to pickup",
        `Pickup window ended ${formatDateTime(load.pickup_end)}`,
      ),
    ];
  }

  if (isRollingStatus(load.status) && !notPicked && deliveryEndHours != null && deliveryEndHours < 0) {
    return [
      withLoad(
        load,
        "late",
        "CRITICAL",
        "Late to delivery",
        `Delivery window ended ${formatDateTime(load.delivery_end)}`,
      ),
    ];
  }

  if (isRollingStatus(load.status) && !notPicked && deliveryEndHours != null && deliveryEndHours >= 0 && deliveryEndHours <= 2) {
    return [
      withLoad(
        load,
        "late",
        "MEDIUM",
        "Delivery window at risk",
        `Delivery window ends ${formatDateTime(load.delivery_end)}`,
      ),
    ];
  }

  if (notPicked && pickupEndHours != null && pickupEndHours >= 0 && pickupEndHours <= 2) {
    return [
      withLoad(
        load,
        "late",
        "MEDIUM",
        "Pickup window at risk",
        `Pickup window ends ${formatDateTime(load.pickup_end)}`,
      ),
    ];
  }

  return [];
}

function complianceExceptions(load: LoadView): InboxException[] {
  if (!statusNeedsAssets(load.status)) return [];
  const alerts = collectAssignmentAlerts({
    driver: load.driver_id ? getDriver(load.driver_id) : null,
    truck: load.truck_id ? getTruck(load.truck_id) : null,
    trailer: load.trailer_id ? getTrailer(load.trailer_id) : null,
  });
  if (alerts.length === 0) return [];
  const expired = alerts.filter((alert) => alert.severity === "expired");
  return [
    withLoad(
      load,
      "compliance",
      expired.length > 0 ? "HIGH" : "MEDIUM",
      expired.length > 0 ? "Expired documents" : "Compliance expiring",
      alerts.map((alert) => alert.message).join(" "),
      true,
    ),
  ];
}

function unassignedExceptions(load: LoadView, now: Date): InboxException[] {
  if (load.status !== "available") return [];
  const pickupStart = new Date(load.pickup_start).getTime();
  const pickupEnd = new Date(load.pickup_end).getTime();
  if (Number.isNaN(pickupStart) || Number.isNaN(pickupEnd)) return [];
  const today = coversToday(load, now);
  if (!today && pickupStart > now.getTime()) return [];

  if (pickupEnd < now.getTime()) {
    return [
      withLoad(
        load,
        "unassigned",
        "MEDIUM",
        "Unassigned — window passed",
        `${load.origin} → ${load.destination}. Still needs a unit.`,
      ),
    ];
  }
  if (!today) return [];
  const started = pickupStart <= now.getTime();
  return [
    withLoad(
      load,
      "unassigned",
      started ? "MEDIUM" : "LOW",
      started ? "Unassigned — covering now" : "Unassigned — covering today",
      `${load.origin} → ${load.destination}. Pickup ${formatDateTime(load.pickup_start)}.`,
    ),
  ];
}

export function listExceptionInbox(now = new Date()): ExceptionInbox {
  const active = listLoads({ status: "active" });
  const delivered = listLoads({ status: "all" }).filter((load) => isBillableStatus(load.status));
  const pods = loadIdsWithPod();
  const readings = latestReadingByLoad();
  const items: InboxException[] = [];

  for (const load of active) {
    const reading = readings.get(load.id) ?? null;
    items.push(...reeferExceptions(load, reading));
    items.push(...lateExceptions(load, now));
    items.push(...complianceExceptions(load));
    items.push(...unassignedExceptions(load, now));
  }

  for (const load of delivered) {
    if (pods.has(load.id)) continue;
    items.push(
      withLoad(
        load,
        "missing_pod",
        "HIGH",
        "Missing POD",
        `${load.customer_name} — delivered, no proof of delivery on file.`,
      ),
    );
  }

  items.sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    const kind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kind !== 0) return kind;
    return a.loadNumber.localeCompare(b.loadNumber);
  });

  const attentionIds = new Set(items.map((item) => item.loadId));
  return {
    fineCount: active.filter((load) => !attentionIds.has(load.id)).length,
    attentionCount: attentionIds.size,
    items,
  };
}

export function labelForExceptionKind(kind: ExceptionKind): string {
  switch (kind) {
    case "reefer":
      return "Reefer";
    case "late":
      return "Late";
    case "missing_pod":
      return "POD";
    case "compliance":
      return "Compliance";
    case "unassigned":
      return "Unassigned";
  }
}
