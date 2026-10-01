import { normalizeUnit } from "./fuel";
import {
  isDriverLoginEligible,
  listDrivers,
  listTruckEngineHourReadings,
  listTrucks,
  TRUCK_ENGINE_HOUR_STATS,
  type TruckEngineHourReading,
  type TruckEngineHourStat,
} from "./queries";

/**
 * Engine-on hours source, per truck, for one NY Mon-Sun window.
 *
 * 1. obdEngineSeconds wins when that truck has any OBD point at or before the week end.
 * 2. syntheticEngineSeconds is used only when OBD points are absent.
 * 3. If OBD points exist but do not form a valid week pair, engine-on hours stay blank.
 *    Synthetic seconds are not substituted for a bad or incomplete OBD series.
 *
 * Idle hours use idlingDurationMilliseconds only. There is no other idle source.
 * Week figures are deltas of the cumulative counter. A single point, a lifetime total,
 * or a delta longer than the window is blank. Nothing is estimated from gallons or miles.
 */
export const IDLE_HOURS_STAT = "idlingDurationMilliseconds" as const satisfies TruckEngineHourStat;
export const ENGINE_HOURS_PRIMARY_STAT = "obdEngineSeconds" as const satisfies TruckEngineHourStat;
export const ENGINE_HOURS_FALLBACK_STAT = "syntheticEngineSeconds" as const satisfies TruckEngineHourStat;
export const ENGINE_HOUR_HISTORY_TYPES = "idlingDurationMilliseconds,obdEngineSeconds,syntheticEngineSeconds";

export type EngineHoursStatusKind = "live" | "persisted" | "unavailable";

export type EngineHoursSourceStatus = {
  label: "Samsara idle / engine hours";
  status: EngineHoursStatusKind;
  note: string;
};

export type EngineHourSubject = {
  subjectKey: string;
  driverId: number | null;
  driverName: string;
  unit: string;
  truckId: number | null;
  idleHours: number | null;
  engineHours: number | null;
  engineStat: typeof ENGINE_HOURS_PRIMARY_STAT | typeof ENGINE_HOURS_FALLBACK_STAT | null;
};

export type SamsaraEngineHourPoint = {
  hours: number;
  recordedAt: string;
  stat: TruckEngineHourStat;
};

const HOURS_PER_STAT: Record<TruckEngineHourStat, number> = {
  idlingDurationMilliseconds: 3_600_000,
  obdEngineSeconds: 3600,
  syntheticEngineSeconds: 3600,
};

export function samsaraEngineHoursSourceStatus(input: {
  tokenSet: boolean;
  readingCount: number;
  error?: string;
}): EngineHoursSourceStatus {
  const label = "Samsara idle / engine hours" as const;
  const rule =
    "Engine-on hours use obdEngineSeconds when that truck has them, otherwise syntheticEngineSeconds.";
  if (input.error && input.readingCount === 0) {
    if (/Read Vehicle Statistics/i.test(input.error)) {
      return {
        label,
        status: "unavailable",
        note: "Samsara did not allow Read Vehicle Statistics. Idle and engine-on hours stay blank.",
      };
    }
    if (/rejected the API token|token is not set/i.test(input.error)) {
      return {
        label,
        status: "unavailable",
        note: "Samsara rejected the API token. Idle and engine-on hours stay blank.",
      };
    }
    return {
      label,
      status: "unavailable",
      note: "Samsara did not return idle or engine hours. Hours stay blank.",
    };
  }
  if (!input.tokenSet && input.readingCount === 0) {
    return {
      label,
      status: "unavailable",
      note: "Samsara token is not set. Idle and engine-on hours stay blank.",
    };
  }
  if (!input.tokenSet) {
    return {
      label,
      status: "persisted",
      note: `Samsara token is not set. Using stored idle and engine-hour readings only. ${rule}`,
    };
  }
  if (input.error && input.readingCount > 0) {
    return {
      label,
      status: "persisted",
      note: `Live Samsara pull failed. Using stored readings only. ${rule} A blank truck is missing data, not zero.`,
    };
  }
  if (input.readingCount === 0) {
    return {
      label,
      status: "live",
      note: "Samsara is connected. No idle or engine-hour pair for this week yet.",
    };
  }
  return {
    label,
    status: "live",
    note: `Idle hours are the Samsara idling-duration delta for this NY Mon-Sun week. ${rule} A blank truck is missing data, not zero.`,
  };
}

