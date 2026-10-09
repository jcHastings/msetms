import { collectAssignmentAlerts } from "./compliance";
import { getDb } from "./db";
import { dispatchAckRules, shouldFlagMissingDispatchAck, type DispatchAckRules } from "./dispatch-ack";
import { detentionStillInsideAtMark, detentionTwoHourMark } from "./detention-clock";
import { missingPodAlert } from "./pod-delivery";
import { coordsForStop, stillInsideGeofenceAt } from "./geofence";
import { complianceWindows, getCompanySettings } from "./settings";
import { formatDateTime } from "./format";
import { resolveInvoiceCustomerEmail } from "./load-mail";
import { isUsableEmail } from "./mail-shared";
import { loadIdsWithSentMail } from "./mail-store";
import { loadsChangeStamp, readResultCache, writeResultCache } from "./working-loads";
import { matchLocationForStop } from "./locations";
import { listDrivers, listLoads, listLocations, listTrailers, listTrucks } from "./queries";
import type { LoadStop } from "./stops";
import { listSamsaraInboxFlags } from "./integrations/samsara-webhook";
import { itsImportIssueCode, itsImportIssueTitle, itsImportLoadNumber } from "./its-import-shared";
import {
  isActiveLoadStatus,
  isBillableStatus,
  isClosedStatus,
  isRollingStatus,
  statusNeedsAssets,
  type Driver,
  type LoadView,
  type ReeferReading,
  type Trailer,
  type Truck,
} from "./types";
import type { GpsPing } from "./geofence";

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
  "samsara",
  "dispatch_ack",
  "its_import",
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
  driverName?: string;
  pickupAt?: string;
  deliveryAt?: string;
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
  driverName: string;
  pickupAt: string;
  deliveryAt: string;
};

export function workbenchCardSchedule(
  load: { driver_name: string | null; pickup_start: string; delivery_start: string },
  stops: Array<{ kind: string; window_start: string }> = [],
): { driverName: string; pickupAt: string; deliveryAt: string } {
  const pickup = stops.find((stop) => stop.kind === "pickup");
  const delivery = stops.find((stop) => stop.kind === "delivery");
  return {
    driverName: (load.driver_name ?? "").trim(),
    pickupAt: pickup?.window_start.trim() || load.pickup_start || "",
    deliveryAt: delivery?.window_start.trim() || load.delivery_start || "",
  };
}

function attachWorkbenchSchedule(
  items: InboxException[],
  loads: LoadView[],
  stopsByLoad: Map<number, Array<{ kind: string; window_start: string }>>,
): void {
  const byId = new Map(loads.map((load) => [load.id, load]));
  const cache = new Map<number, { driverName: string; pickupAt: string; deliveryAt: string }>();
  for (const item of items) {
    let schedule = cache.get(item.loadId);
    if (!schedule) {
      const load = byId.get(item.loadId);
      schedule = load
        ? workbenchCardSchedule(load, stopsByLoad.get(load.id) ?? [])
        : { driverName: "", pickupAt: "", deliveryAt: "" };
      cache.set(item.loadId, schedule);
    }
    item.driverName = schedule.driverName;
    item.pickupAt = schedule.pickupAt;
    item.deliveryAt = schedule.deliveryAt;
  }
}

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
  samsara: 9,
  dispatch_ack: 10,
  its_import: 11,
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
  if (item.kind === "late" && item.severity === "HIGH") return true;
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
        driverName: item.driverName ?? "",
        pickupAt: item.pickupAt ?? "",
        deliveryAt: item.deliveryAt ?? "",
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
  if (item.kind === "samsara") return "Samsara";
  if (item.kind === "dispatch_ack") return "No ack";
  if (item.kind === "detention") return "Detention";
  if (item.kind === "late" && (item.severity === "CRITICAL" || item.severity === "HIGH")) return "Running late";
  if (item.severity === "CRITICAL") return "Critical";
  if (item.severity === "HIGH") return "Important";
  return "Caution";
}

export function exceptionReasonText(item: Pick<InboxException, "title">): string {
  return item.title.trim();
}

export function exceptionReasonTooltip(item: Pick<InboxException, "title" | "detail">): string {
  const title = item.title.trim();
  const detail = item.detail.trim();
  if (!detail || detail === title) return title;
  return `${title} — ${detail}`;
}

function isCriticalTagItem(item: Pick<InboxException, "kind" | "severity">): boolean {
  return item.severity === "CRITICAL" || item.kind === "late";
}

