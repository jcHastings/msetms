import { locationMatchesRole } from "./locations";
import type { Customer, Location } from "./types";

export type RateConFieldStatus = "ok" | "missing" | "low";

export type RateConFieldFlag = {
  key: string;
  label: string;
  status: RateConFieldStatus;
  message: string;
};

export type RateConReader = "ai" | "hint" | "none";

export type ParsedStop = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  schedule_type: string;
  window_start: string;
  window_end: string;
  confirmation: string;
  notes: string;
  /** Stop PO / PU# only — never the customer/broker load number. */
  reference: string;
  quantity: string;
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
  equipment: string;
  load_number_hint: string;
  raw_text: string;
  shipper: ParsedStop;
  consignee: ParsedStop;
  extra_stops: ParsedExtraStop[];
  shipper_location_id: number | null;
  consignee_location_id: number | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_ext: string;
  field_flags: RateConFieldFlag[];
  reader: RateConReader;
};

const STREET_SUFFIX =
  /(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|way|ct|court|pl|place|pkwy|parkway|cir|circle|trl|trail)\.?$/i;
const CITY_STATE_ZIP =
  /\b([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*),[ \t]*([A-Z]{2})\b(?:[ \t]+(\d{5}(?:-\d{4})?))?/g;
const STREET_IN_LINE =
  /\b(\d{1,6}(?:\s+[A-Za-z0-9.#\-']+){1,6}\s+(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|way|ct|court|pl|place|pkwy|parkway|cir|circle|trl|trail)\.?)\s*$/i;

export function emptyParsedStop(): ParsedStop {
  return {
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    schedule_type: "",
    window_start: "",
    window_end: "",
    confirmation: "",
    notes: "",
    reference: "",
    quantity: "",
  };
}

export function normalizeParsedStop(
  stop: (Partial<ParsedStop> & { po?: string }) | null | undefined,
): ParsedStop {
  const empty = emptyParsedStop();
  if (!stop) return empty;
  return {
    name: String(stop.name ?? "").trim(),
    street: String(stop.street ?? "").trim(),
    city: String(stop.city ?? "").trim(),
    state: String(stop.state ?? "").trim().toUpperCase(),
    zip: String(stop.zip ?? "").trim(),
    phone: String(stop.phone ?? "").trim(),
    schedule_type: String(stop.schedule_type ?? "").trim().toLowerCase(),
    window_start: String(stop.window_start ?? "").trim(),
    window_end: String(stop.window_end ?? "").trim(),
    confirmation: String(stop.confirmation ?? "").trim(),
    notes: String(stop.notes ?? "").trim(),
    reference: String(stop.reference ?? stop.po ?? "").trim(),
    quantity: String(stop.quantity ?? "").trim(),
  };
}

/** Rate-con "Load #" is the customer's reference, not the TMS MSE number. */
export function customerRefFromRateCon(
  parsed: Pick<ParsedRateCon, "load_number_hint" | "reference_number">,
): string {
  return (parsed.load_number_hint || parsed.reference_number || "").trim();
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
    equipment: "",
    load_number_hint: "",
    raw_text: "",
    shipper: emptyParsedStop(),
    consignee: emptyParsedStop(),
    extra_stops: [],
    shipper_location_id: null,
    consignee_location_id: null,
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_ext: "",
    field_flags: [],
    reader: "none",
  };
}

export function parsedStopHasDetails(stop: ParsedStop | null | undefined): stop is ParsedStop {
  if (!stop) return false;
  return Boolean(stop.name.trim() || stop.street.trim());
}

export function isOwnPaperworkName(name: string, sourceText = ""): boolean {
  const text = String(name ?? "");
  if (/m\s*&\s*s\s+loads|ms\s*express|msloads/i.test(text)) return true;
  const key = collapse(text).toLowerCase();
  if (!key || key.length < 3) return false;
  for (const person of peopleInCarrierRole(sourceText)) {
    const personKey = collapse(person).toLowerCase();
    if (!personKey) continue;
    if (personKey === key || personKey.includes(key) || key.includes(personKey)) return true;
    const personFirst = personKey.split(/\s+/)[0] ?? "";
    const keyFirst = key.split(/\s+/)[0] ?? "";
    if (personFirst && keyFirst && personFirst === keyFirst && (personKey.includes(" ") || key.includes(" "))) {
      return true;
    }
  }
  return false;
}

export function normalizePartyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|incorporated|co|corp|ltd|company)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchCustomerName(name: string, customers: Customer[], sourceText = ""): number | null {
  if (!name) return null;
  const needle = normalizePartyName(name);
  if (!needle || isOwnPaperworkName(name, sourceText)) return null;
  const exact = customers.find((customer) => normalizePartyName(customer.name) === needle);
  if (exact) return exact.id;
  const partial = customers.find((customer) => {
    const hay = normalizePartyName(customer.name);
    return Boolean(hay) && (hay.includes(needle) || needle.includes(hay));
  });
  return partial?.id ?? null;
}

export function rateConNeedsReview(parsed: ParsedRateCon): boolean {
  return parsed.field_flags.some((flag) => flag.status === "missing" || flag.status === "low");
}

export function flagsFromParsedGaps(parsed: ParsedRateCon): RateConFieldFlag[] {
  const flags: RateConFieldFlag[] = [];
  if (!parsed.customer_name.trim() && parsed.customer_id == null) {
    flags.push({
      key: "customer",
      label: "Customer",
      status: "missing",
      message: "Customer was not on the rate con. Pick one before save.",
    });
  }
  if (parsed.rate == null) {
    flags.push({
      key: "rate",
      label: "Customer rate",
      status: "missing",
      message: "Billed rate was not clear. Enter it — it is not guessed.",
    });
  }
  if (!parsedStopHasDetails(parsed.shipper) && !parsed.origin.trim()) {
    flags.push({
      key: "pickup",
      label: "Pickup",
      status: "missing",
      message: "No pickup stop was read. Add the shipper.",
    });
  }
  if (!parsedStopHasDetails(parsed.consignee) && !parsed.destination.trim()) {
    flags.push({
      key: "delivery",
      label: "Delivery",
      status: "missing",
      message: "No delivery stop was read. Add the consignee.",
    });
  }
  if (!parsed.commodity.trim()) {
    flags.push({
      key: "commodity",
      label: "Commodity",
      status: "missing",
      message: "Commodity was not on the rate con.",
    });
  }
  if (parsed.weight == null) {
    flags.push({
      key: "weight",
      label: "Weight",
      status: "missing",
      message: "Weight was not on the rate con.",
    });
  }
  return flags;
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
    .replace(/\bphone\s*[:#]?\s*(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gi, "\n")
    .replace(/\b(?:preferred freezer)[\s\S]*/i, "\n")
    .replace(/^(?:email|contact)\s*[:#]?\s*\S*.*$/gim, "")
    .replace(/^(?:date|time|type|qty|quantity|weight|description|commodity)\b.*$/gim, "")
    .replace(/^page\s+\d+.*$/gim, "")
    .replace(/^powered by.*$/gim, "")
    .replace(/^\|?\s*jc feder.*$/gim, "")
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
    const before = parts.slice(0, streetIdx).filter((part) => !isStreetLine(part) && !looksLikeCityState(part));
    stop.name = joinWrappedName(before);
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
  const match = text.match(/phone\s*[:#]?\s*(?:\+?1[-.\s]*)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
  return match?.[1]?.trim() ?? "";
}

function joinWrappedName(parts: string[]): string {
  if (!parts.length) return "";
  let name = parts[0];
  if (/-\s*$/.test(name) && parts[1] && !isStreetLine(parts[1]) && !looksLikeCityState(parts[1])) {
    name = `${name.replace(/\s*-\s*$/, "")} - ${parts[1]}`;
  }
  return name;
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
  if (STREET_SUFFIX.test(trimmed) || STREET_IN_LINE.test(trimmed)) return true;
  return /\b(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|way|ct|court|pl|place|pkwy|parkway|cir|circle|trl|trail)\.?\b/i.test(
    trimmed,
  );
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
  if (/^page\s+\d+/i.test(line)) return true;
  if (/^powered by/i.test(line)) return true;
  if (/jc feder|ascend\s*tms|tms\s*\.com/i.test(line)) return true;
  if (/^primary contact$/i.test(line)) return true;
  if (/^(?:references?|cargo|notes|driver instructions)\s*:/i.test(line)) return true;
  if (/^note:/i.test(line)) return true;
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

export type ParsedBrokerContact = {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_ext: string;
};

export function emptyBrokerContact(): ParsedBrokerContact {
  return { contact_name: "", contact_email: "", contact_phone: "", contact_ext: "" };
}

const BROKER_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_EXT_RE =
  /(\+?1?\s*(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4})\s*(?:x|ext\.?)\s*(\d{2,8})/i;
const PHONE_ONLY_RE = /(\+?1?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
const STANDALONE_EXT_RE = /(?<![A-Za-z])(?:x|ext\.?)\s*(\d{2,8})/i;
const CONTACT_HEADER_RE =
  /(?:^|\n)([^\n]*(?:CONTACT INFO|BROKER CONTACT|DISPATCH CONTACT|BOOKING CONTACT)[^\n]*)/gi;
const CONTACT_TABLE_RE = /(?:^|\n)\s*Name\s+Phone\s+Email(?:\s+Fax)?\s*\n([^\n]+)/i;
const NEXT_SECTION_RE =
  /\n(?:CARRIER CONTACT|LOAD INFORMATION|PICKUPS?|DROPS?|DELIVER(?:Y|IES)|BILLING REQUIREMENTS|NOTE TO)\b/i;
const HEADER_ROLE_CUT_RE =
  /\b(?:carrier\s*:|stop\s+\d|pieces\b|pallets\b|pickups?\b|drops?\b|deliver(?:y|ies)\b)/i;
const NAME_STOPWORDS =
  /^(name|phone|email|fax|contact|dispatcher|driver|carrier|office|tel|mobile|info|ph|ext)$/i;

function looksLikePersonName(value: string): boolean {
  const text = collapse(value);
  if (!text || text.length < 3 || NAME_STOPWORDS.test(text)) return false;
  if (text.split(/\s+/).every((part) => NAME_STOPWORDS.test(part))) return false;
  return /^[A-Za-z][A-Za-z.'-]{1,30}(?:\s+[A-Za-z][A-Za-z.'-]{1,30}){0,3}$/.test(text);
}

function looksLikePlaceOrLoadNumber(value: string): boolean {
  const text = collapse(value);
  if (!text) return false;
  if (/\d{4,}/.test(text)) return true;
  if (/\b[A-Za-z].*,\s*[A-Z]{2}\b/.test(text)) return true;
  if (STREET_SUFFIX.test(text) || /^\d/.test(text)) return true;
  return false;
}

function looksLikeCompanyName(value: string): boolean {
  return /\b(llc|inc|incorporated|corp|ltd|company|group|logistics|express|loads|transport|trucking)\b/i.test(
    value,
  );
}

function cutAttnPerson(value: string): string {
  return collapse(value).replace(
    /\b(?:driver|cell|truck|trailer|mcid|ph|fax|reference|mcid|load|pieces|pallets)\b.*$/i,
    "",
  );
}

/** Carrier / Attn / Ph/Fax / Dispatch-to-carrier — not letterhead, not the stop table. */
function carrierRoleChunks(text: string): string[] {
  const raw = String(text ?? "");
  const chunks: string[] = [];
  for (const row of raw.matchAll(/\bcarrier(?:\s+contact)?\s*:[\s\S]{0,500}/gi)) {
    const block = row[0] ?? "";
    const cut = block.search(/\b(?:stop\s+\d|pickups?\b|pieces\b|pallets\b|must pulp|commodity\b)/i);
    chunks.push(cut >= 0 ? block.slice(0, cut) : block);
  }
  for (const row of raw.matchAll(/(?:^|\n)\s*carrier\s+contact\b[\s\S]{0,400}/gi)) {
    const block = row[0] ?? "";
    const cut = block.search(
      /\n(?:[^\n]*(?:CONTACT INFO|BROKER CONTACT|DISPATCH CONTACT|BOOKING CONTACT)|LOAD INFORMATION|PICKUPS?|DROPS?)/i,
    );
    chunks.push(cut >= 0 ? block.slice(0, cut) : block);
  }
  for (const row of raw.matchAll(/attn\s*:?\s*[A-Za-z][A-Za-z .'-]{1,60}/gi)) {
    chunks.push(row[0] ?? "");
  }
  for (const row of raw.matchAll(/ph\s*\/\s*fax\s*:?\s*[+\d().\-\s]{7,30}/gi)) {
    chunks.push(row[0] ?? "");
  }
  for (const row of raw.matchAll(/\bph\s*[:()][+\d().\-\s]{10,30}/gi)) {
    chunks.push(row[0] ?? "");
  }
  return chunks.filter((chunk) => chunk.trim());
}

function peopleInCarrierRole(text: string): string[] {
  const names: string[] = [];
  if (!text) return names;
  for (const chunk of carrierRoleChunks(text)) {
    for (const row of chunk.matchAll(/\battn\s*:?\s*([A-Za-z][A-Za-z .'-]{1,60})/gi)) {
      const name = cutAttnPerson(row[1] ?? "");
      if (name && looksLikePersonName(name)) names.push(name);
    }
    const carrierName = chunk.match(/\bcarrier(?:\s+contact)?\s*:?\s*([^\n,/]+)/i)?.[1];
    if (carrierName) names.push(collapse(carrierName));
  }
  return names;
}

function phonesInChunks(chunks: string[]): string[] {
  const phones: string[] = [];
  for (const chunk of chunks) {
    for (const phone of chunk.matchAll(new RegExp(PHONE_ONLY_RE.source, "g"))) {
      const digits = digitsPhone(phone[1] ?? "");
      if (digits.length >= 10) phones.push(digits);
    }
  }
  return phones;
}

function driverRolePhones(text: string): string[] {
  const phones: string[] = [];
  for (const row of String(text ?? "").matchAll(/\bcell\s*:?\s*([+\d().\-\s]{7,})/gi)) {
    const digits = digitsPhone(row[1] ?? "");
    if (digits.length >= 10) phones.push(digits);
  }
  return phones;
}

function stripCarrierAndDriverRoles(text: string): string {
  return String(text ?? "")
    .replace(
      /\bcarrier(?:\s+contact)?\s*:[\s\S]{0,240}?(?=\b(?:driver\s*:|cell\s*:|stop\s+\d|pieces\b|dispatch confirmation|rate confirmation|$))/gi,
      " ",
    )
    .replace(/(?:^|\n)\s*carrier\s+contact\b[\s\S]{0,240}?(?=\n[^\n]*(?:CONTACT INFO|BROKER CONTACT|DISPATCH CONTACT|BOOKING CONTACT)|$)/gi, "\n")
    .replace(/\battn\s*:?\s*[A-Za-z][A-Za-z .'-]{1,60}/gi, " ")
    .replace(/\bph\s*\/\s*fax\s*:?\s*[+\d().\-\s]{7,}/gi, " ")
    .replace(/\b(?:ph|fax)\s*[:|]\s*[+\d().\-\s]{7,}/gi, " ")
    .replace(/\bdriver\s*:?\s*[A-Za-z][A-Za-z .'-]{0,40}/gi, " ")
    .replace(/\bcell\s*:?\s*[+\d().\-\s]{7,}/gi, " ")
    .replace(/\b(?:truck|trailer|mcid)\s*:?\s*\S+/gi, " ")
    .replace(/m\s*&\s*s\s+loads(?:\s+llc)?/gi, " ")
    .replace(/ms\s*express(?:\s+tms)?/gi, " ")
    .replace(/[ \t]{2,}/g, " ");
}

function letterheadRegion(text: string): string {
  const raw = String(text ?? "").replace(/\r/g, "");
  const cut = raw.search(HEADER_ROLE_CUT_RE);
  const head = (cut >= 0 ? raw.slice(0, cut) : raw.slice(0, 900))
    .replace(/^\s*(?:dispatch confirmation|rate confirmation)\s*/i, "")
    .trim();
  return stripCarrierAndDriverRoles(head).trim();
}

/** Broker letterhead company. Never the carrier / our name. */
export function parseLetterheadCustomer(text: string): string {
  const head = letterheadRegion(text);
  const parts = head.split(/\n/).flatMap((line) => line.split(/\s{2,}/));
  for (const part of parts) {
    const cleaned = collapse(part)
      .replace(/\bload\s*number\b.*$/i, "")
      .replace(/\bmc\s*:.*$/i, "")
      .replace(/\bp(?:hone)?\s*:.*$/i, "")
      .trim();
    if (!cleaned || cleaned.length < 4 || cleaned.length > 80) continue;
    if (isOwnPaperworkName(cleaned, text) || looksLikePlaceOrLoadNumber(cleaned)) continue;
    if (looksLikeCompanyName(cleaned)) return cleaned;
    if (looksLikePersonName(cleaned)) continue;
  }
  return "";
}

export function letterheadOfficeCityState(text: string): string {
  const match = letterheadRegion(text).match(/\b([A-Z][A-Za-z.'-]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/);
  return match ? `${match[1]}, ${match[2]}` : "";
}

/** Pickup city. Never the broker office printed in the letterhead. */
export function resolveRateConOrigin(origin: string, shipper: ParsedStop, text: string): string {
  const fromShipper = cityStateFromStop(shipper);
  const office = letterheadOfficeCityState(text);
  const current = collapse(origin);
  if (office && current) {
    const officeCity = office.split(",")[0]?.trim().toLowerCase() ?? "";
    if (officeCity && current.toLowerCase().includes(officeCity)) return fromShipper;
  }
  return current || fromShipper;
}

export function parseLetterheadLoadNumber(text: string): string {
  const match = String(text ?? "").match(/\bload\s*(?:number|#|no\.?)\s*[:#-]?\s*([A-Z0-9-]{3,20})\b/i);
  return match?.[1]?.trim() ?? "";
}

export function pickBrokerCustomerName(text: string, candidates: string[]): string {
  for (const name of candidates) {
    const cleaned = collapse(name);
    if (!cleaned) continue;
    if (isOwnPaperworkName(cleaned, text) || looksLikePlaceOrLoadNumber(cleaned)) continue;
    if (looksLikeCompanyName(cleaned) || !looksLikePersonName(cleaned)) return cleaned;
  }
  return parseLetterheadCustomer(text);
}

export function parseLetterheadPhone(text: string): string {
  const head = letterheadRegion(text)
    .replace(/ph\s*\/\s*fax[\s\S]{0,40}/gi, " ")
    .replace(/\bfax\s*[:|]\s*[+\d().\-\s]{7,}/gi, " ");
  const labeled =
    head.match(/(?:^|[\s|,(])P(?:hone)?\s*[:|]\s*([+\d().\-\s]{10,})/i) ??
    head.match(/\btel(?:ephone)?\s*[:|]\s*([+\d().\-\s]{10,})/i) ??
    head.match(/\boffice\s*[:|]\s*([+\d().\-\s]{10,})/i);
  const digits = digitsPhone(labeled?.[1] ?? "");
  return digits.length === 10 ? formatTenDigitPhone(digits) : "";
}

/** Contact name is a broker dispatcher person only. */
export function brokerContactPersonName(value: string, sourceText = ""): string {
  const text = collapse(value);
  if (!text) return "";
  if (looksLikePlaceOrLoadNumber(text) || looksLikeCompanyName(text) || isOwnPaperworkName(text, sourceText)) {
    return "";
  }
  return looksLikePersonName(text) ? text : "";
}

function digitsPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : value.replace(/\s+/g, " ").trim();
}

function formatTenDigitPhone(digits: string): string {
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function usableContact(contact: ParsedBrokerContact): boolean {
  return Boolean(contact.contact_email || contact.contact_phone);
}

function parseContactFields(block: string, sourceText = ""): ParsedBrokerContact {
  const skipBilling = stripCarrierAndDriverRoles(
    String(block ?? "")
      .replace(/send\s+pod[\s\S]{0,120}/gi, " ")
      .replace(/billing instructions?[\s\S]{0,120}/gi, " "),
  );
  if (!skipBilling.trim()) return emptyBrokerContact();
  const email = skipBilling.match(BROKER_EMAIL_RE)?.[0]?.trim() ?? "";
  const withExt = skipBilling.match(PHONE_EXT_RE);
  const phoneRaw =
    withExt?.[1] ??
    skipBilling.match(/(?:phone|tel|office|(?:^|[\s|,(])p)\s*[:|]\s*([+\d().\-\s]{10,})/i)?.[1] ??
    skipBilling.match(PHONE_ONLY_RE)?.[1] ??
    "";
  const ext = (withExt?.[2] ?? (phoneRaw ? skipBilling.match(STANDALONE_EXT_RE)?.[1] : "") ?? "").trim();
  const phoneDigits = digitsPhone(phoneRaw || (withExt ? withExt[1] : ""));
  const labeledName =
    skipBilling.match(/(?:^|\n)\s*name\s*(?:\n|:|\|)\s*([A-Za-z][A-Za-z .'-]{1,60})/i)?.[1] ?? "";
  const phoneAt = withExt ? skipBilling.search(PHONE_EXT_RE) : skipBilling.search(PHONE_ONLY_RE);
  const beforePhone =
    phoneAt > 0
      ? skipBilling
          .slice(Math.max(0, phoneAt - 48), phoneAt)
          .match(/([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s*$/)?.[1] ?? ""
      : "";
  const named = labeledName || beforePhone;
  const contact_name = brokerContactPersonName(named, sourceText || block);
  const formatted = phoneDigits.length === 10 ? formatTenDigitPhone(phoneDigits) : collapse(phoneRaw);
  const contact_phone = formatted && /\d{7,}/.test(formatted.replace(/\D/g, "")) ? formatted : "";
  return {
    contact_name,
    contact_email: email,
    contact_phone,
    contact_ext: contact_phone ? ext : "",
  };
}

function contactBlocksFromHeaders(text: string): string[] {
  const blocks: string[] = [];
  for (const row of text.matchAll(CONTACT_HEADER_RE)) {
    const header = row[1] ?? "";
    if (/CARRIER\s+CONTACT/i.test(header)) continue;
    const start = row.index ?? 0;
    const headerEnd = start + row[0].length;
    const before = text.slice(Math.max(0, start - 500), start);
    const afterFull = text.slice(headerEnd);
    const cut = afterFull.search(NEXT_SECTION_RE);
    const after = (cut >= 0 ? afterFull.slice(0, cut) : afterFull).slice(0, 800);
    if (before.trim()) blocks.push(before);
    if (after.trim()) blocks.push(after);
  }
  return blocks;
}

function carrierSideIdentity(text: string): { names: string[]; phones: string[] } {
  const names = peopleInCarrierRole(text).map((name) => name.toLowerCase());
  const phones = [...phonesInChunks(carrierRoleChunks(text)), ...driverRolePhones(text)];
  return { names, phones };
}

export function isCarrierSideName(name: string, raw: string): boolean {
  const key = collapse(name);
  if (!key) return false;
  if (isOwnPaperworkName(key, raw)) return true;
  const nameKey = key.toLowerCase();
  return carrierSideIdentity(raw).names.some((item) => item.includes(nameKey) || nameKey.includes(item));
}

export function isCarrierSidePhone(phone: string, raw: string): boolean {
  const digits = digitsPhone(phone);
  if (digits.length < 10) return false;
  const letterhead = digitsPhone(parseLetterheadPhone(raw));
  if (letterhead && letterhead === digits) return false;
  return carrierSideIdentity(raw).phones.includes(digits);
}

export function isCarrierSideContact(contact: ParsedBrokerContact, raw: string): boolean {
  const email = collapse(contact.contact_email);
  if (isCarrierSideName(contact.contact_name, raw) || isOwnPaperworkName(email, raw)) return true;
  return isCarrierSidePhone(contact.contact_phone, raw);
}

/** Drop carrier-side name/phone only. Keep a letterhead phone when the name is us. */
export function rejectCarrierSideContact(contact: ParsedBrokerContact, raw: string): ParsedBrokerContact {
  const letterheadPhone = parseLetterheadPhone(raw);
  const name = isCarrierSideName(contact.contact_name, raw)
    ? ""
    : brokerContactPersonName(contact.contact_name, raw);
  const email = isOwnPaperworkName(contact.contact_email, raw) ? "" : contact.contact_email;
  const phone = isCarrierSidePhone(contact.contact_phone, raw)
    ? letterheadPhone
    : contact.contact_phone || letterheadPhone;
  return {
    contact_name: name,
    contact_email: email,
    contact_phone: phone,
    contact_ext: phone && phone === contact.contact_phone ? contact.contact_ext : "",
  };
}

function parseHeaderBrokerContact(text: string): ParsedBrokerContact {
  const head = letterheadRegion(text);
  if (!head) {
    return {
      ...emptyBrokerContact(),
      contact_phone: parseLetterheadPhone(text),
    };
  }
  const fields = parseContactFields(head, text);
  return {
    contact_name: brokerContactPersonName(fields.contact_name, text),
    contact_email: fields.contact_email,
    contact_phone: fields.contact_phone || parseLetterheadPhone(text),
    contact_ext: fields.contact_ext,
  };
}

/** Copy name/email/phone/ext from the broker role on the packet. Never Carrier/Attn/driver. */
export function parseBrokerContactFromText(raw: string): ParsedBrokerContact {
  const text = String(raw ?? "").replace(/\r/g, "");
  if (!text.trim()) return emptyBrokerContact();
  const cleaned = stripCarrierAndDriverRoles(text);
  const tableRow = cleaned.match(CONTACT_TABLE_RE)?.[1] ?? "";
  let found = rejectCarrierSideContact(parseContactFields(tableRow, text), text);
  if (!usableContact(found)) {
    for (const block of contactBlocksFromHeaders(cleaned)) {
      const parsed = rejectCarrierSideContact(parseContactFields(block, text), text);
      if (usableContact(parsed)) {
        found = parsed;
        break;
      }
    }
  }
  const header = rejectCarrierSideContact(parseHeaderBrokerContact(text), text);
  const merged = !usableContact(found)
    ? header
    : {
        ...found,
        contact_name: found.contact_name || header.contact_name,
        contact_phone: found.contact_phone || header.contact_phone,
      };
  return {
    ...merged,
    contact_name: brokerContactPersonName(merged.contact_name, text),
    contact_phone: merged.contact_phone || parseLetterheadPhone(text),
  };
}

export function mergeBrokerContact(
  preferred: Partial<ParsedBrokerContact> | null | undefined,
  fallback: ParsedBrokerContact,
  raw = "",
): ParsedBrokerContact {
  const left = rejectCarrierSideContact(
    {
      contact_name: String(preferred?.contact_name ?? "").trim(),
      contact_email: String(preferred?.contact_email ?? "").trim(),
      contact_phone: String(preferred?.contact_phone ?? "").trim(),
      contact_ext: String(preferred?.contact_ext ?? "").trim(),
    },
    raw,
  );
  const right = rejectCarrierSideContact(fallback, raw);
  return {
    contact_name: brokerContactPersonName(left.contact_name || right.contact_name, raw),
    contact_email: left.contact_email || right.contact_email,
    contact_phone: left.contact_phone || right.contact_phone || parseLetterheadPhone(raw),
    contact_ext: left.contact_ext || right.contact_ext,
  };
}

/** Re-apply writes a blank parsed name over a stored Carrier Attn name. */
export function rateConApplyContactFields(
  parsed: ParsedBrokerContact,
  existing: Partial<ParsedBrokerContact> = {},
): ParsedBrokerContact {
  return {
    contact_name: parsed.contact_name,
    contact_email: parsed.contact_email,
    contact_phone: parsed.contact_phone || existing.contact_phone || "",
    contact_ext: parsed.contact_phone ? parsed.contact_ext : existing.contact_ext || "",
  };
}
