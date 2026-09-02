import { getTrailerLocationForLoad, latestReeferForTrailer } from "./integrations/orbcomm";
import { orbcommReeferPinColor, plottableCoord, reeferPinStatusFromSnapshot } from "./fleet-map-shared";
import type { LoadMapPoint } from "./load-map-shared";
import { getTrailer, persistedTrailerLocation } from "./queries";
import type { LoadView } from "./types";

export function driverLoadHasAssignedTrailer(load: Pick<LoadView, "trailer_id">): boolean {
  return load.trailer_id != null && load.trailer_id > 0;
}

export async function driverAssignedTrailerMap(load: LoadView): Promise<{
  trailerNumber: string;
  address: string;
  recordedAt: string;
  point: LoadMapPoint | null;
}> {
  if (!driverLoadHasAssignedTrailer(load) || load.trailer_id == null) {
    return { trailerNumber: "", address: "", recordedAt: "", point: null };
  }
  const trailer = getTrailer(load.trailer_id);
  if (!trailer) return { trailerNumber: "", address: "", recordedAt: "", point: null };
  const live = await getTrailerLocationForLoad(load.id);
  const usableLive = live?.source === "orbcomm" ? live : null;
  const stored = persistedTrailerLocation(trailer);
  const lat = usableLive?.latitude ?? stored?.latitude ?? null;
  const lng = usableLive?.longitude ?? stored?.longitude ?? null;
  const coord = plottableCoord(lat, lng);
  const address = String(usableLive?.address || stored?.address || "").trim();
  const recordedAt = String(usableLive?.recordedAt || stored?.recordedAt || "").trim();
  const reading = latestReeferForTrailer(trailer);
  const pinColor = orbcommReeferPinColor(
    reeferPinStatusFromSnapshot({
      operatingMode: reading?.operating_mode,
    }),
  );
  return {
    trailerNumber: trailer.unit_number,
    address,
    recordedAt,
    point: coord
      ? {
          id: `driver-trailer-${trailer.id}`,
          kind: "trailer",
          label: trailer.unit_number,
          lat: coord.lat,
          lng: coord.lng,
          detail: address,
          pinColor,
        }
      : null,
  };
}