export function loadNeedsCriticalTag(
  loadId: number,
  items?: Array<Pick<InboxException, "loadId" | "kind" | "severity">>,
): boolean {
  const rows = items ?? listExceptionInbox().items;
  return rows.some((item) => item.loadId === loadId && isCriticalTagItem(item));
}

export function loadCriticalReasons(
  loadId: number,
  items?: Array<Pick<InboxException, "loadId" | "kind" | "severity" | "title">>,
): string[] {
  const rows = items ?? listExceptionInbox().items;
  const seen = new Set<string>();
  const reasons: string[] = [];
  for (const item of rows) {
    if (item.loadId !== loadId || !isCriticalTagItem(item)) continue;
    const reason = item.title.trim();
    if (!reason || seen.has(reason)) continue;
    seen.add(reason);
    reasons.push(reason);
  }
  return reasons;
}

function lastStopArrival(stops: Array<Pick<InboxStop, "kind" | "arrived_at">>, kind: string): string {
  let arrival = "";
  for (const stop of stops) {
    if (stop.kind !== kind) continue;
    const value = String(stop.arrived_at ?? "").trim();
    if (value) arrival = value;
  }
  return arrival;
}

function arrivalIsAfterWindow(arrivalIso: string, windowEnd: string): boolean {
  const arrival = new Date(arrivalIso).getTime();
  const end = new Date(windowEnd).getTime();
  if (!arrivalIso.trim() || Number.isNaN(arrival) || Number.isNaN(end)) return false;
  return arrival > end;
}

/** Late only when a stop has an arrival after its window. A blank arrival is not late. */
function lateExceptions(load: LoadView, _now: Date, stops: InboxStop[]): InboxException[] {
  if (isClosedStatus(load.status)) return [];

  const pickupArrival = lastStopArrival(stops, "pickup");
  const deliveryArrival = lastStopArrival(stops, "delivery");

  if (pickupArrival && arrivalIsAfterWindow(pickupArrival, load.pickup_end)) {
    return [
      withLoad(
        load,
        "late",
        "HIGH",
        "Late to pickup",
        `Arrived ${formatDateTime(pickupArrival)}. Pickup window ended ${formatDateTime(load.pickup_end)}`,
      ),
    ];
  }

  if (deliveryArrival && arrivalIsAfterWindow(deliveryArrival, load.delivery_end)) {
    return [
      withLoad(
        load,
        "late",
        isRollingStatus(load.status) ? "CRITICAL" : "HIGH",
        "Late to delivery",
        `Arrived ${formatDateTime(deliveryArrival)}. Delivery window ended ${formatDateTime(load.delivery_end)}`,
      ),
    ];
  }

  return [];
}

type InboxStop = Pick<
  LoadStop,
  | "id"
  | "load_id"
  | "kind"
  | "location_id"
  | "name"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "window_start"
  | "window_end"
  | "arrived_at"
  | "departed_at"
  | "schedule_type"
>;

type InboxContext = {
  drivers: Map<number, Driver>;
  trucks: Map<number, Truck>;
  trailers: Map<number, Trailer>;
  stops: Map<number, InboxStop[]>;
  pings: Map<number, GpsPing[]>;
  stopCoords: Map<number, { latitude: number; longitude: number }>;
  windows: ReturnType<typeof complianceWindows>;
};

function chunkIds(ids: number[], size = 400): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

