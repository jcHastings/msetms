import { getDb } from "../db";
import {
  getOrbcommAccountId,
  getOrbcommApiBase,
  getOrbcommPassword,
  getOrbcommUsername,
  isOrbcommConfigured,
} from "../env";
import {
  ORBCOMM_CREDS_OR_CSV_MESSAGE,
  orbcommAssetFromUnknown,
  type OrbcommAssetInput,
} from "../fleet-import-shared";
import { listLoads, listTrailers, listTrucks } from "../queries";
import type { ReeferReading, ReeferStatus } from "../types";

const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 15_000;

export type ReeferSnapshot = {
  loadId: number | null;
  truckId: number | null;
  tractorId: string;
  trailerId: string;
  setpointF: number | null;
  temperatureF: number | null;
  returnAirF: number | null;
  supplyAirF: number | null;
  doorOpen: boolean | null;
  powerOn: boolean | null;
  alarm: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  source: "demo" | "orbcomm";
  recordedAt: string;
};

export type TrailerLocation = {
  loadId: number | null;
  trailerId: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  recordedAt: string;
  source: "demo" | "orbcomm";
};

export type ReeferSnapshotResult = {
  mode: "demo" | "orbcomm";
  credentialsSet: boolean;
  error?: string;
  note?: string;
  fetchedAt: string;
  readings: ReeferSnapshot[];
};

export type OrbcommAssetReading = {
  assetId?: string;
  trailerId?: string;
  name?: string;
  vin?: string;
  plate?: string;
  type?: string;
  temperatureF?: number | null;
  setpointF?: number | null;
  returnAirF?: number | null;
  supplyAirF?: number | null;
  powerOn?: boolean | null;
  alarm?: string;
  recordedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string;
};

export type MappedTruck = {
  id: number;
  unit_number: string;
  orbcomm_asset_id: string;
  trailer_number: string;
};

export type MappedLoad = {
  id: number;
  truck_id: number | null;
  trailer_id?: number | null;
  trailer_number: string;
  reefer_setpoint_f: number | null;
};

export type MappedTrailer = {
  id: number;
  unit_number: string;
  orbcomm_asset_id: string;
};

type CacheEntry = { expiresAt: number; result: ReeferSnapshotResult };
let cache: CacheEntry | null = null;

class OrbcommHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(orbcommStatusMessage(status));
    this.name = "OrbcommHttpError";
    this.status = status;
  }
}

export function resetOrbcommCacheForTests(): void {
  cache = null;
}

