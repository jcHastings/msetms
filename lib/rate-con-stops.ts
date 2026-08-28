import { readInboxParse } from "./files";
import { parseOptionalInt } from "./format";
import { isPlaceholderStopName } from "./locations";
import { getLocation, getLoad } from "./queries";
import {
  parsedStopHasDetails,
  type ParsedExtraStop,
  type ParsedRateCon,
  type ParsedStop,
} from "./rate-con-shared";
import { addStop, ensureDefaultStops, listStops, updateStop, type LoadStop, type StopInput } from "./stops";

export function splitLaneCityState(value: string): { city: string; state: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+),\s*([A-Za-z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: trimmed, state: "" };
}

function parsedStopFromForm(formData: FormData, prefix: "pickup" | "delivery"): ParsedStop | null {
  const stop: ParsedStop = {
    name: String(formData.get(`${prefix}_stop_name`) ?? "").trim(),
    street: String(formData.get(`${prefix}_stop_street`) ?? "").trim(),
    city: String(formData.get(`${prefix}_stop_city`) ?? "").trim(),
    state: String(formData.get(`${prefix}_stop_state`) ?? "").trim(),
    zip: String(formData.get(`${prefix}_stop_zip`) ?? "").trim(),
    phone: String(formData.get(`${prefix}_stop_phone`) ?? "").trim(),
  };
  return parsedStopHasDetails(stop) || stop.city ? stop : null;
}

function extraStopsFromForm(formData: FormData): ParsedExtraStop[] {
  const raw = String(formData.get("extra_stops_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { kind?: string; stop?: Partial<ParsedStop> };
      const kind = row.kind === "delivery" ? "delivery" : row.kind === "pickup" ? "pickup" : null;
      if (!kind || !row.stop) return [];
      const stop: ParsedStop = {
        name: String(row.stop.name ?? "").trim(),
        street: String(row.stop.street ?? "").trim(),
        city: String(row.stop.city ?? "").trim(),
        state: String(row.stop.state ?? "").trim(),
        zip: String(row.stop.zip ?? "").trim(),
        phone: String(row.stop.phone ?? "").trim(),
      };
      return parsedStopHasDetails(stop) ? [{ kind, stop }] : [];
    });
  } catch {
    return [];
  }
}

