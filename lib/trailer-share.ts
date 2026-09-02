import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { DISPLAY_TIME_ZONE, formatDateTime, fromOfficeDateTime } from "./format";
import { normalizeKey } from "./integrations/orbcomm";
import { getTrailer, persistedTrailerLocation } from "./queries";
import type { LoadMapPoint } from "./load-map-shared";
import type { ReeferReading, Trailer } from "./types";

const TOKEN_BYTES = 24;

export type TrailerShareLink = {
  id: number;
  token: string;
  trailer_id: number;
  created_at: string;
  expires_at: string;
  snapshot_latitude: number | null;
  snapshot_longitude: number | null;
  snapshot_address: string;
  snapshot_temperature_f: number | null;
  snapshot_setpoint_f: number | null;
  snapshot_recorded_at: string;
};

export function trailerSharePath(token: string): string {
  return `/t/${token}`;
}

export function newTrailerShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function parseTrailerShareExpiry(value: string, now = new Date()): string {
  const expiresAt = fromOfficeDateTime(value);
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new Error("Pick a future date and time.");
  }
  return expiresAt;
}

export function createTrailerShareLink(
  trailerId: number,
  expiresInput: string,
  now = new Date(),
): TrailerShareLink {
  const trailer = getTrailer(trailerId);
  if (!trailer) throw new Error("Trailer not found.");
  if (!trailer.orbcomm_asset_id.trim()) throw new Error("Link this trailer to Orbcomm first.");
  const expiresAt = parseTrailerShareExpiry(expiresInput, now);
  const createdAt = now.toISOString();
  const snapshot = lastKnownOrbcommSnapshot(trailer);
  const db = getDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = newTrailerShareToken();
    try {
      const result = db
        .prepare(
          `INSERT INTO trailer_share_links (
             token, trailer_id, created_at, expires_at,
             snapshot_latitude, snapshot_longitude, snapshot_address,
             snapshot_temperature_f, snapshot_setpoint_f, snapshot_recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          token,
          trailerId,
          createdAt,
          expiresAt,
          snapshot.latitude,
          snapshot.longitude,
          snapshot.address,
          snapshot.temperature_f,
          snapshot.setpoint_f,
          snapshot.recorded_at,
        );
      return {
        id: Number(result.lastInsertRowid),
        token,
        trailer_id: trailerId,
        created_at: createdAt,
        expires_at: expiresAt,
        snapshot_latitude: snapshot.latitude,
        snapshot_longitude: snapshot.longitude,
        snapshot_address: snapshot.address,
        snapshot_temperature_f: snapshot.temperature_f,
        snapshot_setpoint_f: snapshot.setpoint_f,
        snapshot_recorded_at: snapshot.recorded_at,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/UNIQUE/i.test(message)) throw error;
    }
  }
  throw new Error("Could not create a unique link. Try again.");
}

export function getTrailerShareLink(token: string): TrailerShareLink | null {
  const key = String(token ?? "").trim();
  if (!key || key.length < 20) return null;
  return (
    (getDb()
      .prepare(`SELECT * FROM trailer_share_links WHERE token = ?`)
      .get(key) as TrailerShareLink | undefined) ?? null
  );
}

export function latestTrailerShareLink(trailerId: number): TrailerShareLink | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM trailer_share_links WHERE trailer_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(trailerId) as TrailerShareLink | undefined) ?? null
  );
}

export function trailerShareIsExpired(link: Pick<TrailerShareLink, "expires_at">, now = new Date()): boolean {
  const expires = Date.parse(link.expires_at);
  return !Number.isFinite(expires) || expires <= now.getTime();
}

export function reeferReadingMatchesTrailer(
  row: Pick<ReeferReading, "trailer_id">,
  trailer: Pick<Trailer, "unit_number" | "orbcomm_asset_id">,
): boolean {
  const key = normalizeKey(row.trailer_id);
  if (!key) return false;
  return [trailer.unit_number, trailer.orbcomm_asset_id].map(normalizeKey).filter(Boolean).includes(key);
}

type ShareSnapshot = {
  latitude: number | null;
  longitude: number | null;
  address: string;
  temperature_f: number | null;
  setpoint_f: number | null;
  recorded_at: string;
};

export function lastKnownOrbcommSnapshot(
  trailer: Pick<
    Trailer,
    | "id"
    | "unit_number"
    | "orbcomm_asset_id"
    | "gps_latitude"
    | "gps_longitude"
    | "gps_address"
    | "gps_recorded_at"
    | "gps_source"
  >,
): ShareSnapshot {
  const rows = getDb()
    .prepare(
      `SELECT * FROM reefer_readings
       WHERE trailer_id != '' AND source = 'orbcomm'
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all() as ReeferReading[];
  const reading = rows.find((row) => reeferReadingMatchesTrailer(row, trailer));
  const stored = persistedTrailerLocation(trailer);
  const latitude = finiteCoord(reading?.latitude) ?? finiteCoord(stored?.latitude);
  const longitude = finiteCoord(reading?.longitude) ?? finiteCoord(stored?.longitude);
  const address = String(reading?.address || stored?.address || "").trim();
  const recordedAt = String(
    reading?.recorded_at || ((latitude != null || longitude != null || address) && stored?.recordedAt) || "",
  ).trim();
  return {
    latitude,
    longitude,
    address,
    temperature_f: reading?.temperature_f ?? null,
    setpoint_f: reading?.setpoint_f ?? null,
    recorded_at: recordedAt,
  };
}

function finiteCoord(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function snapshotFromLink(link: TrailerShareLink): ShareSnapshot {
  return {
    latitude: finiteCoord(link.snapshot_latitude),
    longitude: finiteCoord(link.snapshot_longitude),
    address: String(link.snapshot_address ?? "").trim(),
    temperature_f: link.snapshot_temperature_f ?? null,
    setpoint_f: link.snapshot_setpoint_f ?? null,
    recorded_at: String(link.snapshot_recorded_at ?? "").trim(),
  };
}

function lastDefined<T>(values: Array<T | null | undefined>): T | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value != null && value !== "") return value;
  }
  return null;
}

