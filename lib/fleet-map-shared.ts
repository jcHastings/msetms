export type FleetMapKind = "truck" | "trailer";

export type FleetMapPin = {
  id: string;
  label: string;
  kind: FleetMapKind;
  lat: number;
  lng: number;
  href: string;
};

export type FleetMapMissing = {
  id: number;
  label: string;
  href: string;
};

export type FleetMapModel = {
  title: string;
  sourceNote: string;
  pins: FleetMapPin[];
  missing: FleetMapMissing[];
};

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
