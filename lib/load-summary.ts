import { formatMoney, formatSmsStopWindow } from "./format";
import { isOwnerOperator } from "./types";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";

export type LoadSummaryStop = {
  kind?: string | null;
  name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  schedule_type?: string | null;
};

export type DriverMessageLocale = "en" | "es";

export const OFFICE_TIME_ZONE = "America/Chicago";

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
  locale?: DriverMessageLocale;
};

export function parseDriverMessageLocale(value: unknown): DriverMessageLocale {
  return String(value ?? "").trim().toLowerCase() === "es" ? "es" : "en";
}

export function driverFirstName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .find(Boolean) ?? "";
}

function officeHour(now: Date, timeZone = OFFICE_TIME_ZONE): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return Number.isFinite(hour) ? hour : now.getHours();
}

export function driverLoadGreeting(options: {
  locale?: DriverMessageLocale;
  driverName?: string | null;
  now?: Date;
  timeZone?: string;
} = {}): string {
  const locale = options.locale === "es" ? "es" : "en";
  const hour = officeHour(options.now ?? new Date(), options.timeZone ?? OFFICE_TIME_ZONE);
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const first = driverFirstName(options.driverName);
  if (locale === "es") {
    const hello =
      period === "morning" ? "Buenos días" : period === "afternoon" ? "Buenas tardes" : "Buenas noches";
    const named = first ? `${hello}, ${first}.` : `${hello}.`;
    return `${named} Espero que estés teniendo un buen día.`;
  }
  const hello = period === "morning" ? "Good morning" : period === "afternoon" ? "Good afternoon" : "Good evening";
  const named = first ? `${hello}, ${first}.` : `${hello}.`;
  return `${named} Hope you're having a great day.`;
}

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

function cleanSmsPart(value: string | null | undefined): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || /^undefined$/i.test(text)) return "";
  return text;
}

function smsCityLine(stop: LoadSummaryStop): string {
  const city = cleanSmsPart(stop.city);
  const state = cleanSmsPart(stop.state);
  const zip = cleanSmsPart(stop.zip);
  const cityState = [city, state].filter(Boolean).join(", ");
  return [cityState, zip].filter(Boolean).join(" ");
}

function smsFacilityName(stop: LoadSummaryStop, cityLine: string): string {
  const name = cleanSmsPart(stop.name);
  if (!name || /^(pickup|delivery)$/i.test(name)) return "";
  const city = cleanSmsPart(stop.city);
  const state = cleanSmsPart(stop.state);
  const cityState = [city, state].filter(Boolean).join(", ");
  const folded = name.toLowerCase();
  if (city && folded === city.toLowerCase()) return "";
  if (cityState && folded === cityState.toLowerCase()) return "";
  if (cityLine && folded === cityLine.toLowerCase()) return "";
  return name;
}

function smsStreetLine(stop: LoadSummaryStop, cityLine: string, facility: string): string {
  const street = cleanSmsPart(stop.street);
  if (!street) return "";
  const folded = street.toLowerCase();
  if (facility && folded === facility.toLowerCase()) return "";
  if (cityLine && folded === cityLine.toLowerCase()) return "";
  return street;
}

function smsPlaceLines(stop: LoadSummaryStop): string[] {
  const cityLine = smsCityLine(stop);
  const facility = smsFacilityName(stop, cityLine);
  const street = smsStreetLine(stop, cityLine, facility);
  return [facility, street, cityLine].filter(Boolean);
}

function smsWhenLine(copy: { pickup: string; delivery: string }, stop: LoadSummaryStop): string {
  const window = formatSmsStopWindow(
    cleanSmsPart(stop.window_start),
    cleanSmsPart(stop.window_end),
    stop.schedule_type,
  );
  if (!window) return "";
  const isDelivery = String(stop.kind ?? "").trim().toLowerCase() === "delivery";
  return `${isDelivery ? copy.delivery : copy.pickup} ${window}`;
}