export function listTrailerShareReadings(
  trailer: Pick<Trailer, "unit_number" | "orbcomm_asset_id">,
  createdAt: string,
  now = new Date(),
): ReeferReading[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM reefer_readings
       WHERE trailer_id != '' AND source = 'orbcomm'
       ORDER BY recorded_at ASC, id ASC`,
    )
    .all() as ReeferReading[];
  const endIso = now.toISOString();
  return rows.filter(
    (row) =>
      reeferReadingMatchesTrailer(row, trailer) &&
      row.recorded_at >= createdAt &&
      row.recorded_at <= endIso,
  );
}

export function trailerShareMapPoints(readings: ReeferReading[]): LoadMapPoint[] {
  const withGps = readings.filter(
    (row) =>
      row.latitude != null &&
      row.longitude != null &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude),
  );
  return withGps.map((row, index) => ({
    id: `ping-${row.id}`,
    kind: index === withGps.length - 1 ? "trailer" : "track",
    label: formatDateTime(row.recorded_at),
    lat: row.latitude as number,
    lng: row.longitude as number,
  }));
}

export type TrailerShareView = {
  found: boolean;
  expired: boolean;
  trailerNumber: string;
  createdAt: string;
  expiresAt: string;
  expiresLabel: string;
  timeZone: string;
  temperatureF: number | null;
  setpointF: number | null;
  address: string;
  recordedAt: string;
  points: LoadMapPoint[];
};

export function trailerShareView(token: string, now = new Date()): TrailerShareView {
  const empty: TrailerShareView = {
    found: false,
    expired: false,
    trailerNumber: "",
    createdAt: "",
    expiresAt: "",
    expiresLabel: "",
    timeZone: DISPLAY_TIME_ZONE,
    temperatureF: null,
    setpointF: null,
    address: "",
    recordedAt: "",
    points: [],
  };
  const link = getTrailerShareLink(token);
  if (!link) return empty;
  const trailer = getTrailer(link.trailer_id);
  if (!trailer) return empty;
  const expired = trailerShareIsExpired(link, now);
  const base = {
    found: true,
    expired,
    trailerNumber: trailer.unit_number,
    createdAt: link.created_at,
    expiresAt: link.expires_at,
    expiresLabel: formatDateTime(link.expires_at),
    timeZone: DISPLAY_TIME_ZONE,
    temperatureF: null as number | null,
    setpointF: null as number | null,
    address: "",
    recordedAt: "",
    points: [] as LoadMapPoint[],
  };
  if (expired) return base;
  const snapshot = snapshotFromLink(link);
  const later = listTrailerShareReadings(trailer, link.created_at, now).filter(
    (row) => !snapshot.recorded_at || row.recorded_at !== snapshot.recorded_at,
  );
  const points: LoadMapPoint[] = [];
  if (snapshot.latitude != null && snapshot.longitude != null) {
    points.push({
      id: "ping-snapshot",
      kind: later.length ? "track" : "trailer",
      label: snapshot.recorded_at ? formatDateTime(snapshot.recorded_at) : "Last known",
      lat: snapshot.latitude,
      lng: snapshot.longitude,
    });
  }
  points.push(...trailerShareMapPoints(later));
  if (points.length) points[points.length - 1] = { ...points[points.length - 1], kind: "trailer" };
  return {
    ...base,
    temperatureF: lastDefined([snapshot.temperature_f, ...later.map((row) => row.temperature_f)]),
    setpointF: lastDefined([snapshot.setpoint_f, ...later.map((row) => row.setpoint_f)]),
    address: lastDefined([snapshot.address, ...later.map((row) => row.address)]) ?? "",
    recordedAt: lastDefined([snapshot.recorded_at, ...later.map((row) => row.recorded_at)]) ?? "",
    points,
  };
}
