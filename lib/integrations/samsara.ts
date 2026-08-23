import { getDb } from "../db";
import { getSamsaraApiToken, isSamsaraTokenSet } from "../env";
import { listLoads, listTrucks } from "../queries";
import type { ReeferReading } from "../types";

const SAMSARA_BASE = "https://api.samsara.com";
const CACHE_TTL_MS = 45_000;
const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 15_000;

const VEHICLE_TYPES =
  "reeferAmbientAirTemperatureMilliC,reeferSetPointTemperatureMilliC,reeferDoorOpen";
const VEHICLE_TYPES_FALLBACK =
  "reeferAmbientAirTemperatureMilliC,reeferSetPointTemperatureMilliCZone1,reeferDoorOpen";
const TRAILER_TYPES =
  "reeferAmbientAirTemperatureMilliC,reeferSetPointTemperatureMilliCZone1,reeferDoorOpen";

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

export type SamsaraMode = "demo" | "samsara";

export type ReeferSnapshotResult = {
  mode: SamsaraMode;
  tokenSet: boolean;
  error?: string;
  fetchedAt: string;
  readings: ReeferSnapshot[];
};

export type SamsaraAssetStat = {
  id?: string;
  name?: string;
  [key: string]: unknown;
};

export type MappedTruck = {
  id: number;
  unit_number: string;
  samsara_vehicle_id: string;
  samsara_trailer_id: string;
  trailer_number: string;
};

export type MappedLoad = {
  id: number;
  truck_id: number | null;
  trailer_number: string;
  reefer_setpoint_f: number | null;
};

type CacheEntry = {
  expiresAt: number;
  result: ReeferSnapshotResult;
};

let cache: CacheEntry | null = null;

class SamsaraHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(samsaraStatusMessage(status));
    this.name = "SamsaraHttpError";
    this.status = status;
  }
}

export function isSamsaraConfigured(): boolean {
  return isSamsaraTokenSet();
}