function smsCopy(locale: DriverMessageLocale) {
  if (locale === "es") {
    return {
      load: "Carga",
      shipper: "Remitente",
      receiver: "Receptor",
      pickup: "Recogida",
      delivery: "Entrega",
      truck: "Camión",
      trailer: "Remolque",
      reefer: "Reefer",
      yourLeg: "Su tramo",
      appointment: "Cita",
      special: "Instrucciones especiales",
      notes: "Notas",
      agreed: "Monto acordado",
    };
  }
  return {
    load: "Load",
    shipper: "Shipper",
    receiver: "Receiver",
    pickup: "Pickup",
    delivery: "Delivery",
    truck: "Truck",
    trailer: "Trailer",
    reefer: "Reefer",
    yourLeg: "Your leg",
    appointment: "Appointment",
    special: "Special instructions",
    notes: "Notes",
    agreed: "Agreed amount",
  };
}

function smsLaneBlock(label: string, place: string, when: string): string {
  return [label, place, when].filter(Boolean).join("\n");
}

function smsStopBlocks(load: LoadSummaryInput): string[] {
  const copy = smsCopy(load.locale === "es" ? "es" : "en");
  const stops = (load.stops ?? []).filter((stop) => stop);
  if (stops.length) {
    const blocks: string[] = [];
    for (const stop of stops) {
      const isDelivery = String(stop.kind ?? "").trim().toLowerCase() === "delivery";
      const lines = [
        isDelivery ? copy.receiver : copy.shipper,
        ...smsPlaceLines(stop),
        smsWhenLine(copy, stop),
      ].filter(Boolean);
      // A label with nothing under it is a blank stop. Leave it out.
      if (lines.length < 2) continue;
      blocks.push(lines.join("\n"));
    }
    if (blocks.length) return blocks;
  }
  const blocks: string[] = [];
  const origin = cleanSmsPart(load.origin);
  if (origin) {
    const window = formatSmsStopWindow(cleanSmsPart(load.pickup_start), cleanSmsPart(load.pickup_end));
    blocks.push(smsLaneBlock(copy.shipper, origin, window ? `${copy.pickup} ${window}` : ""));
  }
  const destination = cleanSmsPart(load.destination);
  if (destination) {
    const window = formatSmsStopWindow(cleanSmsPart(load.delivery_start), cleanSmsPart(load.delivery_end));
    blocks.push(smsLaneBlock(copy.receiver, destination, window ? `${copy.delivery} ${window}` : ""));
  }
  return blocks;
}

export function formatLoadSummary(load: LoadSummaryInput): string {
  const locale = load.locale === "es" ? "es" : "en";
  const copy = smsCopy(locale);
  const trailer = load.trailer_unit || load.trailer_number || "";
  const truckTrailer = [load.truck_unit ? `${copy.truck} ${load.truck_unit}` : "", trailer ? `${copy.trailer} ${trailer}` : ""]
    .filter(Boolean)
    .join(" · ");
  const reefer = resolveReeferSpec(load);
  const reeferLine =
    reefer.setpointF != null
      ? `${copy.reefer} ${formatReeferSetpoint(reefer.setpointF)} ${labelForReeferMode(reefer.mode) || "Continuous"}`
      : "";
  const extras = [
    load.your_leg?.trim() ? `${copy.yourLeg}: ${load.your_leg.trim()}` : "",
    load.appointment_notes?.trim() ? `${copy.appointment}: ${load.appointment_notes.trim()}` : "",
    load.special_instructions?.trim() ? `${copy.special}: ${load.special_instructions.trim()}` : "",
    load.public_notes?.trim() ? `${copy.notes}: ${load.public_notes.trim()}` : "",
    isOwnerOperator(load.driver_type) && (load.oo_pay != null || load.rate != null)
      ? `${copy.agreed} ${formatMoney(load.oo_pay ?? load.rate)}`
      : "",
  ].filter(Boolean);
  const loadNumber = driverFacingLoadNumber(load);
  const blocks = [
    loadNumber ? `${copy.load} ${loadNumber}` : "",
    ...smsStopBlocks({ ...load, locale }),
    [truckTrailer, reeferLine].filter(Boolean).join("\n"),
    extras.join("\n"),
  ].filter(Boolean);
  return blocks.join("\n\n");
}

export function formatDriverDispatchText(
  load: LoadSummaryInput,
  options: { locale?: DriverMessageLocale; now?: Date } = {},
): string {
  const locale = options.locale === "es" ? "es" : load.locale === "es" ? "es" : "en";
  const greeting = driverLoadGreeting({
    locale,
    driverName: load.driver_name,
    now: options.now,
  });
  return `${greeting}\n\n${formatLoadSummary({ ...load, locale })}`;
}
