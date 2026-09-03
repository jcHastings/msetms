import { collectAssignmentAlerts } from "./compliance";
import { getDb } from "./db";
import { detentionStillInsideAtMark, detentionTwoHourMark } from "./detention-clock";
import { coordsForStop, gpsPingsForLoad, stillInsideGeofenceAt } from "./geofence";
import { complianceWindows, getCompanySettings } from "./settings";
import { formatDateTime } from "./format";
import { resolveInvoiceCustomerEmail } from "./load-mail";
import { isUsableEmail } from "./mail-shared";
import { lastSentMail } from "./mail-store";
import { getDriver, getTrailer, getTruck, listLoads } from "./queries";
import { listStops } from "./stops";
import { isBillableStatus, isClosedStatus, isRollingStatus, statusNeedsAssets, type LoadView, type ReeferReading } from "./types";

export const EXCEPTION_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const EXCEPTION_KINDS = [
  "reefer",
  "late",
  "detention",
  "missing_contact",
  "gps_quiet",
  "missing_pod",
  "invoice_send",
  "compliance",
  "unassigned",
] as const;
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

export type InboxExceptionGroup = {
  loadId: number;
  loadNumber: string;
  customerName: string;
  origin: string;
  destination: string;
  severity: ExceptionSeverity;
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
  detention: 2,
  missing_contact: 3,
  gps_quiet: 4,
  missing_pod: 5,
  invoice_send: 6,
  compliance: 7,
  unassigned: 8,
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

function loadIdsWithRateCon(): Set<number> {
  const rows = getDb()
    .prepare("SELECT DISTINCT load_id FROM attachments WHERE kind = 'rate_con'")
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
  extraId?: string,
): InboxException {
  return {
    id: extraId ? `${load.id}:${kind}:${extraId}` : `${load.id}:${kind}`,
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

function requiredTempTarget(load: LoadView): { value: number; label: string } | null {
  if (load.temp_low_f != null && load.temp_high_f != null) {
    return { value: (load.temp_low_f + load.temp_high_f) / 2, label: `${load.temp_low_f}–${load.temp_high_f}°F` };
  }
  if (load.temperature_f != null) return { value: load.temperature_f, label: `req ${load.temperature_f}°F` };
  if (load.temp_low_f != null) return { value: load.temp_low_f, label: `req ${load.temp_low_f}°F` };
  if (load.temp_high_f != null) return { value: load.temp_high_f, label: `req ${load.temp_high_f}°F` };
  return null;
}

function outsideRequiredRange(load: LoadView, temp: number): boolean {
  if (load.temp_low_f != null && temp < load.temp_low_f - 0.5) return true;
  if (load.temp_high_f != null && temp > load.temp_high_f + 0.5) return true;
  if (load.temperature_f != null && Math.abs(temp - load.temperature_f) >= 2) return true;
  return false;
}

function reeferExceptions(load: LoadView, reading: ReeferReading | null): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  const setpoint = load.reefer_setpoint_f ?? reading?.setpoint_f ?? null;
  const required = requiredTempTarget(load);
  const temp = reading?.temperature_f ?? null;
  const alarm = reading?.alarm?.trim() ?? "";
  if (temp == null) {
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

  const vsSetpoint = setpoint != null ? Math.abs(temp - setpoint) : 0;
  const vsRequired = required ? Math.abs(temp - required.value) : 0;
  const requiredMiss = outsideRequiredRange(load, temp);
  const delta = Math.max(vsSetpoint, requiredMiss ? vsRequired : 0);
  let severity: ExceptionSeverity | null = null;
  if (delta >= 8 || (alarm && delta >= 5)) severity = "CRITICAL";
  else if (delta >= 3 || alarm || requiredMiss) severity = "HIGH";
  else if (delta >= 2) severity = "MEDIUM";
  if (!severity) return [];

  const title =
    requiredMiss && (setpoint == null || vsRequired >= vsSetpoint)
      ? "Temperature discrepancy"
      : alarm && delta >= 3
        ? "Reefer alarm / off setpoint"
        : "Reefer off setpoint";
  const detail = [
    `${temp}°F`,
    setpoint != null ? `set ${setpoint}°F` : null,
    required ? required.label : null,
    ` (${delta.toFixed(1)}° off)`,
    alarm ? alarm : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [withLoad(load, "reefer", severity, title, detail, reading?.source !== "orbcomm")];
}

export function isMaterialReeferReading(load: LoadView, reading: ReeferReading | null): boolean {
  return reeferExceptions(load, reading).length > 0;
}

/** Workbench: late/missed, detention, reefer miss, missing rate-con phone, other CRITICAL. */
export function isOutOfToleranceException(item: Pick<InboxException, "kind" | "severity">): boolean {
  if (item.severity === "CRITICAL") return true;
  if (item.kind === "detention" || item.kind === "reefer" || item.kind === "missing_contact") return true;
  if (item.kind === "late" && (item.severity === "CRITICAL" || item.severity === "HIGH")) return true;
  return false;
}

function missingContactExceptions(load: LoadView, hasRateCon: boolean): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  const phone = String(load.contact_phone ?? "").trim();
  if (phone) return [];
  const name = String(load.contact_name ?? "").trim();
  const email = String(load.contact_email ?? "").trim();
  if (!hasRateCon && !name && !email) return [];
  return [
    withLoad(
      load,
      "missing_contact",
      "CRITICAL",
      "Missing rate-con phone",
      name
        ? `${name} is on the load. No broker phone to call.`
        : "Rate-con contact has no phone. Dispatcher cannot call the broker.",
    ),
  ];
}

export function groupInboxExceptions(items: InboxException[]): InboxExceptionGroup[] {
  const groups = new Map<number, InboxExceptionGroup>();
  for (const item of items) {
    const current = groups.get(item.loadId);
    if (!current) {
      groups.set(item.loadId, {
        loadId: item.loadId,
        loadNumber: item.loadNumber,
        customerName: item.customerName,
        origin: item.origin,
        destination: item.destination,
        severity: item.severity,
        items: [item],
      });
      continue;
    }
    current.items.push(item);
    if (SEVERITY_RANK[item.severity] < SEVERITY_RANK[current.severity]) current.severity = item.severity;
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => {
      const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severity !== 0) return severity;
      return KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.title.localeCompare(b.title);
    });
  }
  return [...groups.values()].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    return a.loadNumber.localeCompare(b.loadNumber);
  });
}