export function resetSamsaraCacheForTests(): void {
  cache = null;
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

export function getDemoReeferForLoad(loadId: number): ReeferReading | null {
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

export async function getLatestReeferForLoad(loadId: number): Promise<ReeferReading | null> {
  const snapshots = await getReeferSnapshots();
  const live = snapshots.readings.find((reading) => reading.loadId === loadId);
  if (live) return snapshotToReading(live);
  if (snapshots.mode === "samsara" && !snapshots.error) return null;
  return getDemoReeferForLoad(loadId);
}

export async function getReeferSnapshots(): Promise<ReeferSnapshotResult> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.result;

  const result = await loadReeferSnapshots();
  cache = { expiresAt: now + CACHE_TTL_MS, result };
  return result;
}

async function loadReeferSnapshots(): Promise<ReeferSnapshotResult> {
  const tokenSet = isSamsaraTokenSet();
  const demo = demoSnapshotResult();

  if (!tokenSet) return demo;

  try {
    const live = await fetchLiveSamsaraReadings();
    return live;
  } catch (error) {
    return {
      ...demo,
      tokenSet: true,
      error: publicSamsaraError(error),
    };
  }
}

function demoSnapshotResult(): ReeferSnapshotResult {
  return {
    mode: "demo",
    tokenSet: isSamsaraTokenSet(),
    fetchedAt: new Date().toISOString(),
    readings: listLatestReeferReadings().map(toSnapshot),
  };
}

export function snapshotToReading(snapshot: ReeferSnapshot): ReeferReading {
  return {
    id: 0,
    load_id: snapshot.loadId,
    truck_id: snapshot.truckId,
    trailer_id: snapshot.trailerId,
    setpoint_f: snapshot.setpointF,
    temperature_f: snapshot.temperatureF,
    door_open: snapshot.doorOpen == null ? null : snapshot.doorOpen ? 1 : 0,
    alarm: snapshot.alarm,
    source: snapshot.source,
    recorded_at: snapshot.recordedAt,
  };
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

async function fetchLiveSamsaraReadings(): Promise<ReeferSnapshotResult> {
  const vehicleAttempt = await tryFetchAssets("/fleet/vehicles/stats", VEHICLE_TYPES, VEHICLE_TYPES_FALLBACK);
  const trailerAttempt = await tryFetchAssets("/fleet/trailers/stats", TRAILER_TYPES);

  const authFailed =
    isAuthFailure(vehicleAttempt.error) || isAuthFailure(trailerAttempt.error);
  const bothFailed = Boolean(vehicleAttempt.error && trailerAttempt.error);
  const noAssets = vehicleAttempt.assets.length === 0 && trailerAttempt.assets.length === 0;

  if (authFailed || bothFailed || noAssets) {
    const demo = demoSnapshotResult();
    return {
      ...demo,
      tokenSet: true,
      error: publicSamsaraError(vehicleAttempt.error ?? trailerAttempt.error ?? new Error("Samsara returned no fleet data.")),
    };
  }

  const loads = listLoads({ status: "all" }).map((load) => ({
    id: load.id,
    truck_id: load.truck_id,
    trailer_number: load.trailer_number,
    reefer_setpoint_f: load.reefer_setpoint_f,
  }));
  const trucks = listTrucks().map((truck) => ({
    id: truck.id,
    unit_number: truck.unit_number,
    samsara_vehicle_id: truck.samsara_vehicle_id,
    samsara_trailer_id: truck.samsara_trailer_id,
    trailer_number: truck.trailer_number,
  }));

  const readings = mapLiveReadingsToLoads({
    loads,
    trucks,
    vehicles: vehicleAttempt.assets,
    trailers: trailerAttempt.assets,
  });

  const partial = vehicleAttempt.error && !trailerAttempt.error
    ? publicSamsaraError(vehicleAttempt.error)
    : trailerAttempt.error && !vehicleAttempt.error
      ? publicSamsaraError(trailerAttempt.error)
      : undefined;

  return {
    mode: "samsara",
    tokenSet: true,
    error: partial,
    fetchedAt: new Date().toISOString(),
    readings,
  };
}

async function tryFetchAssets(
  pathname: string,
  types: string,
  fallbackTypes?: string,
): Promise<{ assets: SamsaraAssetStat[]; error?: unknown }> {
  try {
    const assets = await fetchAllPages(pathname, types);
    return { assets };
  } catch (error) {
    if (fallbackTypes && error instanceof SamsaraHttpError && error.status === 400) {
      try {
        return { assets: await fetchAllPages(pathname, fallbackTypes) };
      } catch (retryError) {
        return { assets: [], error: retryError };
      }
    }
    return { assets: [], error };
  }
}

async function fetchAllPages(pathname: string, types: string): Promise<SamsaraAssetStat[]> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");

  const items: SamsaraAssetStat[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(pathname, SAMSARA_BASE);
    url.searchParams.set("types", types);
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new SamsaraHttpError(response.status);
    }

    const body = (await response.json()) as {
      data?: SamsaraAssetStat[];
      pagination?: { endCursor?: string; hasNextPage?: boolean };
    };
    items.push(...(body.data ?? []));
    if (!body.pagination?.hasNextPage || !body.pagination.endCursor) break;
    after = body.pagination.endCursor;
  }

  return items;
}

export function mapLiveReadingsToLoads(input: {
  loads: MappedLoad[];
  trucks: MappedTruck[];
  vehicles: SamsaraAssetStat[];
  trailers: SamsaraAssetStat[];
}): ReeferSnapshot[] {
  const readings: ReeferSnapshot[] = [];

  for (const load of input.loads) {
    const truck = resolveTruckForLoad(load, input.trucks);
    if (!truck && !load.trailer_number) continue;

    const vehicle = findAsset(input.vehicles, {
      ids: [truck?.samsara_vehicle_id ?? ""],
      names: [truck?.unit_number ?? ""],
    });
    const trailer = findAsset(input.trailers, {
      ids: [truck?.samsara_trailer_id ?? "", load.trailer_number, truck?.trailer_number ?? ""],
      names: [load.trailer_number, truck?.trailer_number ?? "", truck?.samsara_trailer_id ?? ""],
    });

    if (!vehicle && !trailer) continue;

    const parsedTrailer = parseAssetReading(trailer);
    const parsedVehicle = parseAssetReading(vehicle);
    const temperatureF = parsedTrailer.temperatureF ?? parsedVehicle.temperatureF;
    const setpointF = parsedTrailer.setpointF ?? parsedVehicle.setpointF ?? load.reefer_setpoint_f;
    const recordedAt = parsedTrailer.recordedAt ?? parsedVehicle.recordedAt;
    const doorOpen = parsedTrailer.doorOpen ?? parsedVehicle.doorOpen;

    if (temperatureF == null && setpointF == null) continue;

    readings.push({
      loadId: load.id,
      truckId: truck?.id ?? null,
      tractorId: String(vehicle?.id ?? truck?.samsara_vehicle_id ?? truck?.unit_number ?? ""),
      trailerId: String(
        trailer?.name ?? trailer?.id ?? load.trailer_number ?? truck?.trailer_number ?? "",
      ),
      setpointF,
      temperatureF,
      doorOpen,
      alarm: "",
      source: "samsara",
      recordedAt: recordedAt ?? new Date().toISOString(),
    });
  }

  return readings;
}

