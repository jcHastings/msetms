import { latestReeferForTrailer } from "./integrations/orbcomm";
import { persistedTrailerLocation } from "./queries";

type TrailerGps = {
  id: number;
  unit_number: string;
  orbcomm_asset_id?: string;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_address?: string;
  gps_recorded_at?: string;
  gps_source?: string;
};

export type DirectoryTrailerFix = {
  loadId: number | null;
  trailerId: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  recordedAt: string;
  source: "orbcomm";
};

/** Newer of the trailer GPS columns and the latest stored reefer reading. */
export function directoryTrailerLocation(trailer: TrailerGps): DirectoryTrailerFix | null {
  const persisted = persistedTrailerLocation(trailer);
  const reading = latestReeferForTrailer({
    unit_number: trailer.unit_number,
    orbcomm_asset_id: trailer.orbcomm_asset_id ?? "",
  });
  const readingFix =
    reading && reading.source === "orbcomm"
      ? {
          loadId: reading.load_id,
          trailerId: trailer.unit_number,
          latitude: reading.latitude,
          longitude: reading.longitude,
          address: String(reading.address ?? "").trim(),
          recordedAt: reading.recorded_at || "",
          source: "orbcomm" as const,
        }
      : null;
  if (persisted && readingFix) {
    return readingFix.recordedAt > persisted.recordedAt ? readingFix : persisted;
  }
  return readingFix ?? persisted;
}
