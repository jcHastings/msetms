import { locationMatchesRole } from "./locations";
import type { Location } from "./types";

export type ParsedStop = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

export type ParsedExtraStop = {
  kind: "pickup" | "delivery";
  stop: ParsedStop;
};

export type ParsedRateCon = {
  customer_name: string;
  customer_id: number | null;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  rate: number | null;
  commodity: string;
  weight: number | null;
  reference_number: string;
  po_number: string;
  special_instructions: string;
  appointment_notes: string;
  reefer_setpoint_f: number | null;
  reefer_mode: string;
  load_number_hint: string;
  raw_text: string;
  shipper: ParsedStop;
  consignee: ParsedStop;
  extra_stops: ParsedExtraStop[];
  shipper_location_id: number | null;
  consignee_location_id: number | null;
};

const STREET_SUFFIX =
  /(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|way|ct|court|pl|place|pkwy|parkway|cir|circle|trl|trail)\.?$/i;
const CITY_STATE_ZIP =
  /\b([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*),[ \t]*([A-Z]{2})\b(?:[ \t]+(\d{5}(?:-\d{4})?))?/g;
const STREET_IN_LINE =
  /\b(\d{1,6}(?:\s+[A-Za-z0-9.#\-']+){1,6}\s+(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|way|ct|court|pl|place|pkwy|parkway|cir|circle|trl|trail)\.?)\s*$/i;

export function emptyParsedStop(): ParsedStop {
  return { name: "", street: "", city: "", state: "", zip: "", phone: "" };
}

export function emptyParsedRateCon(): ParsedRateCon {
  return {
    customer_name: "",
    customer_id: null,
    origin: "",
    destination: "",
    pickup_start: "",
    pickup_end: "",
    delivery_start: "",
    delivery_end: "",
    rate: null,
    commodity: "",
    weight: null,
    reference_number: "",
    po_number: "",
    special_instructions: "",
    appointment_notes: "",
    reefer_setpoint_f: null,
    reefer_mode: "",
    load_number_hint: "",
    raw_text: "",
    shipper: emptyParsedStop(),
    consignee: emptyParsedStop(),
    extra_stops: [],
    shipper_location_id: null,
    consignee_location_id: null,
  };
}

export function parsedStopHasDetails(stop: ParsedStop | null | undefined): stop is ParsedStop {
  if (!stop) return false;
  return Boolean(stop.name.trim() || stop.street.trim());
}

export function formatParsedStop(stop: ParsedStop): string {
  const cityState = [stop.city.trim(), stop.state.trim()].filter(Boolean).join(", ");
  const cityZip = [cityState, stop.zip.trim()].filter(Boolean).join(" ");
  return [stop.name.trim(), stop.street.trim(), cityZip, stop.phone.trim()].filter(Boolean).join(" · ");
}

export function cityStateFromStop(stop: ParsedStop): string {
  const city = stop.city.trim();
  const state = stop.state.trim();
  return city && state ? `${city}, ${state}` : "";
}

export function parseAddressBlob(raw: string): ParsedStop {
  const stop = emptyParsedStop();
  if (!raw.trim()) return stop;

  stop.phone = extractLabeledPhone(raw);

  let text = raw
    .replace(/\bphone\s*[:#]?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gi, "\n")
    .replace(/\b(?:preferred freezer)[\s\S]*/i, "\n")
    .replace(/\b(?:email:|contact:)\b[\s\S]*/i, "\n")
    .replace(/\b(?:date|time|type|qty|quantity|weight|description|commodity)\b[\s\S]*/i, "\n")
    .replace(/\bUSA\b/gi, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b(?:pickup|delivery|pick up|deliver|drop)\b[:\s]*/gi, " ");

  const cityMatches = [...text.matchAll(new RegExp(CITY_STATE_ZIP.source, "g"))];
  const cityMatch = cityMatches.at(-1);
  if (cityMatch && cityMatch.index != null) {
    stop.city = cleanCityName(cityMatch[1]);
    stop.state = cityMatch[2];
    stop.zip = cityMatch[3] ?? "";
    text = `${text.slice(0, cityMatch.index)}\n${text.slice(cityMatch.index + cityMatch[0].length)}`;
  }

  const parts = text
    .split(/[\n,]+/)
    .map((part) => collapse(part))
    .filter((part) => part && !isJunkLine(part));

  const streetIdx = parts.findIndex(isStreetLine);
  if (streetIdx >= 0) {
    stop.street = parts[streetIdx];
    const before = parts.slice(0, streetIdx).filter((part) => !isStreetLine(part));
    stop.name = before[0] ?? "";
  } else {
    for (const part of parts) {
      const split = splitNameAndStreet(part);
      if (split.street) {
        stop.street = split.street;
        stop.name = split.name || stop.name;
        break;
      }
    }
    if (!stop.name) {
      stop.name = parts.find((part) => !isStreetLine(part) && !looksLikeCityState(part)) ?? "";
    }
  }

  return stop;
}

export function matchLocationForParsedStop(
  locations: Location[],
  stop: ParsedStop | null | undefined,
  role?: "shipper" | "receiver",
): Location | null {
  if (!parsedStopHasDetails(stop)) return null;
  const preferred = role ? locations.filter((location) => locationMatchesRole(location, role)) : locations;
  return (
    matchByName(preferred, stop) ??
    matchByAddress(preferred, stop) ??
    matchByName(locations, stop) ??
    matchByAddress(locations, stop)
  );
}

export function attachParsedLocationMatches(parsed: ParsedRateCon, locations: Location[]): ParsedRateCon {
  const shipper = matchLocationForParsedStop(locations, parsed.shipper, "shipper");
  const consignee = matchLocationForParsedStop(locations, parsed.consignee, "receiver");
  return {
    ...parsed,
    shipper_location_id: shipper?.id ?? null,
    consignee_location_id: consignee?.id ?? null,
  };
}

function matchByName(locations: Location[], stop: ParsedStop): Location | null {
  const needle = normalizePlace(stop.name);
  if (!needle || needle.length < 3) return null;
  const hits = locations.filter((location) => {
    const name = normalizePlace(location.name);
    return name === needle || name.includes(needle) || needle.includes(name);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const exact = hits.filter((location) => normalizePlace(location.name) === needle);
    if (exact.length === 1) return exact[0];
    const byAddress = hits.filter((location) => addressMatches(location, stop));
    if (byAddress.length === 1) return byAddress[0];
  }
  return null;
}

function matchByAddress(locations: Location[], stop: ParsedStop): Location | null {
  const hits = locations.filter((location) => addressMatches(location, stop));
  return hits.length >= 1 ? hits[0] : null;
}

function addressMatches(location: Location, stop: ParsedStop): boolean {
  const street = normalizeStreet(stop.street);
  const city = normalizePlace(stop.city);
  const state = stop.state.trim().toUpperCase();
  if (!street || !city || state.length !== 2) return false;
  return (
    normalizeStreet(location.street) === street &&
    normalizePlace(location.city) === city &&
    location.state.trim().toUpperCase() === state
  );
}

function extractLabeledPhone(text: string): string {
  const match = text.match(/phone\s*[:#]?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
  return match?.[1]?.trim() ?? "";
}

function splitNameAndStreet(value: string): { name: string; street: string } {
  const match = value.match(STREET_IN_LINE);
  if (!match || match.index == null) return { name: collapse(value), street: "" };
  return { name: collapse(value.slice(0, match.index)), street: collapse(match[1]) };
}

function isStreetLine(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d{1,6}\b/.test(trimmed)) return false;
  if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(trimmed)) return false;
  if (/\b(?:lbs?|pounds|miles)\b/i.test(trimmed)) return false;
  return STREET_SUFFIX.test(trimmed) || STREET_IN_LINE.test(trimmed);
}

function isJunkLine(line: string): boolean {
  if (!line) return true;
  if (
    /^(?:date|time|type|qty|quantity|weight|actions?|#|pickup|delivery|pick up|deliver|drop|contact|location|hours|appointment|ref#?|description|notes|rate|amount)$/i.test(
      line,
    )
  ) {
    return true;
  }
  if (/^preferred freezer/i.test(line)) return true;
  if (/^(?:phone|email|contact)\b/i.test(line)) return true;
  if (/^\d{1,2}:\d{2}/.test(line)) return true;
  if (/^(?:lbs?|pounds)\b/i.test(line)) return true;
  return false;
}

function looksLikeCityState(line: string): boolean {
  return /\b[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?$/.test(line);
}

function cleanCityName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(?:N|S|E|W|NE|NW|SE|SW|St|Rd|Dr|Ave|Blvd|Ln|Ct|Hwy)$/i.test(word))
    .slice(-2)
    .join(" ");
}

function normalizePlace(value: string): string {
  return value.trim().toLowerCase().replace(/[.,#']/g, "").replace(/\s+/g, " ");
}

function normalizeStreet(value: string): string {
  return normalizePlace(value)
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bhighway\b/g, "hwy")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\btrail\b/g, "trl")
    .replace(/\bparkway\b/g, "pkwy");
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