function resolveTruckForLoad(load: MappedLoad, trucks: MappedTruck[]): MappedTruck | undefined {
  if (load.truck_id != null) {
    const assigned = trucks.find((truck) => truck.id === load.truck_id);
    if (assigned) return assigned;
  }
  const trailerNumber = normalizeKey(load.trailer_number);
  if (!trailerNumber) return undefined;
  return trucks.find((truck) => normalizeKey(truck.trailer_number) === trailerNumber);
}

function findAsset(
  assets: SamsaraAssetStat[],
  keys: { ids: string[]; names: string[] },
): SamsaraAssetStat | undefined {
  const idKeys = keys.ids.map(normalizeKey).filter(Boolean);
  const nameKeys = keys.names.map(normalizeKey).filter(Boolean);

  return assets.find((asset) => {
    const id = normalizeKey(String(asset.id ?? ""));
    const name = normalizeKey(String(asset.name ?? ""));
    if (id && idKeys.includes(id)) return true;
    if (name && (nameKeys.includes(name) || idKeys.includes(name))) return true;
    if (id && nameKeys.includes(id)) return true;
    return false;
  });
}

function parseAssetReading(asset: SamsaraAssetStat | undefined): {
  temperatureF: number | null;
  setpointF: number | null;
  doorOpen: boolean | null;
  recordedAt: string | null;
} {
  if (!asset) {
    return { temperatureF: null, setpointF: null, doorOpen: null, recordedAt: null };
  }

  const ambient = readStat(asset, [
    "reeferAmbientAirTemperatureMilliC",
    "reeferReturnAirTemperatureMilliCZone1",
  ]);
  const setpoint = readStat(asset, [
    "reeferSetPointTemperatureMilliC",
    "reeferSetPointTemperatureMilliCZone1",
  ]);
  const door = readStat(asset, ["reeferDoorOpen", "reeferDoorStateZone1"]);

  return {
    temperatureF: milliCToF(asNumber(ambient?.value)),
    setpointF: milliCToF(asNumber(setpoint?.value)),
    doorOpen: asDoorOpen(door?.value),
    recordedAt: ambient?.time ?? setpoint?.time ?? door?.time ?? null,
  };
}

function readStat(
  asset: SamsaraAssetStat,
  keys: string[],
): { value: unknown; time?: string } | undefined {
  for (const key of keys) {
    const raw = asset[key];
    if (raw == null) continue;
    if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "string") {
      return { value: raw };
    }
    if (typeof raw === "object") {
      const record = raw as { value?: unknown; time?: string };
      if (record.value !== undefined) {
        return { value: record.value, time: typeof record.time === "string" ? record.time : undefined };
      }
    }
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function asDoorOpen(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["open", "true", "1", "yes"].includes(normalized)) return true;
    if (["closed", "false", "0", "no", "shut"].includes(normalized)) return false;
  }
  return null;
}

export function milliCToF(value?: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const celsius = value / 1000;
  return Math.round((celsius * (9 / 5) + 32) * 10) / 10;
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-#]/g, "");
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof SamsaraHttpError && (error.status === 401 || error.status === 403);
}

function samsaraStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `Samsara rejected the API token (HTTP ${status}). Check SAMSARA_API_TOKEN and token scopes, then restart. Showing demo temps.`;
  }
  if (status === 429) {
    return "Samsara rate-limited the request. Showing demo temps.";
  }
  return `Samsara request failed (HTTP ${status}). Showing demo temps.`;
}

function publicSamsaraError(error: unknown): string {
  if (error instanceof SamsaraHttpError) return error.message;
  if (error instanceof Error) {
    const message = error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    if (/abort|timeout/i.test(message)) {
      return "Samsara request timed out. Showing demo temps.";
    }
    return "Samsara request failed. Showing demo temps.";
  }
  return "Samsara request failed. Showing demo temps.";
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
