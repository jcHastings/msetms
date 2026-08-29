import { formatMoney, formatSmsStopWindow } from "./format";
import { isOwnerOperator } from "./types";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";

export type LoadSummaryStop = {
  kind?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  schedule_type?: string | null;
};

export type LoadSummaryInput = {
  load_number: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  reefer_setpoint_f: number | null;
  temperature_f?: number | null;
  reefer_mode?: string | null;
  special_instructions: string;
  appointment_notes: string;
  notes?: string | null;
  public_notes?: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_type: string | null;
  rate: number | null;
  oo_pay: number | null;
  truck_unit?: string | null;
  trailer_unit?: string | null;
  trailer_number?: string | null;
  equipment?: string | null;
  truck_type?: string | null;
  trailer_type?: string | null;
  your_leg?: string | null;
  customer_reference?: string | null;
  po_number?: string | null;
  reference_number?: string | null;
  stops?: LoadSummaryStop[] | null;
};

export { SMS_MISSING_KEYS } from "./sms-shared";

export function driverFacingLoadNumber(load: {
  load_number?: string | null;
  customer_reference?: string | null;
  po_number?: string | null;
  reference_number?: string | null;
}): string {
  const internal = String(load.load_number ?? "").trim();
  if (!internal) return "";
  const refs = [load.customer_reference, load.po_number, load.reference_number]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (refs.includes(internal)) return "";
  if (/^\d+$/.test(internal)) return "";
  return internal;
}

function smsStopPlace(stop: LoadSummaryStop, fallback: string): string {
  const city = String(stop.city ?? "").trim();
  const state = String(stop.state ?? "").trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return String(stop.name ?? "").trim() || fallback;
}

function smsStopWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  scheduleType?: string | null,
  fallbackStart = "",
  fallbackEnd = "",
): string {
  return formatSmsStopWindow(start?.trim() || fallbackStart, end?.trim() || fallbackEnd, scheduleType);
}

function smsStopBlocks(load: LoadSummaryInput): string[] {
  const stops = (load.stops ?? []).filter((stop) => stop);
  const pickups = stops.filter((stop) => String(stop.kind ?? "").trim().toLowerCase() !== "delivery");
  const deliveries = stops.filter((stop) => String(stop.kind ?? "").trim().toLowerCase() === "delivery");
  const blocks: string[] = [];
  const pickup = pickups[0];
  if (pickup || load.origin.trim()) {
    const place = pickup ? smsStopPlace(pickup, load.origin) : load.origin.trim();
    const window = smsStopWindow(
      pickup?.window_start,
      pickup?.window_end,
      pickup?.schedule_type,
      load.pickup_start,
      load.pickup_end,
    );
    blocks.push(["Shipper", place, window ? `Pickup ${window}` : ""].filter(Boolean).join("\n"));
  }
  if (deliveries.length) {
    for (const stop of deliveries) {
      const place = smsStopPlace(stop, load.destination);
      const window = smsStopWindow(stop.window_start, stop.window_end, stop.schedule_type, load.delivery_start, load.delivery_end);
      blocks.push(["Receiver", place, window ? `Delivery ${window}` : ""].filter(Boolean).join("\n"));
    }
    return blocks;
  }
  if (load.destination.trim()) {
    const window = formatSmsStopWindow(load.delivery_start, load.delivery_end);
    blocks.push(["Receiver", load.destination.trim(), window ? `Delivery ${window}` : ""].filter(Boolean).join("\n"));
  }
  return blocks;
}

export function formatLoadSummary(load: LoadSummaryInput): string {
  const trailer = load.trailer_unit || load.trailer_number || "";
  const truckTrailer = [load.truck_unit ? `Truck ${load.truck_unit}` : "", trailer ? `Trailer ${trailer}` : ""]
    .filter(Boolean)
    .join(" · ");
  const reefer = resolveReeferSpec(load);
  const reeferLine =
    reefer.setpointF != null
      ? `Reefer ${formatReeferSetpoint(reefer.setpointF)} ${labelForReeferMode(reefer.mode) || "Continuous"}`
      : "";
  const extras = [
    load.your_leg?.trim() ? `Your leg: ${load.your_leg.trim()}` : "",
    load.appointment_notes?.trim() ? `Appointment: ${load.appointment_notes.trim()}` : "",
    load.special_instructions?.trim() ? `Special instructions: ${load.special_instructions.trim()}` : "",
    load.public_notes?.trim() ? `Notes: ${load.public_notes.trim()}` : "",
    isOwnerOperator(load.driver_type) && (load.oo_pay != null || load.rate != null)
      ? `Agreed amount ${formatMoney(load.oo_pay ?? load.rate)}`
      : "",
  ].filter(Boolean);
  const loadNumber = driverFacingLoadNumber(load);
  const blocks = [
    loadNumber ? `Load ${loadNumber}` : "",
    ...smsStopBlocks(load),
    [truckTrailer, reeferLine].filter(Boolean).join("\n"),
    extras.join("\n"),
  ].filter(Boolean);
  return blocks.join("\n\n");
}