export function latestReeferForTrailer(trailer: {
  unit_number: string;
  orbcomm_asset_id: string;
}): ReeferReading | null {
  const keys = [trailer.orbcomm_asset_id, trailer.unit_number].map(normalizeKey).filter(Boolean);
  if (keys.length === 0) return null;
  const rows = getDb()
    .prepare(
      `SELECT * FROM reefer_readings
       WHERE trailer_id != ''
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all() as ReeferReading[];
  return rows.find((row) => keys.includes(normalizeKey(row.trailer_id))) ?? null;
}

export function listLatestReeferReadings(source?: "demo" | "orbcomm"): ReeferReading[] {
  const rows = getDb()
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
  return source ? rows.filter((row) => row.source === source) : rows;
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
  if (snapshots.mode === "orbcomm" && !snapshots.error) return null;
  return getDemoReeferForLoad(loadId);
}

export async function getTrailerLocationForLoad(loadId: number): Promise<TrailerLocation | null> {
  const snapshots = await getReeferSnapshots();
  const live = snapshots.readings.find((reading) => reading.loadId === loadId);
  if (live) return snapshotToTrailerLocation(live);
  if (snapshots.mode === "orbcomm" && !snapshots.error) return null;
  const demo = getDemoReeferForLoad(loadId);
  return demo ? snapshotToTrailerLocation(withDemoTrailerLocation(toSnapshot(demo))) : null;
}

export function snapshotToTrailerLocation(snapshot: ReeferSnapshot): TrailerLocation | null {
  if (snapshot.latitude == null && snapshot.longitude == null && !snapshot.address) return null;
  return {
    loadId: snapshot.loadId,
    trailerId: snapshot.trailerId,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    address: snapshot.address,
    recordedAt: snapshot.recordedAt,
    source: snapshot.source,
  };
}

export function toReeferStatus(reading: ReeferReading | null, fallbackSetpoint?: number | null): ReeferStatus | null {
  if (!reading && fallbackSetpoint == null) return null;
  if (!reading) {
    return {
      trailerId: "",
      temperatureF: null,
      setpointF: fallbackSetpoint ?? null,
      returnAirF: null,
      supplyAirF: null,
      alarm: "",
      recordedAt: "",
      source: "demo",
    };
  }
  return {
    trailerId: reading.trailer_id,
    temperatureF: reading.temperature_f,
    setpointF: reading.setpoint_f ?? fallbackSetpoint ?? null,
    returnAirF: reading.return_air_f,
    supplyAirF: reading.supply_air_f,
    alarm: reading.alarm,
    recordedAt: reading.recorded_at,
    source: reading.source === "orbcomm" ? "orbcomm" : "demo",
  };
}

export async function getReeferSnapshots(): Promise<ReeferSnapshotResult> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.result;
  const result = await loadReeferSnapshots();
  cache = { expiresAt: now + CACHE_TTL_MS, result };
  return result;
}

async function loadReeferSnapshots(): Promise<ReeferSnapshotResult> {
  const demo = demoSnapshotResult();
  if (!isOrbcommConfigured()) return demo;

  try {
    const token = await generateOrbcommToken();
    const liveAssets = await tryFetchAssetStatus(token);
    if (liveAssets.length > 0) {
      return {
        mode: "orbcomm",
        credentialsSet: true,
        fetchedAt: new Date().toISOString(),
        readings: snapshotsFromLiveAssets({
          loads: mappingLoads(),
          trucks: mappingTrucks(),
          trailers: mappingTrailers(),
          assets: liveAssets,
        }),
      };
    }

    const imported = listLatestReeferReadings("orbcomm").map(toSnapshot);
    return {
      mode: "orbcomm",
      credentialsSet: true,
      fetchedAt: new Date().toISOString(),
      note: imported.length
        ? "Orbcomm sign-in succeeded. Showing the last imported Reefer Status Report."
        : "Orbcomm sign-in succeeded. Import a Reefer Status Report export to load trailer temps, or ask Orbcomm to enable B2B asset snapshot access.",
      readings: imported,
    };
  } catch (error) {
    return {
      ...demo,
      credentialsSet: true,
      error: publicOrbcommError(error),
    };
  }
}

function demoSnapshotResult(): ReeferSnapshotResult {
  return {
    mode: "demo",
    credentialsSet: isOrbcommConfigured(),
    fetchedAt: new Date().toISOString(),
    readings: listLatestReeferReadings("demo").map(toSnapshot).map(withDemoTrailerLocation),
  };
}

function withDemoTrailerLocation(snapshot: ReeferSnapshot): ReeferSnapshot {
  if (snapshot.latitude != null && snapshot.longitude != null) return snapshot;
  const demo = demoCoordsForTrailer(snapshot.trailerId);
  if (!demo) return snapshot;
  return {
    ...snapshot,
    latitude: demo.latitude,
    longitude: demo.longitude,
    address: snapshot.address || demo.address,
  };
}

function demoCoordsForTrailer(trailerId: string): { latitude: number; longitude: number; address: string } | null {
  const key = normalizeKey(trailerId);
  if (key.includes("7742")) return { latitude: 32.7791, longitude: -96.8002, address: "Dallas, TX" };
  if (key.includes("8801")) return { latitude: 36.1652, longitude: -86.7841, address: "Nashville, TN" };
  return null;
}

export function snapshotToReading(snapshot: ReeferSnapshot): ReeferReading {
  return {
    id: 0,
    load_id: snapshot.loadId,
    truck_id: snapshot.truckId,
    trailer_id: snapshot.trailerId,
    setpoint_f: snapshot.setpointF,
    temperature_f: snapshot.temperatureF,
    return_air_f: snapshot.returnAirF,
    supply_air_f: snapshot.supplyAirF,
    door_open: snapshot.doorOpen == null ? null : snapshot.doorOpen ? 1 : 0,
    alarm: snapshot.alarm,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    address: snapshot.address,
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
    returnAirF: row.return_air_f,
    supplyAirF: row.supply_air_f,
    doorOpen: row.door_open == null ? null : row.door_open === 1,
    powerOn: null,
    alarm: row.alarm,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    address: row.address ?? "",
    source: row.source === "orbcomm" ? "orbcomm" : "demo",
    recordedAt: row.recorded_at,
  };
}

function mappingLoads(): MappedLoad[] {
  return listLoads({ status: "all" }).map((load) => ({
    id: load.id,
    truck_id: load.truck_id,
    trailer_id: load.trailer_id,
    trailer_number: load.trailer_number,
    reefer_setpoint_f: load.reefer_setpoint_f,
  }));
}

function mappingTrucks(): MappedTruck[] {
  return listTrucks().map((truck) => ({
    id: truck.id,
    unit_number: truck.unit_number,
    orbcomm_asset_id: truck.orbcomm_asset_id,
    trailer_number: truck.trailer_number,
  }));
}

function mappingTrailers(): MappedTrailer[] {
  return listTrailers().map((trailer) => ({
    id: trailer.id,
    unit_number: trailer.unit_number,
    orbcomm_asset_id: trailer.orbcomm_asset_id,
  }));
}

function accessTokenFromOrbcommBody(body: Record<string, unknown>): string | undefined {
  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : null;
  return (
    asString(data?.accessToken) ||
    asString(data?.access_token) ||
    asString(body.accessToken) ||
    asString(body.access_token) ||
    asString(body.token) ||
    asString(body.Token)
  );
}

async function generateOrbcommToken(): Promise<string> {
  const userName = getOrbcommUsername();
  const password = getOrbcommPassword();
  if (!userName || !password) throw new Error("Orbcomm credentials are not set.");

  const url = new URL("/SynB2BGatewayService/api/generateToken", getOrbcommApiBase());
  const orgKey = getOrbcommAccountId();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userName,
      password,
      ...(orgKey ? { orgKey } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) throw new OrbcommHttpError(response.status);

  const body = (await response.json()) as Record<string, unknown>;
  const token = accessTokenFromOrbcommBody(body);
  if (!token) {
    throw new Error("Orbcomm token response did not include an access token.");
  }
  return token;
}

export async function listOrbcommFleetAssets(): Promise<
  { ok: true; assets: OrbcommAssetInput[] } | { ok: false; error: string }
> {
  if (!isOrbcommConfigured()) {
    return { ok: false, error: ORBCOMM_CREDS_OR_CSV_MESSAGE };
  }
  try {
    const token = await generateOrbcommToken();
    const readings = await tryFetchAssetStatus(token);
    const assets = readings
      .map((reading) =>
        orbcommAssetFromUnknown({
          assetId: reading.assetId,
          trailerId: reading.trailerId,
          name: reading.name,
          vin: reading.vin,
          plate: reading.plate,
          type: reading.type,
        }),
      )
      .filter((asset) => asset.assetId || asset.unitNumber);
    if (assets.length === 0) {
      return {
        ok: false,
        error:
          "Orbcomm API did not return a trailer list. Upload a CSV/export from Orbcomm (do not scrape the portal).",
      };
    }
    return { ok: true, assets };
  } catch (error) {
    return { ok: false, error: publicOrbcommImportError(error) };
  }
}

async function tryFetchAssetStatus(token: string): Promise<OrbcommAssetReading[]> {
  const assetNames = listTrailers()
    .filter((trailer) => trailer.active !== 0)
    .map((trailer) => trailer.unit_number.trim())
    .filter(Boolean);
  if (assetNames.length === 0) return [];
  try {
    const url = new URL("/SynB2BGatewayService/api/getAssetStatus", getOrbcommApiBase());
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assetNames,
        assetGroupNames: [],
        watermark: null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as Record<string, unknown>;
    const code = typeof body.code === "number" ? body.code : Number(body.code);
    if (code === 1008 || code === 1007) return [];
    if (code && code !== 1000) return [];
    const parsed = normalizeOrbcommPayload(body);
    if (parsed.length) return parsed;
  } catch {
    // Fail-soft to import/demo.
  }
  return [];
}

export function normalizeOrbcommPayload(body: unknown): OrbcommAssetReading[] {
  if (!body) return [];
  if (Array.isArray(body)) return body.map(normalizeOrbcommRow).filter(hasIdentity);
  if (typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const rows = record.data ?? record.assets ?? record.rows ?? record.result ?? record.Results;
  return Array.isArray(rows) ? rows.map(normalizeOrbcommRow).filter(hasIdentity) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function flattenLiveAsset(row: Record<string, unknown>): Record<string, unknown> {
  const assetStatus = asRecord(row.assetStatus) ?? asRecord(row.AssetStatus);
  const positionStatus = asRecord(row.positionStatus) ?? asRecord(row.PositionStatus);
  const reeferStatus = asRecord(row.reeferStatus) ?? asRecord(row.ReeferStatus);
  return {
    ...row,
    ...(assetStatus ?? {}),
    ...(positionStatus ?? {}),
    ...(reeferStatus ?? {}),
  };
}

function celsiusToF(value: number): number {
  return Math.round((value * (9 / 5) + 32) * 10) / 10;
}

function liveTempF(item: Record<string, unknown>, keys: string[]): number | null {
  const value = firstNumber(item, keys);
  if (value == null) return null;
  return celsiusToF(value);
}

function parseReeferPower(item: Record<string, unknown>): boolean | null {
  const text = [
    firstString(item, ["reeferPowerDesc", "reeferPower1Desc", "reeferState", "operationMode", "power", "Power"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/power\s*off|\boff\b|shutdown|stopped/.test(text) && !/power\s*on/.test(text)) return false;
  if (/power\s*on|\bon\b|continuous|start/.test(text)) return true;
  const controller = item.controllerOn ?? item.controller_on;
  if (controller === true || controller === 1 || controller === "1" || controller === "true") return true;
  if (controller === false || controller === 0 || controller === "0" || controller === "false") return false;
  return null;
}

function liveAlarms(item: Record<string, unknown>): string {
  const raw = item.activeAlarms ?? item.alarms ?? item.alarm ?? item.Alarm;
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") parts.push(entry);
      else if (entry && typeof entry === "object") {
        const rec = entry as Record<string, unknown>;
        const label = asString(rec.description) || asString(rec.name) || asString(rec.code) || asString(rec.alarm);
        if (label) parts.push(label);
      }
    }
  } else if (typeof raw === "string") {
    parts.push(raw);
  }
  for (const key of ["shutdown", "tempAlert", "temp_alert", "temperatureAlert"]) {
    const extra = asString(item[key]);
    if (extra) parts.push(extra);
  }
  return parts
    .map((part) => part.trim())
    .filter((part) => part && !/^(passed|fta alarm disable|n\/a|none|ok)$/i.test(part))
    .join("; ");
}

function hasIdentity(row: OrbcommAssetReading): boolean {
  return Boolean(row.assetId || row.trailerId || row.name);
}

function normalizeOrbcommRow(row: unknown): OrbcommAssetReading {
  if (!row || typeof row !== "object") return {};
  const item = flattenLiveAsset(row as Record<string, unknown>);
  const liveReturn = liveTempF(item, ["returnTemp", "return_temp", "ReturnTemp"]);
  const liveSetpoint = liveTempF(item, ["setpointTemp", "setpoint_temp", "SetpointTemp"]);
  const city = firstString(item, ["city", "City", "nearestCity"]);
  const state = firstString(item, ["state", "State", "region"]);
  const address =
    firstString(item, ["address", "Address", "location", "Location", "formattedAddress"]) ||
    [city, state].filter(Boolean).join(", ");
  return {
    assetId: firstString(item, ["assetId", "asset_id", "AssetId", "id", "ID", "unitId", "assetName", "asset_name"]),
    trailerId: firstString(item, [
      "trailerId",
      "trailer_id",
      "TrailerId",
      "trailerNumber",
      "assetName",
      "name",
    ]),
    name: firstString(item, ["name", "Name", "assetName", "trailerNumber", "trailer_id"]),
    vin: firstString(item, ["vin", "VIN", "Vin", "vehicleVin"]),
    plate: firstString(item, ["plate", "Plate", "licensePlate", "license_plate"]),
    type: firstString(item, ["type", "Type", "equipmentType", "equipment"]),
    temperatureF:
      liveReturn ??
      firstTempF(item, [
        "temperatureF",
        "temperature_f",
        "tempF",
        "ambientF",
        "returnAirF",
        "ReturnAir",
        "temperature",
      ]),
    setpointF: liveSetpoint ?? firstTempF(item, ["setpointF", "setpoint_f", "setPointF", "Setpoint", "setpoint"]),
    returnAirF: liveReturn ?? firstTempF(item, ["returnAirF", "return_air_f", "ReturnAir"]),
    supplyAirF: firstTempF(item, ["supplyAirF", "supply_air_f", "SupplyAir"]),
    powerOn: parseReeferPower(item),
    alarm: liveAlarms(item) || firstString(item, ["alarm", "Alarm", "alarms"]) || "",
    recordedAt:
      firstString(item, [
        "recordedAt",
        "recorded_at",
        "lastReportTime",
        "LastReportTime",
        "timestamp",
        "time",
      ]) ?? undefined,
    latitude: firstNumber(item, ["latitude", "Latitude", "lat", "Lat", "LAT"]),
    longitude: firstNumber(item, ["longitude", "Longitude", "lng", "lon", "Lon", "LNG"]),
    address: address ?? "",
  };
}

export function mapOrbcommReadingsToLoads(input: {
  loads: MappedLoad[];
  trucks: MappedTruck[];
  assets: OrbcommAssetReading[];
  trailers?: MappedTrailer[];
}): ReeferSnapshot[] {
  const readings: ReeferSnapshot[] = [];
  const trailers = input.trailers ?? [];
  for (const load of input.loads) {
    const truck = resolveTruckForLoad(load, input.trucks);
    const trailer = load.trailer_id != null ? trailers.find((item) => item.id === load.trailer_id) : undefined;
    if (!truck && !trailer && !load.trailer_number) continue;
    const asset = findAsset(input.assets, [
      trailer?.orbcomm_asset_id ?? "",
      trailer?.unit_number ?? "",
      truck?.orbcomm_asset_id ?? "",
      load.trailer_number,
      truck?.trailer_number ?? "",
    ]);
    if (!asset) continue;
    const temperatureF = asset.temperatureF ?? asset.returnAirF ?? asset.supplyAirF ?? null;
    const setpointF = asset.setpointF ?? load.reefer_setpoint_f;
    const hasLocation = asset.latitude != null && asset.longitude != null;
    if (temperatureF == null && setpointF == null && !hasLocation && !asset.address) continue;
    readings.push({
      loadId: load.id,
      truckId: truck?.id ?? null,
      tractorId: truck?.unit_number ?? "",
      trailerId: asset.trailerId || asset.name || asset.assetId || load.trailer_number || truck?.trailer_number || "",
      setpointF,
      temperatureF,
      returnAirF: asset.returnAirF ?? null,
      supplyAirF: asset.supplyAirF ?? null,
      doorOpen: null,
      powerOn: asset.powerOn ?? null,
      alarm: asset.alarm ?? "",
      latitude: asset.latitude ?? null,
      longitude: asset.longitude ?? null,
      address: asset.address ?? "",
      source: "orbcomm",
      recordedAt: asset.recordedAt || new Date().toISOString(),
    });
  }
  return readings;
}

export function snapshotsFromLiveAssets(input: {
  loads: MappedLoad[];
  trucks: MappedTruck[];
  assets: OrbcommAssetReading[];
  trailers?: MappedTrailer[];
}): ReeferSnapshot[] {
  const assigned = mapOrbcommReadingsToLoads(input);
  const used = new Set(assigned.map((row) => normalizeKey(row.trailerId)));
  const extras: ReeferSnapshot[] = [];
  for (const asset of input.assets) {
    const trailerId = asset.trailerId || asset.name || asset.assetId || "";
    if (!trailerId || used.has(normalizeKey(trailerId))) continue;
    const temperatureF = asset.temperatureF ?? asset.returnAirF ?? asset.supplyAirF ?? null;
    const hasLocation = asset.latitude != null && asset.longitude != null;
    if (temperatureF == null && asset.setpointF == null && !hasLocation && !asset.address && !asset.alarm && asset.powerOn == null) {
      continue;
    }
    extras.push({
      loadId: null,
      truckId: null,
      tractorId: "",
      trailerId,
      setpointF: asset.setpointF ?? null,
      temperatureF,
      returnAirF: asset.returnAirF ?? null,
      supplyAirF: asset.supplyAirF ?? null,
      doorOpen: null,
      powerOn: asset.powerOn ?? null,
      alarm: asset.alarm ?? "",
      latitude: asset.latitude ?? null,
      longitude: asset.longitude ?? null,
      address: asset.address ?? "",
      source: "orbcomm",
      recordedAt: asset.recordedAt || new Date().toISOString(),
    });
  }
  return [...assigned, ...extras];
}

function resolveTruckForLoad(load: MappedLoad, trucks: MappedTruck[]): MappedTruck | undefined {
  if (load.truck_id != null) {
    const assigned = trucks.find((truck) => truck.id === load.truck_id);
    if (assigned) return assigned;
  }
  const trailerNumber = normalizeKey(load.trailer_number);
  if (!trailerNumber) return undefined;
  return trucks.find(
    (truck) =>
      normalizeKey(truck.trailer_number) === trailerNumber ||
      normalizeKey(truck.orbcomm_asset_id) === trailerNumber,
  );
}

function findAsset(assets: OrbcommAssetReading[], keys: string[]): OrbcommAssetReading | undefined {
  const wanted = keys.map(normalizeKey).filter(Boolean);
  return assets.find((asset) => {
    const ids = [asset.assetId, asset.trailerId, asset.name].map((value) => normalizeKey(value ?? ""));
    return ids.some((id) => id && wanted.includes(id));
  });
}

export function parseOrbcommReport(text: string): OrbcommAssetReading[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return normalizeOrbcommPayload(JSON.parse(trimmed));
  }
  return parseCsv(trimmed);
}

function parseCsv(text: string): OrbcommAssetReading[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return normalizeOrbcommRow(row);
  }).filter(hasIdentity);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

export function importOrbcommReadings(assets: OrbcommAssetReading[]): number {
  const readings = mapOrbcommReadingsToLoads({
    loads: mappingLoads(),
    trucks: mappingTrucks(),
    trailers: mappingTrailers(),
    assets,
  });
  for (const reading of readings) {
    insertReeferReading({
      load_id: reading.loadId,
      truck_id: reading.truckId,
      trailer_id: reading.trailerId,
      setpoint_f: reading.setpointF,
      temperature_f: reading.temperatureF,
      return_air_f: reading.returnAirF,
      supply_air_f: reading.supplyAirF,
      door_open: reading.doorOpen == null ? null : reading.doorOpen ? 1 : 0,
      alarm: reading.alarm,
      latitude: reading.latitude,
      longitude: reading.longitude,
      address: reading.address,
      source: "orbcomm",
      recorded_at: reading.recordedAt,
    });
  }
  cache = null;
  return readings.length;
}

export function insertReeferReading(input: Omit<ReeferReading, "id">): void {
  getDb()
    .prepare(
        `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, return_air_f, supply_air_f, door_open, alarm, latitude, longitude, address, source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.load_id,
      input.truck_id,
      input.trailer_id,
      input.setpoint_f,
      input.temperature_f,
      input.return_air_f ?? null,
      input.supply_air_f ?? null,
      input.door_open,
      input.alarm,
      input.latitude ?? null,
      input.longitude ?? null,
      input.address ?? "",
      input.source,
      input.recorded_at,
    );
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-#]/g, "");
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(item[key]);
    if (value) return value;
  }
  return undefined;
}

function firstNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(item[key]);
    if (value != null) return value;
  }
  return null;
}

function firstTempF(item: Record<string, unknown>, keys: string[]): number | null {
  const value = firstNumber(item, keys);
  if (value == null) return null;
  if (Math.abs(value) < 60 && keys.some((key) => /celsius|tempc/i.test(key))) {
    return Math.round((value * (9 / 5) + 32) * 10) / 10;
  }
  return Math.round(value * 10) / 10;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function orbcommStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `Orbcomm rejected the credentials (HTTP ${status}).`;
  }
  return `Orbcomm request failed (HTTP ${status}).`;
}

function publicOrbcommError(error: unknown): string {
  if (error instanceof OrbcommHttpError) return error.message;
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "Orbcomm request timed out.";
  }
  return "Orbcomm request failed.";
}

function publicOrbcommImportError(error: unknown): string {
  if (error instanceof OrbcommHttpError) {
    if (error.status === 401 || error.status === 403) {
      return `Orbcomm rejected the credentials (HTTP ${error.status}).`;
    }
    return `Orbcomm request failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "Orbcomm request timed out.";
  }
  return "Orbcomm request failed.";
}