export function engineHourWindowCap(startIso: string, endIso: string): number {
  const span = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(span) || span <= 0) return 168;
  return span / 3_600_000 + 1;
}

export function roundEngineHours(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Start-to-end delta of one cumulative stat. Zero is a real reading. Blank means unknown. */
export function cumulativeDeltaHours(
  readings: Array<Pick<TruckEngineHourReading, "id" | "recorded_at" | "hours" | "stat">>,
  startIso: string,
  endIso: string,
  stat: TruckEngineHourStat,
): number | null {
  const series = readings
    .filter((row) => row.stat === stat && row.recorded_at <= endIso)
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.id - right.id);
  if (series.length < 2) return null;
  const inWindow = series.filter((row) => row.recorded_at >= startIso);
  const startReading = [...series].reverse().find((row) => row.recorded_at <= startIso) ?? inWindow[0] ?? null;
  const endReading = inWindow.length ? inWindow[inWindow.length - 1] : null;
  if (!startReading || !endReading || startReading.id === endReading.id) return null;
  const delta = endReading.hours - startReading.hours;
  if (!Number.isFinite(delta) || delta < 0 || delta > engineHourWindowCap(startIso, endIso)) return null;
  return roundEngineHours(delta);
}

export function engineHoursDelta(
  readings: Array<Pick<TruckEngineHourReading, "id" | "recorded_at" | "hours" | "stat">>,
  startIso: string,
  endIso: string,
): { hours: number | null; stat: EngineHourSubject["engineStat"] } {
  const obd = readings.some((row) => row.stat === ENGINE_HOURS_PRIMARY_STAT && row.recorded_at <= endIso);
  if (obd) {
    return {
      hours: cumulativeDeltaHours(readings, startIso, endIso, ENGINE_HOURS_PRIMARY_STAT),
      stat: ENGINE_HOURS_PRIMARY_STAT,
    };
  }
  const synthetic = readings.some((row) => row.stat === ENGINE_HOURS_FALLBACK_STAT && row.recorded_at <= endIso);
  if (synthetic) {
    return {
      hours: cumulativeDeltaHours(readings, startIso, endIso, ENGINE_HOURS_FALLBACK_STAT),
      stat: ENGINE_HOURS_FALLBACK_STAT,
    };
  }
  return { hours: null, stat: null };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Cumulative points from one vehicle stats history row. No timestamp means the point is dropped. */
export function extractSamsaraEngineHourPoints(vehicle: Record<string, unknown>): SamsaraEngineHourPoint[] {
  const nested = (vehicle.vehicle ?? {}) as Record<string, unknown>;
  const out: SamsaraEngineHourPoint[] = [];
  const seen = new Set<string>();
  for (const stat of TRUCK_ENGINE_HOUR_STATS) {
    const raw = vehicle[stat] ?? nested[stat];
    const rows = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const value = asNumber(rec.value);
      const recordedAt = typeof rec.time === "string" ? rec.time : "";
      if (value == null || value < 0 || !recordedAt) continue;
      const key = `${stat}:${recordedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ hours: value / HOURS_PER_STAT[stat], recordedAt, stat });
    }
  }
  return out;
}

function truckForDriver(
  driver: { id: number; truck_id?: number | null; truck_unit?: string | null },
  trucks: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null }>,
) {
  return (
    (driver.truck_id ? trucks.find((truck) => truck.id === driver.truck_id) : undefined) ??
    trucks.find((truck) => truck.assigned_driver_id === driver.id)
  );
}

export function engineHoursForSubject(
  subject: { key: string; driverId: number | null; unit: string },
  rows: EngineHourSubject[],
): EngineHourSubject | null {
  if (subject.driverId != null) {
    const byDriver = rows.find((row) => row.driverId === subject.driverId);
    if (byDriver) return byDriver;
  }
  const unit = normalizeUnit(subject.unit);
  if (unit) {
    const byUnit = rows.find((row) => normalizeUnit(row.unit) === unit);
    if (byUnit) return byUnit;
  }
  return rows.find((row) => row.subjectKey === subject.key) ?? null;
}

export function engineHoursFromReadings(
  window: { fromIso: string; toIso: string },
  input?: {
    trucks?: Array<{ id: number; unit_number: string; assigned_driver_id?: number | null; samsara_vehicle_id?: string }>;
    drivers?: Array<{
      id: number;
      name: string;
      truck_id?: number | null;
      truck_unit?: string | null;
      active: number;
      termination_date?: string | null;
    }>;
    readings?: TruckEngineHourReading[];
  },
): EngineHourSubject[] {
  const trucks = input?.trucks ?? listTrucks();
  const drivers = (input?.drivers ?? listDrivers()).filter((driver) => isDriverLoginEligible(driver));
  const readings = input?.readings ?? listTruckEngineHourReadings();
  const byTruck = new Map<number, TruckEngineHourReading[]>();
  for (const row of readings) {
    const list = byTruck.get(row.truck_id) ?? [];
    list.push(row);
    byTruck.set(row.truck_id, list);
  }
  const usedTrucks = new Set<number>();
  const out: EngineHourSubject[] = [];

  for (const driver of drivers) {
    const truck = truckForDriver(driver, trucks);
    const unit = truck?.unit_number || driver.truck_unit || "";
    const series = truck ? (byTruck.get(truck.id) ?? []) : [];
    const idleHours = truck ? cumulativeDeltaHours(series, window.fromIso, window.toIso, IDLE_HOURS_STAT) : null;
    const engine = truck ? engineHoursDelta(series, window.fromIso, window.toIso) : { hours: null, stat: null };
    if (truck) usedTrucks.add(truck.id);
    out.push({
      subjectKey: `d:${driver.id}`,
      driverId: driver.id,
      driverName: driver.name,
      unit,
      truckId: truck?.id ?? null,
      idleHours,
      engineHours: engine.hours,
      engineStat: engine.stat,
    });
  }

  for (const truck of trucks) {
    if (usedTrucks.has(truck.id)) continue;
    const series = byTruck.get(truck.id) ?? [];
    const idleHours = cumulativeDeltaHours(series, window.fromIso, window.toIso, IDLE_HOURS_STAT);
    const engine = engineHoursDelta(series, window.fromIso, window.toIso);
    if (idleHours == null && engine.hours == null) continue;
    out.push({
      subjectKey: `u:${normalizeUnit(truck.unit_number)}`,
      driverId: truck.assigned_driver_id ?? null,
      driverName: "Unassigned",
      unit: truck.unit_number,
      truckId: truck.id,
      idleHours,
      engineHours: engine.hours,
      engineStat: engine.stat,
    });
  }

  return out;
}

export function engineHoursForDriverWindow(
  readings: TruckEngineHourReading[],
  truckId: number | null | undefined,
  startIso: string,
  endIso: string,
): { idleHours: number | null; engineHours: number | null; engineStat: EngineHourSubject["engineStat"] } {
  if (truckId == null) return { idleHours: null, engineHours: null, engineStat: null };
  const series = readings.filter((row) => row.truck_id === truckId);
  const engine = engineHoursDelta(series, startIso, endIso);
  return {
    idleHours: cumulativeDeltaHours(series, startIso, endIso, IDLE_HOURS_STAT),
    engineHours: engine.hours,
    engineStat: engine.stat,
  };
}
