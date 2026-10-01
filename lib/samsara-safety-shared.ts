import { fromOfficeDateTime } from "./format";
import { SAMSARA_ID_MISSING_MESSAGE, SAMSARA_TOKEN_MISSING_MESSAGE } from "./fleet-import-shared";
import { isClosedStatus } from "./types";

/** Samsara token scope for GET /fleet/safety-events/stream. */
export const SAMSARA_SAFETY_SCOPES = "Read Safety Events & Scores";

/** Truck unit card looks back this far. Not a guess of events — only the query window. */
export const TRUCK_SAFETY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export const TRUCK_SAFETY_WINDOW_LABEL = "Last 7 days";

export const SAMSARA_SAFETY_PAGE_CAP = 4;
export const SAMSARA_SAFETY_EVENT_CAP = 40;

export type SamsaraSafetyReason =
  | "ok"
  | "empty"
  | "token_missing"
  | "scopes"
  | "unmapped"
  | "no_truck"
  | "no_window"
  | "unavailable"
  | "rate_limit";

export type SamsaraSafetyEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  labels: string[];
  dismissed: boolean;
};

export type SamsaraSafetyResult = {
  ok: boolean;
  reason: SamsaraSafetyReason;
  message: string;
  events: SamsaraSafetyEvent[];
  truncated: boolean;
};

const KNOWN_LABELS: Record<string, string> = {
  acceleration: "Acceleration",
  aggressivedriving: "Aggressive driving",
  bluetoothheadset: "Bluetooth headset",
  braking: "Braking",
  contextconstructionorworkzone: "Work zone",
  contextsnowyoricy: "Snow / ice",
  contextvulnerableroaduser: "Vulnerable road user",
  contextwet: "Wet road",
  crash: "Crash",
  defensivedriving: "Defensive driving",
  didnotyield: "Did not yield",
  drinking: "Drinking",
  drowsy: "Drowsy",
  eating: "Eating",
  eatingdrinking: "Eating",
  edgedistracteddriving: "Distraction",
  edgerailroadcrossingviolation: "Railroad crossing",
  followingdistance: "Following distance",
  followingdistancemoderate: "Following distance",
  followingdistancesevere: "Following distance",
  forwardcollisionwarning: "Forward collision",
  genericdistraction: "Distraction",
  generictailgating: "Tailgating",
  harshimpact: "Harsh impact",
  harshturn: "Harsh turn",
  heavyspeeding: "Heavy speeding",
  highspeedsuddendisconnect: "High speed disconnect",
  hosviolation: "HOS",
  idling: "Idling",
  invalid: "Invalid",
  lanedeparture: "Lane departure",
  lateresponse: "Late response",
  leftturn: "Left turn",
  lightspeeding: "Light speeding",
  maxspeed: "Max speed",
  mobileusage: "Mobile",
  moderatespeeding: "Moderate speeding",
  nearcollison: "Near collision",
  nearpedestriancollision: "Near pedestrian",
  noseatbelt: "No seatbelt",
  obstructedcamera: "Camera blocked",
  operationalevent: "Operational",
  otherviolation: "Other violation",
  passenger: "Passenger",
  policyviolationmask: "Mask",
  protectiveequipment: "Protective equipment",
  proximitywarning: "Proximity",
  ranredlight: "Ran red light",
  rearcollisionwarning: "Rear collision",
  reversing: "Reversing",
  rollingstop: "Rolling stop",
  rolloverprotection: "Rollover",
  severespeeding: "Severe speeding",
  smoking: "Smoking",
  speeding: "Speeding",
  uturn: "U-turn",
  unsafemaneuver: "Unsafe maneuver",
  unsafeparking: "Unsafe parking",
  vehicleinblindspotwarning: "Blind spot",
  vulnerableroadusercollisionwarning: "Vulnerable road user",
  yawcontrol: "Yaw",
};

export function samsaraSafetyFailure(
  reason: Exclude<SamsaraSafetyReason, "ok" | "empty">,
  message?: string,
): SamsaraSafetyResult {
  return {
    ok: false,
    reason,
    message: message ?? safetyMessage(reason),
    events: [],
    truncated: false,
  };
}

export function samsaraSafetyOk(events: SamsaraSafetyEvent[], truncated = false): SamsaraSafetyResult {
  return {
    ok: true,
    reason: events.length ? "ok" : "empty",
    message: "",
    events,
    truncated,
  };
}

