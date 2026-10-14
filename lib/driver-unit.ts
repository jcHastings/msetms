/**
 * Current unit when a dispatcher assigns a driver.
 * The driver record's truck wins. Otherwise use the truck on that driver's
 * latest non-cancelled load. A truck the dispatcher already picked stays put.
 * Warnings name unit numbers and never block save.
 */

import { isRollingStatus } from "./types";

export type DriverUnit = {
  truckId: number;
  unitNumber: string;
};

export type AssignmentTruckGps = {
  truckId: number;
  unitNumber: string;
  source: string;
  recordedAt: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  loads: Array<{
    loadId: number;
    loadNumber: string;
    driverId: number | null;
    driverName: string;
    status: string;
  }>;
  gpsDriverId: number | null;
  gpsDriverName: string;
};

export type AssignmentUnitFacts = {
  asOf: string;
  quietHours: number;
  drivers: Array<{ driverId: number; truckId: number; unitNumber: string }>;
  trucks: AssignmentTruckGps[];
};

export const EMPTY_ASSIGNMENT_UNIT_FACTS: AssignmentUnitFacts = {
  asOf: "1970-01-01T00:00:00.000Z",
  quietHours: 2,
  drivers: [],
  trucks: [],
};

/** "Mara Quinn" → "Mara". Blank names become "This driver". */
export function driverUsualName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || "This driver";
}

/** Unit 28. Never the truck's internal id. */
export function unitLabel(unitNumber: string | null | undefined): string {
  const text = String(unitNumber ?? "").trim();
  if (!text) return "";
  if (/^unit\b/i.test(text)) return text.replace(/^unit\b/i, "Unit");
  return `Unit ${text}`;
}

export function formRequestsExplicitTruck(value: unknown): boolean {
  return String(value ?? "") === "1";
}

export function truckIdAfterDriverAssign(input: {
  previousDriverId: number | null;
  nextDriverId: number | null;
  previousTruckId: number | null;
  submittedTruckId: number | null;
  truckFieldPresent: boolean;
  truckExplicit: boolean;
  creating: boolean;
  driverUnitTruckId: number | null;
}): number | null {
  const chosen = input.truckFieldPresent ? input.submittedTruckId : input.previousTruckId;
  if (input.truckExplicit) return chosen;
  if (chosen) return chosen;
  const assigning =
    input.nextDriverId != null && (input.creating || input.nextDriverId !== input.previousDriverId);
  if (!assigning) return chosen;
  return input.driverUnitTruckId;
}

export function driverUnitFromFacts(
  facts: AssignmentUnitFacts | undefined,
  driver: { id: number; truck_id?: number | null; truck_unit?: string | null } | null | undefined,
): DriverUnit | null {
  if (!driver) return null;
  const row = facts?.drivers.find((item) => item.driverId === driver.id);
  if (row?.unitNumber.trim()) return { truckId: row.truckId, unitNumber: row.unitNumber.trim() };
  if (driver.truck_id && driver.truck_unit?.trim()) {
    return { truckId: driver.truck_id, unitNumber: driver.truck_unit.trim() };
  }
  return null;
}

/** Keep an explicit truck. Otherwise select the driver's unit when that truck is in the list. */
export function nextTruckSelection(input: {
  truckExplicit: boolean;
  currentTruckId: string;
  usualTruckId: number | null;
  usualListed: boolean;
}): string {
  if (input.truckExplicit) return input.currentTruckId;
  if (input.usualTruckId != null && input.usualListed) return String(input.usualTruckId);
  return input.currentTruckId;
}

export function gpsReadingIsLive(
  truck: Pick<AssignmentTruckGps, "source" | "recordedAt" | "latitude" | "longitude" | "address"> | null,
  now: Date,
  quietHours: number,
): boolean {
  if (!truck || truck.source !== "samsara") return false;
  const hasPlace =
    (truck.latitude != null && truck.longitude != null) || Boolean(String(truck.address ?? "").trim());
  if (!hasPlace) return false;
  const ping = new Date(truck.recordedAt).getTime();
  if (!Number.isFinite(ping)) return false;
  const windowMs = (Number.isFinite(quietHours) && quietHours > 0 ? quietHours : 2) * 3_600_000;
  const age = now.getTime() - ping;
  if (age < 0) return true;
  return age < windowMs;
}

/** Mara usually drives Unit 28; this load is on Unit 27 */
export function usualUnitWarning(input: {
  driverName: string;
  usualUnit: string | null | undefined;
  loadUnit: string | null | undefined;
}): string | null {
  const usual = unitLabel(input.usualUnit);
  const load = unitLabel(input.loadUnit);
  if (!usual || !load || usual === load) return null;
  return `${driverUsualName(input.driverName)} usually drives ${usual}; this load is on ${load}`;
}

export function assignmentUnitWarnings(input: {
  driverName: string;
  usualUnit: string | null | undefined;
  chosenUnit: string | null | undefined;
  truck: AssignmentTruckGps | null;
  chosenDriverId: number | null;
  thisLoadId: number | null;
  now: Date;
  quietHours: number;
}): string[] {
  const warnings: string[] = [];
  const usual = usualUnitWarning({
    driverName: input.driverName,
    usualUnit: input.usualUnit,
    loadUnit: input.chosenUnit,
  });
  if (usual) warnings.push(usual);
  const truck = input.truck;
  if (!truck || !gpsReadingIsLive(truck, input.now, input.quietHours)) return warnings;
  const unit = unitLabel(truck.unitNumber || input.chosenUnit);
  if (!unit) return warnings;
  const otherLoad = truck.loads.find(
    (load) =>
      isRollingStatus(load.status) &&
      load.loadId !== input.thisLoadId &&
      load.driverId != null &&
      load.driverId !== input.chosenDriverId,
  );
  if (otherLoad) {
    const who = otherLoad.driverName.trim() || "another driver";
    const loadNumber = otherLoad.loadNumber.trim();
    warnings.push(
      loadNumber
        ? `${unit}'s latest GPS is on an in-progress load for ${who} (load ${loadNumber}).`
        : `${unit}'s latest GPS is on an in-progress load for ${who}.`,
    );
  }
  const gpsDriverId = truck.gpsDriverId;
  const gpsName = truck.gpsDriverName.trim();
  if (
    gpsDriverId != null &&
    input.chosenDriverId != null &&
    gpsDriverId !== input.chosenDriverId &&
    gpsDriverId !== otherLoad?.driverId
  ) {
    warnings.push(`${unit}'s latest GPS shows ${gpsName || "another driver"} in the truck.`);
  }
  return warnings;
}