function buildInboxContext(loads: LoadView[]): InboxContext {
  const drivers = new Map(listDrivers().map((driver) => [driver.id, driver]));
  const trucks = new Map(listTrucks().map((truck) => [truck.id, truck]));
  const trailers = new Map(listTrailers().map((trailer) => [trailer.id, trailer]));
  const loadIds = loads.map((load) => load.id);
  const stops = new Map<number, InboxStop[]>();
  for (const chunk of chunkIds(loadIds)) {
    if (!chunk.length) continue;
    const rows = getDb()
      .prepare(
        `SELECT id, load_id, kind, location_id, name, street, city, state, zip,
                window_start, window_end, arrived_at, departed_at, schedule_type
         FROM load_stops
         WHERE load_id IN (${chunk.map(() => "?").join(", ")})
         ORDER BY sequence, id`,
      )
      .all(...chunk) as InboxStop[];
    for (const row of rows) {
      const list = stops.get(row.load_id) ?? [];
      list.push(row);
      stops.set(row.load_id, list);
    }
  }
  const locations = listLocations();
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const stopCoords = new Map<number, { latitude: number; longitude: number }>();
  for (const list of stops.values()) {
    for (const stop of list) {
      const linked = stop.location_id ? locationById.get(stop.location_id) : null;
      const matched =
        linked && linked.latitude != null && linked.longitude != null
          ? linked
          : matchLocationForStop(locations, stop);
      if (matched?.latitude == null || matched.longitude == null) continue;
      if (!Number.isFinite(matched.latitude) || !Number.isFinite(matched.longitude)) continue;
      stopCoords.set(stop.id, { latitude: matched.latitude, longitude: matched.longitude });
    }
  }
  const truckIds = [...new Set(loads.map((load) => load.truck_id).filter((id): id is number => id != null))];
  const pings = new Map<number, GpsPing[]>();
  for (const chunk of chunkIds(truckIds)) {
    if (!chunk.length) continue;
    const rows = getDb()
      .prepare(
        `SELECT truck_id, recorded_at, latitude, longitude
         FROM truck_gps_readings
         WHERE source = 'samsara' AND latitude IS NOT NULL AND longitude IS NOT NULL
           AND truck_id IN (${chunk.map(() => "?").join(", ")})
         ORDER BY recorded_at ASC, id ASC`,
      )
      .all(...chunk) as Array<{ truck_id: number; recorded_at: string; latitude: number; longitude: number }>;
    for (const row of rows) {
      const list = pings.get(row.truck_id) ?? [];
      list.push({ latitude: row.latitude, longitude: row.longitude, recordedAt: row.recorded_at });
      pings.set(row.truck_id, list);
    }
  }
  for (const truckId of truckIds) {
    const truck = trucks.get(truckId);
    if (!truck || truck.gps_latitude == null || truck.gps_longitude == null) continue;
    if (truck.gps_source && truck.gps_source !== "samsara") continue;
    const recordedAt = String(truck.gps_recorded_at ?? "").trim();
    const list = pings.get(truckId) ?? [];
    const already = list.some(
      (ping) => ping.recordedAt === recordedAt && ping.latitude === truck.gps_latitude && ping.longitude === truck.gps_longitude,
    );
    if (!already && Number.isFinite(truck.gps_latitude) && Number.isFinite(truck.gps_longitude)) {
      list.push({ latitude: truck.gps_latitude, longitude: truck.gps_longitude, recordedAt });
      list.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
      pings.set(truckId, list);
    }
  }
  return { drivers, trucks, trailers, stops, pings, stopCoords, windows: complianceWindows() };
}