function safetyMessage(reason: Exclude<SamsaraSafetyReason, "ok" | "empty">): string {
  switch (reason) {
    case "token_missing":
      return `${SAMSARA_TOKEN_MISSING_MESSAGE} Need ${SAMSARA_SAFETY_SCOPES}.`;
    case "scopes":
      return `Samsara rejected the token. Need ${SAMSARA_SAFETY_SCOPES}.`;
    case "unmapped":
      return SAMSARA_ID_MISSING_MESSAGE;
    case "no_truck":
      return "No truck assigned.";
    case "no_window":
      return "No usable pickup / delivery window on this load.";
    case "rate_limit":
      return "Samsara rate-limited safety events. Try again in a minute.";
    case "unavailable":
      return "Safety events didn't load. Nothing on the load was changed.";
  }
}

/** Shop-floor label. Known Samsara labels map; anything else is spaced, not dropped. */
export function safetyLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const known = KNOWN_LABELS[trimmed.toLowerCase().replace(/[\s_-]+/g, "")];
  if (known) return known;
  const spaced = trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function safetyTitle(labels: string[]): string {
  const shown: string[] = [];
  for (const label of labels) {
    const next = safetyLabel(label);
    if (!next || shown.includes(next)) continue;
    shown.push(next);
  }
  return shown.join(" · ") || "Safety event";
}

export function safetyDetail(id: string, dismissed: boolean): string {
  return dismissed ? `event ${id} · dismissed` : `event ${id}`;
}

export function recentSafetyWindow(now: Date): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - TRUCK_SAFETY_LOOKBACK_MS).toISOString(),
    end: now.toISOString(),
  };
}

export function parseLoadInstant(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[zZ]$/.test(raw) && !/[+-]\d{2}:?\d{2}$/.test(raw)) {
    try {
      return new Date(fromOfficeDateTime(raw.length === 16 ? raw : raw.slice(0, 16)));
    } catch {
      return null;
    }
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Load window for the assigned truck. Open loads run through now so late events still show. */
export function safetyWindowForLoad(
  load: {
    pickup_start?: string | null;
    pickup_end?: string | null;
    delivery_start?: string | null;
    delivery_end?: string | null;
    status?: string | null;
  },
  now: Date,
): { start: string; end: string } | null {
  const start = parseLoadInstant(load.pickup_start) ?? parseLoadInstant(load.pickup_end);
  if (!start) return null;
  const appointmentEnd =
    parseLoadInstant(load.delivery_end) ??
    parseLoadInstant(load.delivery_start) ??
    parseLoadInstant(load.pickup_end) ??
    start;
  const closed = isClosedStatus(String(load.status ?? ""));
  const end = closed ? appointmentEnd : new Date(Math.max(appointmentEnd.getTime(), now.getTime()));
  if (end.getTime() < start.getTime()) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

function readInstant(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value.trim());
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
}

function readAssetId(row: Record<string, unknown>): string {
  const asset = row.asset;
  if (asset && typeof asset === "object" && "id" in asset) {
    return String((asset as { id?: unknown }).id ?? "").trim();
  }
  const vehicle = row.vehicle;
  if (vehicle && typeof vehicle === "object" && "id" in vehicle) {
    return String((vehicle as { id?: unknown }).id ?? "").trim();
  }
  return "";
}

export function assetMatchesVehicle(assetId: string, vehicleId: string): boolean {
  const want = vehicleId.trim();
  const id = assetId.trim();
  if (!want || !id) return false;
  if (id === want) return true;
  return id.split(",").some((part) => part.trim() === want);
}

function readLabels(row: Record<string, unknown>): string[] {
  const raw = row.behaviorLabels;
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      labels.push(item.trim());
      continue;
    }
    if (item && typeof item === "object" && "label" in item) {
      const label = String((item as { label?: unknown }).label ?? "").trim();
      if (label) labels.push(label);
    }
  }
  return labels;
}

function inWindow(iso: string, start: string, end: string): boolean {
  const time = Date.parse(iso);
  const from = Date.parse(start);
  const to = Date.parse(end);
  if ([time, from, to].some((value) => Number.isNaN(value))) return false;
  return time >= from && time <= to;
}

/** Keep only real events for this vehicle and window. Unknown labels stay, unlabeled rows stay, missing id/time drop. */
export function parseSamsaraSafetyEvents(
  rows: unknown,
  input: { vehicleId: string; start: string; end: string },
): SamsaraSafetyEvent[] {
  const list = Array.isArray(rows) ? rows : [];
  const events: SamsaraSafetyEvent[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (!assetMatchesVehicle(readAssetId(record), input.vehicleId)) continue;
    const at = readInstant(record.startMs) || readInstant(record.time) || readInstant(record.createdAtTime);
    if (!at || !inWindow(at, input.start, input.end)) continue;
    const labels = readLabels(record);
    const dismissed = String(record.eventState ?? "").trim().toLowerCase() === "dismissed";
    seen.add(id);
    events.push({
      id,
      at,
      title: safetyTitle(labels),
      detail: safetyDetail(id, dismissed),
      labels,
      dismissed,
    });
  }
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  return events;
}
