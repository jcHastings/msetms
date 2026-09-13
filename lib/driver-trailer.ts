import { getTrailerLocationForLoad, latestReeferForTrailer } from "./integrations/orbcomm";
import { orbcommMapPinFromReading, plottableCoord } from "./fleet-map-shared";
import type { LoadMapPoint } from "./load-map-shared";
import { getTrailer, persistedTrailerLocation } from "./queries";
import type { LoadView } from "./types";

export type DriverTrailerLocationSource = "orbcomm" | "stored";

export type DriverTrailerLocation = {
  trailerId: number;
  unitNumber: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  recordedAt: string;
  source: DriverTrailerLocationSource | null;
  headingDeg: number | null;
  speedMph: number | null;
  point: { lat: number; lng: number } | null;
};

export function driverLoadHasAssignedTrailer(load: Pick<LoadView, "trailer_id">): boolean {
  return load.trailer_id != null && load.trailer_id > 0;
}

/** Live Orbcomm first; else persisted last-known. Never invents coordinates. */
export async function driverAssignedTrailerLocation(load: LoadView): Promise<DriverTrailerLocation | null> {
  if (!driverLoadHasAssignedTrailer(load) || load.trailer_id == null) return null;
  const trailer = getTrailer(load.trailer_id);
  if (!trailer) return null;
  const live = await getTrailerLocationForLoad(load.id);
  const usableLive = live?.source === "orbcomm" ? live : null;
  const stored = persistedTrailerLocation(trailer);
  const chosen = usableLive ?? stored;
  const coord = plottableCoord(chosen?.latitude ?? null, chosen?.longitude ?? null);
  const reefer = latestReeferForTrailer(trailer);
  return {
    trailerId: trailer.id,
    unitNumber: trailer.unit_number,
    latitude: coord?.lat ?? null,
    longitude: coord?.lng ?? null,
    address: String(chosen?.address || "").trim(),
    recordedAt: String(chosen?.recordedAt || "").trim(),
    source: usableLive ? "orbcomm" : stored ? "stored" : null,
    headingDeg: typeof reefer?.heading_deg === "number" ? reefer.heading_deg : null,
    speedMph: typeof reefer?.speed_mph === "number" ? reefer.speed_mph : null,
    point: coord,
  };
}

export async function driverAssignedTrailerMap(load: LoadView): Promise<{
  trailerNumber: string;
  address: string;
  recordedAt: string;
  point: LoadMapPoint | null;
}> {
  const location = await driverAssignedTrailerLocation(load);
  if (!location) return { trailerNumber: "", address: "", recordedAt: "", point: null };
  const trailer = getTrailer(location.trailerId);
  const pin = orbcommMapPinFromReading(trailer ? latestReeferForTrailer(trailer) : null);
  return {
    trailerNumber: location.unitNumber,
    address: location.address,
    recordedAt: location.recordedAt,
    point: location.point
      ? {
          id: `driver-trailer-${location.trailerId}`,
          kind: "trailer",
          label: location.unitNumber,
          lat: location.point.lat,
          lng: location.point.lng,
          detail: location.address,
          ...pin,
        }
      : null,
  };
}
