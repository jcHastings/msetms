import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import { DISPLAY_TIME_ZONE } from "./format";
import { getLoad } from "./queries";
import {
  getDispatchAckHours,
  getDispatchAckIntroducedAt,
} from "./settings";
import type { LoadView } from "./types";

/** Statuses that still need a driver "Got it" before the truck is loaded. */
const ACK_OPEN_STATUSES = new Set(["hold", "assigned", "dispatched", "at_pickup", "loading"]);

/** Already on the truck, finished, or void. These never raise a no-ack desk flag. */
const PICKED_UP_OR_DONE = new Set([
  "picked_up",
  "in_transit",
  "at_delivery",
  "unloading",
  "delivered",
  "completed",
  "accounting",
  "cancelled",
]);

export type DispatchAckFields = {
  driver_id: number | null;
  pickup_start: string;
  origin: string;
  shipper_location_id: number | null;
  status: string;
  dispatch_ack_at: string;
  dispatch_ack_by: string;
  dispatch_ack_driver_id: number | null;
  dispatch_ack_fingerprint: string;
};

export type DispatchAckView = {
  state: "none" | "waiting" | "acknowledged";
  clock: string;
  flagged: boolean;
  needsButton: boolean;
};

export type DispatchAckRules = {
  now: Date;
  hours: number;
  introducedAt: string;
};

/** Driver + pickup start + pickup place. A change here is a new dispatch. */
export function dispatchFingerprint(load: Pick<DispatchAckFields, "driver_id" | "pickup_start" | "origin" | "shipper_location_id">): string {
  const where = String(load.origin ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return [
    load.driver_id ?? "",
    String(load.pickup_start ?? "").trim(),
    where,
    load.shipper_location_id ?? "",
  ].join("|");
}

export function formatAckClock(iso: string): string {
  const date = new Date(iso);
  if (!iso.trim() || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isDispatchAcknowledged(load: DispatchAckFields): boolean {
  if (!load.driver_id) return false;
  if (!String(load.dispatch_ack_at ?? "").trim()) return false;
  if (load.dispatch_ack_driver_id !== load.driver_id) return false;
  return load.dispatch_ack_fingerprint === dispatchFingerprint(load);
}

function pickupInstant(iso: string): Date | null {
  const date = new Date(iso);
  if (!String(iso ?? "").trim() || Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Desk flag: assigned, not yet picked up, pickup still ahead, inside the hours
 * window, and the pickup was not already past when this feature first ran.
 */
export function shouldFlagMissingDispatchAck(load: DispatchAckFields, rules: DispatchAckRules): boolean {
  if (!load.driver_id) return false;
  if (PICKED_UP_OR_DONE.has(load.status)) return false;
  if (isDispatchAcknowledged(load)) return false;
  const pickup = pickupInstant(load.pickup_start);
  const introduced = pickupInstant(rules.introducedAt);
  if (!pickup || !introduced) return false;
  if (pickup.getTime() <= introduced.getTime()) return false;
  if (pickup.getTime() <= rules.now.getTime()) return false;
  const hoursUntil = (pickup.getTime() - rules.now.getTime()) / 3_600_000;
  return hoursUntil <= rules.hours;
}

export function dispatchAckRules(now = new Date()): DispatchAckRules {
  return {
    now,
    hours: getDispatchAckHours(),
    introducedAt: getDispatchAckIntroducedAt(),
  };
}

export function presentDispatchAck(load: DispatchAckFields, rules: DispatchAckRules = dispatchAckRules()): DispatchAckView {
  const acknowledged = isDispatchAcknowledged(load);
  const clock = acknowledged ? formatAckClock(load.dispatch_ack_at) : "";
  const needsButton = Boolean(load.driver_id) && ACK_OPEN_STATUSES.has(load.status) && !acknowledged;
  const waiting = needsButton;
  return {
    state: acknowledged ? "acknowledged" : waiting ? "waiting" : "none",
    clock,
    flagged: shouldFlagMissingDispatchAck(load, rules),
    needsButton,
  };
}

export function driverShouldAcknowledge(load: DispatchAckFields, driverId: number): boolean {
  return load.driver_id === driverId && presentDispatchAck(load).needsButton;
}

export function acknowledgeDispatch(loadId: number, driver: { id: number; name: string }, at = new Date()): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.driver_id !== driver.id) {
    throw new Error("Only the assigned driver can acknowledge this dispatch.");
  }
  if (load.status === "cancelled") throw new Error("This load was cancelled.");
  if (isDispatchAcknowledged(load)) return load;
  const fingerprint = dispatchFingerprint(load);
  const stamp = at.toISOString();
  getDb()
    .prepare(
      `UPDATE loads SET
         dispatch_ack_at = ?, dispatch_ack_by = ?, dispatch_ack_driver_id = ?, dispatch_ack_fingerprint = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(stamp, driver.name.trim() || "Driver", driver.id, fingerprint, stamp, loadId);
  recordLoadAudit({
    loadId,
    loadNumber: load.load_number,
    action: "dispatch_ack",
    field: "acknowledged",
    oldValue: "",
    newValue: stamp,
  });
  const next = getLoad(loadId);
  if (!next) throw new Error("Load not found.");
  return next;
}
