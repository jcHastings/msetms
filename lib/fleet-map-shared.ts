export type FleetMapKind = "truck" | "trailer";

export type FleetMapMotion = "Parked" | "Moving";

export type FleetMapPin = {
  id: string;
  label: string;
  kind: FleetMapKind;
  lat: number;
  lng: number;
  href: string;
  motion?: FleetMapMotion | "";
  speedMph?: number | null;
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
