import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { DISPLAY_TIME_ZONE, formatDateTime, fromOfficeDateTime } from "./format";
import { lastSentMail } from "./mail-store";
import { getLoad, getTrailer } from "./queries";
import { listStops } from "./stops";
import { lastKnownOrbcommSnapshot } from "./trailer-share";
import { isBillableStatus, type LoadView } from "./types";

const TOKEN_BYTES = 24;

export type LoadShareLink = {
  id: number;
  token: string;
  load_id: number;
  created_at: string;
  expires_at: string;
};

export type LoadShareMilestone = {
  key: "booked" | "pickup" | "in_transit" | "delivered" | "invoice_sent";
  title: string;
  at: string;
  detail: string;
};

export function loadSharePath(token: string): string {
  return `/l/${token}`;
}

export function newLoadShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function parseLoadShareExpiry(value: string, now = new Date()): string {
  const expiresAt = fromOfficeDateTime(value);
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new Error("Pick a future date and time.");
  }
  return expiresAt;
}

export function createLoadShareLink(loadId: number, expiresInput: string, now = new Date()): LoadShareLink {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const expiresAt = parseLoadShareExpiry(expiresInput, now);
  const createdAt = now.toISOString();
  const db = getDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = newLoadShareToken();
    try {
      const result = db
        .prepare(
          `INSERT INTO load_share_links (token, load_id, created_at, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(token, loadId, createdAt, expiresAt);
      return {
        id: Number(result.lastInsertRowid),
        token,
        load_id: loadId,
        created_at: createdAt,
        expires_at: expiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/UNIQUE/i.test(message)) throw error;
    }
  }
  throw new Error("Could not create a unique link. Try again.");
}

export function getLoadShareLink(token: string): LoadShareLink | null {
  const key = String(token ?? "").trim();
  if (!key || key.length < 20) return null;
  return (
    (getDb().prepare(`SELECT * FROM load_share_links WHERE token = ?`).get(key) as LoadShareLink | undefined) ?? null
  );
}

export function latestLoadShareLink(loadId: number): LoadShareLink | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM load_share_links WHERE load_id = ? ORDER BY id DESC LIMIT 1`)
      .get(loadId) as LoadShareLink | undefined) ?? null
  );
}

export function loadShareIsExpired(link: Pick<LoadShareLink, "expires_at">, now = new Date()): boolean {
  const expires = Date.parse(link.expires_at);
  return !Number.isFinite(expires) || expires <= now.getTime();
}

const AFTER_PICKUP = new Set([
  "picked_up",
  "in_transit",
  "at_delivery",
  "unloading",
  "delivered",
  "completed",
  "accounting",
]);

const AFTER_TRANSIT = new Set(["in_transit", "at_delivery", "unloading", "delivered", "completed", "accounting"]);

function pickupHappened(load: LoadView): boolean {
  if (AFTER_PICKUP.has(load.status)) return true;
  if (load.driver_progress === "loaded" || load.driver_progress === "en_route_delivery" || load.driver_progress === "delivered") {
    return true;
  }
  return listStops(load.id).some(
    (stop) => stop.kind === "pickup" && (Boolean(stop.delivered) || String(stop.departed_at || "").trim()),
  );
}

function transitHappened(load: LoadView): boolean {
  if (AFTER_TRANSIT.has(load.status)) return true;
  return load.driver_progress === "en_route_delivery" || load.driver_progress === "delivered";
}

export function loadShareMilestones(load: LoadView): LoadShareMilestone[] {
  const steps: LoadShareMilestone[] = [
    {
      key: "booked",
      title: "Booked",
      at: load.created_at,
      detail: load.customer_name,
    },
  ];
  if (pickupHappened(load)) {
    const pickup = listStops(load.id).find((stop) => stop.kind === "pickup");
    steps.push({
      key: "pickup",
      title: "Pickup",
      at: String(pickup?.departed_at || pickup?.arrived_at || load.pickup_end || load.pickup_start || load.updated_at),
      detail: load.origin,
    });
  }
  if (transitHappened(load)) {
    steps.push({
      key: "in_transit",
      title: "In Transit",
      at: load.updated_at,
      detail: `${load.origin} → ${load.destination}`,
    });
  }
  if (isBillableStatus(load.status) || load.status === "delivered") {
    steps.push({
      key: "delivered",
      title: "Delivered",
      at: load.delivery_end || load.updated_at,
      detail: load.destination,
    });
  }
  const sent = lastSentMail(load.id, "customer_invoice");
  if (sent) {
    steps.push({
      key: "invoice_sent",
      title: "Invoice sent",
      at: sent.created_at,
      detail: "",
    });
  }
  return steps;
}

export type LoadShareView = {
  found: boolean;
  expired: boolean;
  loadNumber: string;
  customerName: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  expiresLabel: string;
  timeZone: string;
  milestones: LoadShareMilestone[];
  trailerNumber: string;
  temperatureF: number | null;
  address: string;
  trailerLat: number | null;
  trailerLng: number | null;
};

export function loadShareView(token: string, now = new Date()): LoadShareView {
  const empty: LoadShareView = {
    found: false,
    expired: false,
    loadNumber: "",
    customerName: "",
    status: "",
    createdAt: "",
    expiresAt: "",
    expiresLabel: "",
    timeZone: DISPLAY_TIME_ZONE,
    milestones: [],
    trailerNumber: "",
    temperatureF: null,
    address: "",
    trailerLat: null,
    trailerLng: null,
  };
  const link = getLoadShareLink(token);
  if (!link) return empty;
  const load = getLoad(link.load_id);
  if (!load) return empty;
  const expired = loadShareIsExpired(link, now);
  const base = {
    found: true,
    expired,
    loadNumber: load.load_number,
    customerName: load.customer_name,
    status: load.status,
    createdAt: link.created_at,
    expiresAt: link.expires_at,
    expiresLabel: formatDateTime(link.expires_at),
    timeZone: DISPLAY_TIME_ZONE,
    milestones: [] as LoadShareMilestone[],
    trailerNumber: load.trailer_unit ?? "",
    temperatureF: null as number | null,
    address: "",
    trailerLat: null as number | null,
    trailerLng: null as number | null,
  };
  if (expired) return base;
  const trailer = load.trailer_id != null ? getTrailer(load.trailer_id) : null;
  const snapshot = trailer?.orbcomm_asset_id.trim() ? lastKnownOrbcommSnapshot(trailer) : null;
  return {
    ...base,
    milestones: loadShareMilestones(load),
    temperatureF: snapshot?.temperature_f ?? null,
    address: snapshot?.address ?? "",
    trailerLat: snapshot?.latitude ?? null,
    trailerLng: snapshot?.longitude ?? null,
  };
}