export function attentionLabel(item: Pick<InboxException, "kind" | "severity" | "title">): string {
  if (item.kind === "detention") return "Detention";
  if (item.kind === "late" && (item.severity === "CRITICAL" || item.severity === "HIGH")) return "Running late";
  if (item.severity === "CRITICAL") return "Critical";
  if (item.severity === "HIGH") return "Important";
  return "Caution";
}

export function loadNeedsCriticalTag(
  loadId: number,
  items?: Array<Pick<InboxException, "loadId" | "kind" | "severity">>,
): boolean {
  const rows = items ?? listExceptionInbox().items;
  return rows.some(
    (item) => item.loadId === loadId && (item.severity === "CRITICAL" || item.kind === "late"),
  );
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
  const alerts = collectAssignmentAlerts(
    {
      driver: load.driver_id ? getDriver(load.driver_id) : null,
      truck: load.truck_id ? getTruck(load.truck_id) : null,
      trailer: load.trailer_id ? getTrailer(load.trailer_id) : null,
    },
    complianceWindows(),
  );
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

function gpsQuietExceptions(load: LoadView, now: Date, quietHours: number): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  if (!load.truck_id) return [];
  const truck = getTruck(load.truck_id);
  const recordedAt = truck?.gps_recorded_at?.trim() ?? "";
  if (!recordedAt || !truck?.gps_latitude || !truck?.gps_longitude) return [];
  const ping = new Date(recordedAt);
  if (Number.isNaN(ping.getTime())) return [];
  const silentHours = (now.getTime() - ping.getTime()) / 3_600_000;
  if (silentHours < quietHours) return [];
  const hours = Math.round(silentHours * 10) / 10;
  return [
    withLoad(
      load,
      "gps_quiet",
      hours >= quietHours * 2 ? "HIGH" : "MEDIUM",
      "GPS gone quiet",
      `Last Samsara ping ${formatDateTime(recordedAt)} (${hours}h ago). Window ${quietHours}h.`,
      truck.gps_source !== "samsara",
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
  const rateCons = loadIdsWithRateCon();
  const quietHours = getCompanySettings().alert_gps_quiet_hours || 2;
  const items: InboxException[] = [];

  for (const load of active) {
    const reading = readings.get(load.id) ?? null;
    items.push(...reeferExceptions(load, reading));
    items.push(...lateExceptions(load, now));
    items.push(...gpsQuietExceptions(load, now, quietHours));
    items.push(...complianceExceptions(load));
    items.push(...unassignedExceptions(load, now));
    items.push(...detentionExceptions(load, now));
    items.push(...missingContactExceptions(load, rateCons.has(load.id)));
  }

  for (const load of delivered) {
    if (!pods.has(load.id)) {
      items.push(
        withLoad(
          load,
          "missing_pod",
          "HIGH",
          "Missing POD",
          `${load.customer_name} — delivered, no proof of delivery on file.`,
        ),
      );
      continue;
    }
    if (
      load.tms_invoice_number &&
      !isUsableEmail(resolveInvoiceCustomerEmail(load)) &&
      !lastSentMail(load.id, "customer_invoice")
    ) {
      items.push(
        withLoad(
          load,
          "invoice_send",
          "HIGH",
          "Invoice ready — send to",
          `${load.customer_name} — invoice is on the load. Type the send-to address on Email invoice.`,
        ),
      );
    }
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
    case "gps_quiet":
      return "GPS quiet";
    case "missing_pod":
      return "POD";
    case "invoice_send":
      return "Invoice";
    case "compliance":
      return "Compliance";
    case "unassigned":
      return "Unassigned";
    case "detention":
      return "Detention";
    case "missing_contact":
      return "Rate-con phone";
  }
}

function detentionExceptions(load: LoadView, now: Date): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  const pings = gpsPingsForLoad(load.id);
  for (const stop of listStops(load.id)) {
    if (!String(stop.arrived_at ?? "").trim()) continue;
    const mark = detentionTwoHourMark({
      scheduleType: stop.schedule_type,
      arrivedAt: stop.arrived_at,
      windowStart: stop.window_start,
      windowEnd: stop.window_end,
    });
    if (!mark) continue;
    if (!detentionStillInsideAtMark({
      arrivedAt: stop.arrived_at,
      departedAt: stop.departed_at,
      twoHourMark: mark,
      now,
    })) {
      continue;
    }
    const dest = coordsForStop(stop);
    if (dest && !stillInsideGeofenceAt(dest, pings, mark, stop.departed_at)) continue;
    const role = stop.kind === "delivery" ? "receiver" : "shipper";
    const stopLabel = stop.kind === "delivery" ? "delivery" : "pickup";
    return [
      withLoad(
        load,
        "detention",
        "HIGH",
        `Possible detention — still at ${role} (${stopLabel}) 2+ hours past appointment`,
        `${stop.name || (stop.kind === "delivery" ? "Delivery" : "Pickup")} · mark ${formatDateTime(mark.toISOString())}`,
      ),
    ];
  }
  return [];
}
