export type FleetMapKind = "truck" | "trailer";

export type FleetMapMotion = "Parked" | "Moving";

export type OrbcommReeferPinStatus = "running" | "off" | "shutdown" | "unknown";

export const ORBCOMM_REEFER_PIN_COLOR: Record<OrbcommReeferPinStatus, string> = {
  running: "#16a34a",
  off: "#eab308",
  shutdown: "#dc2626",
  unknown: "#64748b",
};

export const ORBCOMM_MOVING_SPEED_MPH = 5;

export type FleetMapPinShape = "circle" | "arrow";

export type FleetMapPin = {
  id: string;
  label: string;
  kind: FleetMapKind;
  lat: number;
  lng: number;
  href: string;
  motion?: FleetMapMotion | "";
  speedMph?: number | null;
  headingDeg?: number | null;
  pinShape?: FleetMapPinShape;
  recordedAt?: string;
  reeferStatus?: OrbcommReeferPinStatus;
  pinColor?: string;
};

export type FleetMapMissing = {
  id: number;
  label: string;
  href: string;
};

export type FleetStatusRow = {
  id: string;
  trailer: string;
  href: string;
  power: string;
  setpointF: number | null;
  temperatureF: number | null;
  alarm: string;
  location: string;
  messageAt: string;
};

export type FleetMapModel = {
  title: string;
  sourceNote: string;
  pins: FleetMapPin[];
  missing: FleetMapMissing[];
  statusRows?: FleetStatusRow[];
};

export function motionFromSpeedMph(speedMph: number | null | undefined): FleetMapMotion | "" {
  if (speedMph == null || Number.isNaN(speedMph)) return "";
  return Math.abs(speedMph) < 1 ? "Parked" : "Moving";
}

export function orbcommTrailerMoving(speedMph: number | null | undefined): boolean {
  return speedMph != null && Number.isFinite(speedMph) && speedMph >= ORBCOMM_MOVING_SPEED_MPH;
}

export function orbcommPinShape(speedMph: number | null | undefined): FleetMapPinShape {
  return orbcommTrailerMoving(speedMph) ? "arrow" : "circle";
}

export function plottableCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function isPlottableCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return plottableCoord(lat, lng) != null;
}

export function classifyOrbcommReeferMode(raw: string | null | undefined): OrbcommReeferPinStatus {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return "unknown";
  if (/\bshut[\s-]*down\b/.test(text) && !/\b(disable|disabled)\b/.test(text)) return "shutdown";
  if (/(power\s*off|unit\s*off|reefer\s*off|\boff\b|stopped)/.test(text) && !/(power\s*on|unit\s*on|running|\bon\b)/.test(text)) {
    return "off";
  }
  if (/(power\s*on|unit\s*on|running|\bon\b|continuous|start[\s/_-]*stop|cycle[\s-]*sentry)/.test(text)) {
    return "running";
  }
  return "unknown";
}

export function reeferPinStatusFromSnapshot(input: {
  operatingMode?: string | null;
  powerOn?: boolean | null;
}): OrbcommReeferPinStatus {
  const fromMode = classifyOrbcommReeferMode(input.operatingMode);
  if (fromMode !== "unknown") return fromMode;
  if (input.powerOn === true) return "running";
  if (input.powerOn === false) return "off";
  return "unknown";
}

export function orbcommReeferPinColor(status: OrbcommReeferPinStatus): string {
  return ORBCOMM_REEFER_PIN_COLOR[status];
}