function looksLikeCityStateOnly(stop: LoadStop): boolean {
  if (stop.street.trim()) return false;
  if (isPlaceholderStopName(stop.name, stop.city)) return true;
  return /^[A-Za-z .'-]+,\s*[A-Z]{2}$/.test(stop.name.trim());
}

function sameParsedStop(existing: LoadStop, parsed: ParsedStop): boolean {
  const name = existing.name.trim().toLowerCase();
  const parsedName = parsed.name.trim().toLowerCase();
  if (parsedName && name === parsedName) return true;
  const street = existing.street.trim().toLowerCase();
  const parsedStreet = parsed.street.trim().toLowerCase();
  return Boolean(street && parsedStreet && street === parsedStreet);
}

function stopInputFromParts(
  kind: "pickup" | "delivery",
  parsed: ParsedStop | null,
  locationId: number | null,
  existing: LoadStop | undefined,
  lane: string,
  windowStart: string,
  windowEnd: string,
): StopInput | null {
  const location = locationId ? getLocation(locationId) : null;
  if (location) {
    return {
      kind,
      location_id: location.id,
      name: location.name,
      street: location.street,
      city: location.city,
      state: location.state,
      zip: location.zip,
      phone: location.phone,
      window_start: existing?.window_start || windowStart,
      window_end: existing?.window_end || windowEnd,
      confirmation: existing?.confirmation ?? "",
      cargo: existing?.cargo ?? "",
      reference: existing?.reference ?? "",
      instructions: existing?.instructions ?? "",
      notes: existing?.notes ?? "",
      arrived_at: existing?.arrived_at,
      departed_at: existing?.departed_at,
      schedule_type: existing?.schedule_type,
    };
  }
  if (!parsed || (!parsedStopHasDetails(parsed) && !parsed.city.trim())) return null;
  const split = splitLaneCityState(lane);
  return {
    kind,
    location_id: existing?.location_id ?? null,
    name: parsed.name || existing?.name || lane,
    street: parsed.street,
    city: parsed.city || existing?.city || split.city,
    state: parsed.state || existing?.state || split.state,
    zip: parsed.zip || existing?.zip || "",
    phone: parsed.phone || existing?.phone || "",
    window_start: existing?.window_start || windowStart,
    window_end: existing?.window_end || windowEnd,
    confirmation: existing?.confirmation ?? "",
    cargo: existing?.cargo ?? "",
    reference: existing?.reference ?? "",
    instructions: existing?.instructions ?? "",
    notes: existing?.notes ?? "",
    arrived_at: existing?.arrived_at,
    departed_at: existing?.departed_at,
    schedule_type: existing?.schedule_type,
  };
}

export function formHasRateConStops(formData: FormData): boolean {
  return Boolean(
    String(formData.get("inbox_id") ?? "").trim() ||
      String(formData.get("pickup_stop_name") ?? "").trim() ||
      String(formData.get("pickup_stop_street") ?? "").trim() ||
      String(formData.get("delivery_stop_name") ?? "").trim() ||
      String(formData.get("delivery_stop_street") ?? "").trim() ||
      String(formData.get("extra_stops_json") ?? "").trim(),
  );
}

export function applyRateConStopsToLoad(loadId: number, formData: FormData): void {
  if (!formHasRateConStops(formData)) return;
  const load = getLoad(loadId);
  if (!load) return;

  const inboxId = String(formData.get("inbox_id") ?? "").trim();
  const inbox = inboxId ? readInboxParse<ParsedRateCon>(inboxId) : null;
  const pickupParsed = parsedStopFromForm(formData, "pickup") ?? inbox?.shipper ?? null;
  const deliveryParsed = parsedStopFromForm(formData, "delivery") ?? inbox?.consignee ?? null;
  const extras = extraStopsFromForm(formData);
  const extraStops = extras.length ? extras : inbox?.extra_stops ?? [];

  ensureDefaultStops(loadId);
  const existing = listStops(loadId);
  const pickups = existing.filter((stop) => stop.kind === "pickup");
  const deliveries = existing.filter((stop) => stop.kind === "delivery");

  const pickupInput = stopInputFromParts(
    "pickup",
    pickupParsed,
    parseOptionalInt(formData.get("shipper_location_id")) ?? load.shipper_location_id,
    pickups[0],
    load.origin,
    load.pickup_start,
    load.pickup_end,
  );
  if (pickupInput && pickups[0] && looksLikeCityStateOnly(pickups[0])) {
    updateStop(pickups[0].id, pickupInput);
  } else if (pickupInput && !pickups[0]) {
    addStop(loadId, pickupInput);
  }

  const deliveryInput = stopInputFromParts(
    "delivery",
    deliveryParsed,
    parseOptionalInt(formData.get("consignee_location_id")) ?? load.consignee_location_id,
    deliveries[0],
    load.destination,
    load.delivery_start,
    load.delivery_end,
  );
  if (deliveryInput && deliveries[0] && looksLikeCityStateOnly(deliveries[0])) {
    updateStop(deliveries[0].id, deliveryInput);
  } else if (deliveryInput && !deliveries[0]) {
    addStop(loadId, deliveryInput);
  }

  const afterFill = listStops(loadId);
  const canAddExtras = extraStops.length > 0 && afterFill.length <= 2;
  if (!canAddExtras) return;
  for (const extra of extraStops) {
    if (!parsedStopHasDetails(extra.stop)) continue;
    if (afterFill.some((stop) => sameParsedStop(stop, extra.stop))) continue;
    const input = stopInputFromParts(
      extra.kind,
      extra.stop,
      null,
      undefined,
      extra.kind === "pickup" ? load.origin : load.destination,
      extra.kind === "pickup" ? load.pickup_start : load.delivery_start,
      extra.kind === "pickup" ? load.pickup_end : load.delivery_end,
    );
    if (input) addStop(loadId, input);
  }
}
