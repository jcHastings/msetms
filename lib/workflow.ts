import { daysUntil } from "./compliance";
import { getDb } from "./db";
import { getDriver, getLoad, getTrailer, getTruck, updateLoadStatus, updateLoadTruckStatus } from "./queries";
import { cleanSafetyDate } from "./safety-shared";
import { getWorkflowSettings } from "./settings";
import { listStops } from "./stops";
import { isClosedStatus, LOAD_STATUSES, type Driver, type Trailer, type Truck } from "./types";
import type { WorkflowSettings } from "./workflow-shared";

const STATUS_ORDER = LOAD_STATUSES.filter((status) => status !== "cancelled" && status !== "accounting");

function dateMissingOrExpired(value: string): boolean {
  const day = cleanSafetyDate(value);
  if (!day) return true;
  const days = daysUntil(day);
  return days == null || days < 0;
}

export function assignmentHardBlocks(
  input: { driver?: Driver | null; truck?: Truck | null; trailer?: Trailer | null },
  settings: WorkflowSettings = getWorkflowSettings(),
): string[] {
  const reasons: string[] = [];
  if (settings.blockAssignExpiredDriver && input.driver) {
    if (dateMissingOrExpired(input.driver.license_expires)) {
      reasons.push(`${input.driver.name}: CDL / license is missing or expired.`);
    }
    if (dateMissingOrExpired(input.driver.medical_expires)) {
      reasons.push(`${input.driver.name}: DOT medical card is missing or expired.`);
    }
  }
  if (settings.blockAssignExpiredTruck && input.truck) {
    if (dateMissingOrExpired(input.truck.registration_expires)) {
      reasons.push(`Unit ${input.truck.unit_number}: registration is missing or expired.`);
    }
    if (dateMissingOrExpired(input.truck.dot_expires)) {
      reasons.push(`Unit ${input.truck.unit_number}: DOT / inspection is missing or expired.`);
    }
  }
  if (settings.blockAssignExpiredTrailer && input.trailer) {
    if (dateMissingOrExpired(input.trailer.registration_expires)) {
      reasons.push(`Trailer ${input.trailer.unit_number}: registration is missing or expired.`);
    }
    if (dateMissingOrExpired(input.trailer.dot_expires)) {
      reasons.push(`Trailer ${input.trailer.unit_number}: DOT / inspection is missing or expired.`);
    }
  }
  return reasons;
}

export function requireAssignmentHardBlock(
  input: { driver?: Driver | null; truck?: Truck | null; trailer?: Trailer | null },
  settings?: WorkflowSettings,
): void {
  const reasons = assignmentHardBlocks(input, settings);
  if (reasons.length === 0) return;
  throw new Error(`Cannot assign. ${reasons.join(" ")}`);
}

function canAdvanceStatus(current: string, next: string): boolean {
  if (!next || next === current) return false;
  if (isClosedStatus(current) && next !== current) return false;
  const from = STATUS_ORDER.indexOf(current as (typeof STATUS_ORDER)[number]);
  const to = STATUS_ORDER.indexOf(next as (typeof STATUS_ORDER)[number]);
  if (from < 0 || to < 0) return current !== next;
  return to > from;
}

function applyLoadAndTruck(loadId: number, loadStatus: string, truckStatus: string): void {
  const load = getLoad(loadId);
  if (!load || load.status === "cancelled") return;
  if (loadStatus && canAdvanceStatus(load.status, loadStatus)) {
    updateLoadStatus(loadId, loadStatus);
  }
  if (truckStatus && load.truck_status !== truckStatus) {
    updateLoadTruckStatus(loadId, truckStatus);
  }
}

export function applyWorkflowAfterGeofence(loadId: number): void {
  const settings = getWorkflowSettings();
  const load = getLoad(loadId);
  if (!load) return;
  const stops = listStops(loadId);
  const pickups = stops.filter((stop) => stop.kind === "pickup");
  const deliveries = stops.filter((stop) => stop.kind === "delivery");
  const firstPickup = pickups[0];
  const lastDelivery = deliveries[deliveries.length - 1];
  if (firstPickup?.arrived_at && !firstPickup.departed_at) {
    applyLoadAndTruck(loadId, settings.arrivePickupLoadStatus, settings.arrivePickupTruckStatus);
  }
  if (firstPickup?.departed_at) {
    applyLoadAndTruck(loadId, settings.departPickupLoadStatus, settings.departPickupTruckStatus);
  }
  if (lastDelivery?.arrived_at) {
    applyLoadAndTruck(loadId, settings.arriveDeliveryLoadStatus, settings.arriveDeliveryTruckStatus);
  }
}

export function applyWorkflowOnDriverAssign(loadId: number): void {
  const settings = getWorkflowSettings();
  if (!settings.driverAssignLoadStatus && !settings.driverAssignTruckStatus) return;
  applyLoadAndTruck(loadId, settings.driverAssignLoadStatus, settings.driverAssignTruckStatus);
}

function stopIsLate(windowEnd: string, minutes: number, now: Date): boolean {
  const raw = String(windowEnd ?? "").trim();
  if (!raw) return false;
  const end = new Date(raw);
  if (Number.isNaN(end.getTime())) return false;
  return now.getTime() - end.getTime() >= minutes * 60_000;
}

export function applyLateStopWorkflow(now = new Date()): number {
  const settings = getWorkflowSettings();
  if (!settings.lateStopLoadStatus || settings.lateStopMinutes < 0) return 0;
  const allowed = new Set(settings.lateStopOnlyStatuses);
  const loads = getDb()
    .prepare("SELECT id, status FROM loads WHERE status NOT IN ('cancelled', 'delivered', 'completed', 'accounting')")
    .all() as Array<{ id: number; status: string }>;
  let changed = 0;
  for (const row of loads) {
    if (allowed.size && !allowed.has(row.status)) continue;
    const stops = listStops(row.id);
    const pickups = stops.filter((stop) => stop.kind === "pickup");
    const deliveries = stops.filter((stop) => stop.kind === "delivery");
    const pickupLate = pickups.some((stop) => !stop.arrived_at && stopIsLate(stop.window_end || stop.window_start, settings.lateStopMinutes, now));
    const deliveryLate = deliveries.some((stop) => !stop.arrived_at && stopIsLate(stop.window_end || stop.window_start, settings.lateStopMinutes, now));
    const late =
      settings.lateStopKind === "pickup"
        ? pickupLate
        : settings.lateStopKind === "delivery"
          ? deliveryLate
          : pickupLate || deliveryLate;
    if (!late) continue;
    const before = getLoad(row.id)?.status;
    applyLoadAndTruck(row.id, settings.lateStopLoadStatus, "");
    if (getLoad(row.id)?.status !== before) changed += 1;
  }
  return changed;
}

export function runWorkflowTick(now = new Date()): void {
  applyLateStopWorkflow(now);
}

export function assetsForAssignment(truckId: number | null, driverId: number | null, trailerId: number | null) {
  return {
    truck: truckId ? getTruck(truckId) : null,
    driver: driverId ? getDriver(driverId) : null,
    trailer: trailerId ? getTrailer(trailerId) : null,
  };
}
