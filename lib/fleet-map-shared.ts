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

/** Samsara fleet map: on/moving are green; off is gray-black. */
export const SAMSARA_TRUCK_ON_COLOR = "#22c55e";
export const SAMSARA_TRUCK_OFF_COLOR = "#1f2937";

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

export type FleetPinLabelOrigin = { x: number; y: number };

const PIN_LABEL_CLUSTER_DECIMALS = 4;
const PIN_LABEL_CENTER = 5;
const PIN_LABEL_Y_SLOTS = [0, -12, 12] as const;

export function clusterPinLabelSlots(
  pins: Array<{ id: string; lat: number; lng: number; label?: string }>,
): Map<string, number> {
  const groups = new Map<string, Array<{ id: string; lat: number; lng: number; label?: string }>>();
  for (const pin of pins) {
    const key = `${pin.lat.toFixed(PIN_LABEL_CLUSTER_DECIMALS)},${pin.lng.toFixed(PIN_LABEL_CLUSTER_DECIMALS)}`;
    const list = groups.get(key) ?? [];
    list.push(pin);
    groups.set(key, list);
  }
  const slots = new Map<string, number>();
  for (const list of groups.values()) {
    list.sort((left, right) => (left.label ?? left.id).localeCompare(right.label ?? right.id));
    list.forEach((pin, index) => slots.set(pin.id, index));
  }
  return slots;
}

export function unitLabelBesideOrigin(text: string, slot = 0): FleetPinLabelOrigin {
  const chars = Math.max(1, text.trim().length);
  const xMag = PIN_LABEL_CENTER + 6 + chars * 4;
  const side = slot % 2 === 0 ? 1 : -1;
  const y = PIN_LABEL_CENTER + PIN_LABEL_Y_SLOTS[Math.floor(slot / 2) % PIN_LABEL_Y_SLOTS.length];
  return { x: PIN_LABEL_CENTER + side * xMag, y };
}

export function fleetMapDisplayPoints(pins: FleetMapPin[]): Array<
  FleetMapPin & { markerText: string; labelClassName: string; labelOrigin: FleetPinLabelOrigin }
> {
  const slots = clusterPinLabelSlots(pins);
  return pins.map((pin) => ({
    ...pin,
    markerText: pin.label,
    labelClassName: "fleet-pin-label",
    labelOrigin: unitLabelBesideOrigin(pin.label, slots.get(pin.id) ?? 0),
  }));
}

export type FleetMapMissing = {
  id: number;
  label: string;
  href: string;
};

export type FleetStatusRow = {
  id: string;
  trailer: string;
  trailerId: number;
  href: string;
  power: string;
  setpointF: number | null;
  temperatureF: number | null;
  alarm: string;
  location: string;
  messageAt: string;
  sharePath: string;
  shareExpiresAt: string;
};

export type SamsaraStatusRow = {
  id: string;
  truck: string;
  href: string;
  location: string;
  miles: number | null;
  driver: string;
  driverHref: string;
  hos: string;
};

export type FleetMapModel = {
  title: string;
  sourceNote: string;
  pins: FleetMapPin[];
  missing: FleetMapMissing[];
  statusRows?: FleetStatusRow[];
  truckStatusRows?: SamsaraStatusRow[];
};

export function motionFromSpeedMph(speedMph: number | null | undefined): FleetMapMotion | "" {
  if (speedMph == null || Number.isNaN(speedMph)) return "";
  return Math.abs(speedMph) < 1 ? "Parked" : "Moving";
}

export function samsaraTruckPinStyle(input: {
  speedMph?: number | null;
  engineOn?: boolean | null;
}): { pinColor: string; pinShape: FleetMapPinShape; motion: FleetMapMotion } {
  if (motionFromSpeedMph(input.speedMph) === "Moving") {
    return { pinColor: SAMSARA_TRUCK_ON_COLOR, pinShape: "arrow", motion: "Moving" };
  }
  if (input.engineOn === true) {
    return { pinColor: SAMSARA_TRUCK_ON_COLOR, pinShape: "circle", motion: "Parked" };
  }
  return { pinColor: SAMSARA_TRUCK_OFF_COLOR, pinShape: "circle", motion: "Parked" };
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

export function orbcommMapPinStyle(input: {
  operatingMode?: string | null;
  powerOn?: boolean | null;
  speedMph?: number | null;
  headingDeg?: number | null;
}): { pinColor: string; pinShape: FleetMapPinShape; headingDeg: number | null } {
  return {
    pinColor: orbcommReeferPinColor(
      reeferPinStatusFromSnapshot({
        operatingMode: input.operatingMode,
        powerOn: input.powerOn,
      }),
    ),
    pinShape: orbcommPinShape(input.speedMph),
    headingDeg: input.headingDeg ?? null,
  };
}

export function orbcommMapPinFromReading(
  row?: {
    operating_mode?: string | null;
    operatingMode?: string | null;
    powerOn?: boolean | null;
    speed_mph?: number | null;
    speedMph?: number | null;
    heading_deg?: number | null;
    headingDeg?: number | null;
  } | null,
): { pinColor: string; pinShape: FleetMapPinShape; headingDeg: number | null } {
  return orbcommMapPinStyle({
    operatingMode: row?.operatingMode ?? row?.operating_mode,
    powerOn: row?.powerOn,
    speedMph: row?.speedMph ?? row?.speed_mph,
    headingDeg: row?.headingDeg ?? row?.heading_deg,
  });
}
