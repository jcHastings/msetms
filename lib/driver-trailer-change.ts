/**
 * Driver trailer pick on the current load.
 * The current trailer stays selected. An empty load suggests the trailer from
 * the driver's latest load. Warnings name trailers by unit number and never block save.
 */

export const TRAILER_TRUCK_FAR_MILES = 25;
export const TRAILER_GPS_QUIET_HOURS = 2;
export const TRAILER_NUMBER_MAX = 24;

export type TrailerGpsFix = {
  latitude: number | null;
  longitude: number | null;
  recordedAt: string;
  source: string;
};

export type DriverTrailerOption = {
  id: number;
  unitNumber: string;
  gps: TrailerGpsFix | null;
  otherLoadNumber: string;
};

export type DriverTrailerSuggestionSource = "current" | "latest" | "none";

export type DriverTrailerChangeFacts = {
  asOf: string;
  quietHours: number;
  farMiles: number;
  assignedUnit: string;
  suggestedUnit: string;
  suggestionSource: DriverTrailerSuggestionSource;
  latestUnit: string;
  truck: TrailerGpsFix | null;
  trailers: DriverTrailerOption[];
};

export function trailerUnitLabel(unitNumber: string | null | undefined): string {
  return String(unitNumber ?? "").trim().replace(/\s+/g, " ");
}

export function trailerUnitsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = trailerUnitLabel(left);
  const b = trailerUnitLabel(right);
  return Boolean(a) && a.toLowerCase() === b.toLowerCase();
}

export function normalizeTrailerNumber(value: string): string | null {
  const text = trailerUnitLabel(value);
  if (!text || text.length > TRAILER_NUMBER_MAX) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(text)) return null;
  return text;
}

export function driverTrailerChangeSentence(fromUnit: string, toUnit: string): string {
  const from = trailerUnitLabel(fromUnit) || "none";
  const to = trailerUnitLabel(toUnit) || "none";
  return `Driver changed trailer from ${from} to ${to}`;
}

export function suggestDriverTrailer(input: {
  currentUnit: string | null | undefined;
  latestUnit: string | null | undefined;
}): { unit: string; source: DriverTrailerSuggestionSource } {
  const current = trailerUnitLabel(input.currentUnit);
  if (current) return { unit: current, source: "current" };
  const latest = trailerUnitLabel(input.latestUnit);
  if (latest) return { unit: latest, source: "latest" };
  return { unit: "", source: "none" };
}

export function initialTrailerSelection(
  facts: DriverTrailerChangeFacts,
): { trailerId: number | null; customNumber: string } {
  const match = facts.trailers.find((trailer) => trailerUnitsEqual(trailer.unitNumber, facts.suggestedUnit));
  if (match) return { trailerId: match.id, customNumber: "" };
  if (facts.suggestedUnit.trim()) return { trailerId: null, customNumber: trailerUnitLabel(facts.suggestedUnit) };
  return { trailerId: null, customNumber: "" };
}

export function trailerOnOtherLoadWarning(unit: string, loadNumber: string): string {
  const name = trailerUnitLabel(unit);
  if (!name) return "";
  const load = loadNumber.trim();
  return load
    ? `${name} is on an in-progress load for another driver (load ${load}).`
    : `${name} is on an in-progress load for another driver.`;
}

export function trailerFarFromTruckWarning(unit: string): string {
  const name = trailerUnitLabel(unit);
  if (!name) return "";
  return `${name}'s latest GPS is far from your truck.`;
}

export function trailerNotAssignedWarning(assigned: string, picked: string): string {
  const from = trailerUnitLabel(assigned);
  const to = trailerUnitLabel(picked);
  if (!from || !to || trailerUnitsEqual(from, to)) return "";
  return `Dispatch assigned ${from}. This is ${to}.`;
}

function quietWindowMs(quietHours: number): number {
  const hours = Number.isFinite(quietHours) && quietHours > 0 ? quietHours : TRAILER_GPS_QUIET_HOURS;
  return hours * 3_600_000;
}

export function trailerGpsFixIsLive(
  fix: TrailerGpsFix | null | undefined,
  source: string,
  now: Date,
  quietHours: number,
): boolean {
  if (!fix || fix.source !== source) return false;
  if (fix.latitude == null || fix.longitude == null) return false;
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return false;
  const ping = new Date(fix.recordedAt).getTime();
  if (!Number.isFinite(ping)) return false;
  const age = now.getTime() - ping;
  if (age < 0) return true;
  return age < quietWindowMs(quietHours);
}

export function trailerTruckSeparationMiles(
  truck: TrailerGpsFix | null | undefined,
  trailer: TrailerGpsFix | null | undefined,
  now: Date,
  quietHours: number,
): number | null {
  if (!trailerGpsFixIsLive(truck, "samsara", now, quietHours)) return null;
  if (!trailerGpsFixIsLive(trailer, "orbcomm", now, quietHours)) return null;
  return milesBetween(truck!.latitude!, truck!.longitude!, trailer!.latitude!, trailer!.longitude!);
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pickedTrailerForChange(
  facts: DriverTrailerChangeFacts,
  trailerId: number | null,
  customNumber: string,
): { unit: string; option: DriverTrailerOption | null } | null {
  const typed = customNumber.trim();
  if (typed) {
    const custom = normalizeTrailerNumber(typed);
    if (!custom) return null;
    const option = facts.trailers.find((trailer) => trailerUnitsEqual(trailer.unitNumber, custom)) ?? null;
    return { unit: option?.unitNumber ?? custom, option };
  }
  if (trailerId == null) return null;
  const option = facts.trailers.find((trailer) => trailer.id === trailerId) ?? null;
  if (!option) return null;
  return { unit: option.unitNumber, option };
}

export function driverTrailerWarnings(input: {
  facts: DriverTrailerChangeFacts;
  trailerId: number | null;
  customNumber: string;
}): string[] {
  const picked = pickedTrailerForChange(input.facts, input.trailerId, input.customNumber);
  if (!picked) return [];
  const warnings: string[] = [];
  const otherLoad = picked.option?.otherLoadNumber.trim() ?? "";
  if (otherLoad) {
    const text = trailerOnOtherLoadWarning(picked.unit, otherLoad);
    if (text) warnings.push(text);
  }
  const now = new Date(input.facts.asOf);
  const farMiles =
    Number.isFinite(input.facts.farMiles) && input.facts.farMiles > 0
      ? input.facts.farMiles
      : TRAILER_TRUCK_FAR_MILES;
  const miles = trailerTruckSeparationMiles(
    input.facts.truck,
    picked.option?.gps ?? null,
    now,
    input.facts.quietHours,
  );
  if (miles != null && miles >= farMiles) {
    const text = trailerFarFromTruckWarning(picked.unit);
    if (text) warnings.push(text);
  }
  const mismatch = trailerNotAssignedWarning(input.facts.assignedUnit, picked.unit);
  if (mismatch) warnings.push(mismatch);
  return warnings;
}