function complianceExceptions(load: LoadView, ctx: InboxContext): InboxException[] {
  if (!statusNeedsAssets(load.status)) return [];
  const alerts = collectAssignmentAlerts(
    {
      driver: load.driver_id ? ctx.drivers.get(load.driver_id) ?? null : null,
      truck: load.truck_id ? ctx.trucks.get(load.truck_id) ?? null : null,
      trailer: load.trailer_id ? ctx.trailers.get(load.trailer_id) ?? null : null,
    },
    ctx.windows,
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

function gpsQuietExceptions(load: LoadView, now: Date, quietHours: number, ctx: InboxContext): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  if (!load.truck_id) return [];
  const truck = ctx.trucks.get(load.truck_id) ?? null;
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
  const key = `${loadsChangeStamp()}|${Math.floor(now.getTime() / 60_000)}`;
  const cached = readResultCache<ExceptionInbox>("exceptions", key);
  if (cached) return cached;
  return writeResultCache("exceptions", key, computeExceptionInbox(now));
}

function computeExceptionInbox(now: Date): ExceptionInbox {
  const scoped = listLoads({ exceptionScope: true }, now);
  const active = scoped.filter((load) => isActiveLoadStatus(load.status));
  const delivered = scoped.filter((load) => isBillableStatus(load.status));
  const pods = loadIdsWithPod();
  const readings = latestReadingByLoad();
  const rateCons = loadIdsWithRateCon();
  const quietHours = getCompanySettings().alert_gps_quiet_hours || 2;
  const ackRules = dispatchAckRules(now);
  const items: InboxException[] = [];
  const samsaraByLoad = new Map<number, ReturnType<typeof listSamsaraInboxFlags>>();
  for (const flag of listSamsaraInboxFlags()) {
    const list = samsaraByLoad.get(flag.loadId) ?? [];
    list.push(flag);
    samsaraByLoad.set(flag.loadId, list);
  }
  const ctx = buildInboxContext(active);

  for (const load of active) {
    const reading = readings.get(load.id) ?? null;
    items.push(...reeferExceptions(load, reading));
    items.push(...lateExceptions(load, now, ctx.stops.get(load.id) ?? []));
    items.push(...gpsQuietExceptions(load, now, quietHours, ctx));
    items.push(...complianceExceptions(load, ctx));
    items.push(...unassignedExceptions(load, now));
    items.push(...dispatchAckExceptions(load, ackRules));
    items.push(...detentionExceptions(load, now, ctx));
    items.push(...missingContactExceptions(load, rateCons.has(load.id)));
    items.push(...samsaraFlagExceptions(load, samsaraByLoad.get(load.id) ?? []));
  }

  const invoiceIds = delivered.filter((load) => load.tms_invoice_number).map((load) => load.id);
  const invoiceSent = loadIdsWithSentMail(invoiceIds, "customer_invoice");

  for (const load of delivered) {
    const podAlert = missingPodAlert(load, pods.has(load.id));
    if (podAlert.show) {
      items.push(withLoad(load, "missing_pod", podAlert.severity, podAlert.title, podAlert.detail));
      continue;
    }
    if (
      load.tms_invoice_number &&
      !isUsableEmail(resolveInvoiceCustomerEmail(load)) &&
      !invoiceSent.has(load.id)
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

  items.push(...itsImportInboxItems());
  attachWorkbenchSchedule(items, scoped, ctx.stops);

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
    case "samsara":
      return "Samsara";
    case "dispatch_ack":
      return "No ack";
    case "its_import":
      return "ITS import";
  }
}

function dispatchAckExceptions(load: LoadView, rules: DispatchAckRules): InboxException[] {
  if (!shouldFlagMissingDispatchAck(load, rules)) return [];
  const pickup = new Date(load.pickup_start).getTime();
  const hoursUntil = (pickup - rules.now.getTime()) / 3_600_000;
  const who = (load.driver_name ?? "").trim() || "Driver";
  return [
    withLoad(
      load,
      "dispatch_ack",
      hoursUntil <= 2 ? "HIGH" : "MEDIUM",
      "No driver ack",
      `${who} has not tapped Got it. Pickup ${formatDateTime(load.pickup_start)}. Desk flag only — no text or email.`,
    ),
  ];
}

function itsImportInboxItems(): InboxException[] {
  const rows = getDb()
    .prepare(
      `SELECT exception_key, reason FROM exception_states
       WHERE exception_key LIKE 'its-import:%' AND status = 'open'
       ORDER BY exception_key`,
    )
    .all() as Array<{ exception_key: string; reason: string }>;
  if (rows.length === 0) return [];
  const numbers = [...new Set(rows.map((row) => itsImportLoadNumber(row.exception_key)).filter(Boolean))];
  const loads = numbers.length
    ? (getDb()
        .prepare(
          `SELECT loads.id, loads.load_number, loads.origin, loads.destination, customers.name AS customer_name
           FROM loads JOIN customers ON customers.id = loads.customer_id
           WHERE loads.load_number IN (${numbers.map(() => "?").join(", ")})`,
        )
        .all(...numbers) as Array<{
        id: number;
        load_number: string;
        origin: string;
        destination: string;
        customer_name: string;
      }>)
    : [];
  const byNumber = new Map(loads.map((load) => [load.load_number, load]));
  return rows.map((row) => {
    const loadNumber = itsImportLoadNumber(row.exception_key);
    const load = byNumber.get(loadNumber);
    const issue = itsImportIssueCode(row.exception_key);
    return {
      id: row.exception_key,
      loadId: load?.id ?? 0,
      loadNumber,
      customerName: load?.customer_name ?? "",
      origin: load?.origin ?? "",
      destination: load?.destination ?? "",
      kind: "its_import",
      severity: "MEDIUM",
      title: itsImportIssueTitle(issue),
      detail: row.reason,
      demo: false,
    };
  });
}

function samsaraFlagExceptions(load: LoadView, flags: ReturnType<typeof listSamsaraInboxFlags>): InboxException[] {
  return flags.map((flag) =>
    withLoad(load, "samsara", flag.severity, flag.title, flag.detail, false, flag.eventId),
  );
}

function detentionExceptions(load: LoadView, now: Date, ctx: InboxContext): InboxException[] {
  if (isClosedStatus(load.status)) return [];
  const pings = load.truck_id ? ctx.pings.get(load.truck_id) ?? [] : [];
  for (const stop of ctx.stops.get(load.id) ?? []) {
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
    const dest = coordsForStop(stop, ctx.stopCoords);
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
