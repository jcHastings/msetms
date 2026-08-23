import { getDb } from "../db";
import type { ReeferReading } from "../types";

export type ReeferSnapshot = {
  loadId: number | null;
  truckId: number | null;
  tractorId: string;
  trailerId: string;
  setpointF: number | null;
  temperatureF: number | null;
  doorOpen: boolean | null;
  alarm: string;
  source: "demo" | "samsara";
  recordedAt: string;
};

export function isSamsaraConfigured(): boolean {
  return Boolean(process.env.SAMSARA_API_TOKEN?.trim());
}

export function listLatestReeferReadings(): ReeferReading[] {
  return getDb()
    .prepare(
      `SELECT r.* FROM reefer_readings r
       JOIN (
         SELECT load_id, MAX(recorded_at) AS recorded_at
         FROM reefer_readings
         WHERE load_id IS NOT NULL
         GROUP BY load_id
       ) latest ON latest.load_id = r.load_id AND latest.recorded_at = r.recorded_at
       ORDER BY r.recorded_at DESC`,
    )
    .all() as ReeferReading[];
}

export function getLatestReeferForLoad(loadId: number): ReeferReading | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM reefer_readings
         WHERE load_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1`,
      )
      .get(loadId) as ReeferReading | undefined) ?? null
  );
}

export async function getReeferSnapshots(): Promise<{
  mode: "demo" | "samsara";
  error?: string;
  readings: ReeferSnapshot[];
}> {
  if (!isSamsaraConfigured()) {
    return {
      mode: "demo",
      readings: listLatestReeferReadings().map(toSnapshot),
    };
  }

  try {
    const live = await fetchSamsaraReefer();
    return { mode: "samsara", readings: live };
  } catch (error) {
    return {
      mode: "samsara",
      error: error instanceof Error ? error.message : "Samsara request failed.",
      readings: [],
    };
  }
}

function toSnapshot(row: ReeferReading): ReeferSnapshot {
  return {
    loadId: row.load_id,
    truckId: row.truck_id,
    tractorId: row.truck_id ? String(row.truck_id) : "",
    trailerId: row.trailer_id,
    setpointF: row.setpoint_f,
    temperatureF: row.temperature_f,
    doorOpen: row.door_open == null ? null : row.door_open === 1,
    alarm: row.alarm,
    source: row.source,
    recordedAt: row.recorded_at,
  };
}

async function fetchSamsaraReefer(): Promise<ReeferSnapshot[]> {
  const token = process.env.SAMSARA_API_TOKEN?.trim();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");

  const url = new URL("https://api.samsara.com/fleet/vehicles/stats");
  url.searchParams.set(
    "types",
    "reeferAmbientAirTemperatureMilliC,reeferSetPointTemperatureMilliC,reeferDoorOpen,reeferAlarm",
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Samsara returned ${response.status}. Check the token and API access.`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      reeferAmbientAirTemperatureMilliC?: { value?: number; time?: string };
      reeferSetPointTemperatureMilliC?: { value?: number };
      reeferDoorOpen?: { value?: boolean };
      reeferAlarm?: { value?: string };
    }>;
  };

  return (body.data ?? []).map((vehicle) => ({
    loadId: null,
    truckId: null,
    tractorId: vehicle.id ?? vehicle.name ?? "",
    trailerId: "",
    setpointF: milliCToF(vehicle.reeferSetPointTemperatureMilliC?.value),
    temperatureF: milliCToF(vehicle.reeferAmbientAirTemperatureMilliC?.value),
    doorOpen: vehicle.reeferDoorOpen?.value ?? null,
    alarm: vehicle.reeferAlarm?.value ?? "",
    source: "samsara" as const,
    recordedAt: vehicle.reeferAmbientAirTemperatureMilliC?.time ?? new Date().toISOString(),
  }));
}

function milliCToF(value?: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const celsius = value / 1000;
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

export function insertReeferReading(input: Omit<ReeferReading, "id">): void {
  getDb()
    .prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, door_open, alarm, source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.load_id,
      input.truck_id,
      input.trailer_id,
      input.setpoint_f,
      input.temperature_f,
      input.door_open,
      input.alarm,
      input.source,
      input.recorded_at,
    );
}
