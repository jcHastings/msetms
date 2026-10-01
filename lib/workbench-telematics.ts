import { shortPlaceLabel } from "./format";
import { normalizeKey } from "./integrations/orbcomm";
import { getDb } from "./db";
import { getTrailer, getTruck, persistedTruckLocation } from "./queries";

/** Missing truck place or reefer temp. Never a fake reading. */
export const WORKBENCH_TELEMATICS_EMPTY = "\u2014";

const CITY_STATE = /^[^,]+, [A-Z]{2}$/;

/** City and state only, using the same place parser as the rest of the desk. */
export function workbenchCityState(address: string | null | undefined): string {
  const label = shortPlaceLabel(String(address ?? ""));
  return CITY_STATE.test(label) ? label : "";
}

/** Current temperature only. Blank when the reading is missing. */
export function workbenchReeferTempLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${Object.is(value, -0) ? "0" : String(value)}\u00b0F`;
}

export function workbenchTelematics(load: {
  truck_id: number | null;
  trailer_id: number | null;
} | null): { truckPlace: string; reeferTemp: string } {
  const empty = {
    truckPlace: WORKBENCH_TELEMATICS_EMPTY,
    reeferTemp: WORKBENCH_TELEMATICS_EMPTY,
  };
  if (!load) return empty;
  try {
    return {
      truckPlace: truckPlaceFor(load.truck_id) || WORKBENCH_TELEMATICS_EMPTY,
      reeferTemp: reeferTempFor(load.trailer_id) || WORKBENCH_TELEMATICS_EMPTY,
    };
  } catch {
    return empty;
  }
}

function truckPlaceFor(truckId: number | null): string {
  if (!truckId) return "";
  const truck = getTruck(truckId);
  if (!truck) return "";
  const stored = persistedTruckLocation(truck);
  if (!stored?.address.trim()) return "";
  return workbenchCityState(stored.address);
}

function reeferTempFor(trailerId: number | null): string {
  if (!trailerId) return "";
  const trailer = getTrailer(trailerId);
  if (!trailer) return "";
  const keys = [trailer.unit_number, trailer.orbcomm_asset_id].map((value) => normalizeKey(value)).filter(Boolean);
  if (keys.length === 0) return "";
  const rows = getDb()
    .prepare(
      `SELECT trailer_id, temperature_f, return_air_f
       FROM reefer_readings
       WHERE source = 'orbcomm'
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all() as Array<{ trailer_id: string; temperature_f: number | null; return_air_f: number | null }>;
  const reading = rows.find((row) => keys.includes(normalizeKey(row.trailer_id)));
  if (!reading) return "";
  const temp = reading.temperature_f ?? reading.return_air_f;
  return workbenchReeferTempLabel(temp);
}
