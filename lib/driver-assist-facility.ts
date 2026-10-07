/**
 * Driver Assist facility answers: any shipper or receiver in the TMS, facility fields only.
 * Never reads private `notes`, rates, customers, billing, invoices, other drivers, or loads.
 * Empty fields say "not on file". No world knowledge, no LLM.
 */
import { overnightSentence, parkingSentence } from "./location-facility-shared";
import { fuzzyWordMatch, normalizeText, tokenize } from "./driver-assist-match";
import type { Location } from "./types";

export type FacilityField = "hours" | "receiving_hours" | "shipping_hours" | "parking" | "check_in" | "phone" | "gate_dock" | "address";

export type FacilityChoice = { id: number; label: string };

export type FacilityMatch =
  | { kind: "none" }
  | { kind: "one"; location: Location; strong: boolean }
  | { kind: "many"; choices: FacilityChoice[]; phrase: string; strong: boolean };

/** Only these columns ever reach a driver. */
export type DriverFacility = Pick<
  Location,
  | "id"
  | "name"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "phone"
  | "hours"
  | "scheduling_type"
  | "scheduling_notes"
  | "call_before"
  | "receiving_hours"
  | "shipping_hours"
  | "parking"
  | "overnight_parking"
  | "parking_notes"
  | "gate_dock_notes"
>;

export function toDriverFacility(location: Location): DriverFacility {
  return {
    id: location.id,
    name: location.name,
    street: location.street,
    city: location.city,
    state: location.state,
    zip: location.zip,
    phone: location.phone,
    hours: location.hours,
    scheduling_type: location.scheduling_type,
    scheduling_notes: location.scheduling_notes,
    call_before: location.call_before,
    receiving_hours: location.receiving_hours ?? "",
    shipping_hours: location.shipping_hours ?? "",
    parking: location.parking ?? "",
    overnight_parking: location.overnight_parking ?? "",
    parking_notes: location.parking_notes ?? "",
    gate_dock_notes: location.gate_dock_notes ?? "",
  };
}

const NAME_NOISE = new Set([
  "inc", "llc", "co", "corp", "corporation", "company", "the", "of", "and", "ltd", "lp", "dc", "whse", "warehouse",
]);

/** Words in a question that are never part of a facility name. */
const QUESTION_WORDS = new Set([
  "a", "an", "the", "at", "to", "for", "of", "on", "in", "is", "are", "am", "do", "does", "did", "can", "could", "will",
  "would", "should", "i", "me", "my", "we", "us", "you", "they", "them", "their", "there", "it", "its", "that", "this",
  "what", "whats", "when", "where", "which", "who", "how", "time", "times", "hours", "hour", "open", "opens", "opening",
  "close", "closes", "closing", "closed", "have", "has", "get", "got", "any", "onsite", "site", "parking", "park",
  "overnight", "night", "stay", "sleep", "lot", "check", "checkin", "in", "appointment", "appt", "notes", "note", "phone",
  "number", "call", "contact", "gate", "dock", "docks", "door", "address", "located", "location", "directions", "and",
  "or", "receiving", "receive", "shipping", "ship", "pickup", "pick", "up", "delivery", "deliver", "drop", "shipper",
  "receiver", "receivers", "shippers", "consignee", "facility", "place", "info", "about", "tell", "please", "today", "tomorrow", "now", "with",
  "from", "be", "if", "need", "want", "know", "hey", "hi", "so", "go", "going", "allowed", "allow", "let", "lets",
  "truck", "trucks", "trailer", "load", "go", "instructions", "procedure", "process", "rules", "busy", "late", "early",
  "much", "many", "long", "wait", "yes", "no", "ok", "okay", "still", "again", "too", "also", "just", "same", "spot",
  "spots", "space", "room", "hrs", "am", "pm", "weekend", "saturday", "sunday", "monday", "friday",
]);

export const FACILITY_PRONOUN = /\b(they|them|their|there|theirs|it|that place|this place|same place)\b/i;

function nameTokens(name: string): string[] {
  return tokenize(name).filter((token) => !NAME_NOISE.has(token) && token !== "#");
}

function acronym(tokens: string[]): string {
  return tokens.map((token) => token[0]).join("");
}

function questionNameTokens(question: string): string[] {
  return tokenize(question).filter((token) => !QUESTION_WORDS.has(token) && token.length >= 2);
}

function richness(location: Location): number {
  const fields = [
    location.street,
    location.zip,
    location.phone,
    location.hours,
    location.scheduling_notes,
    location.receiving_hours,
    location.shipping_hours,
    location.parking,
    location.overnight_parking,
    location.parking_notes,
    location.gate_dock_notes,
  ];
  return fields.filter((value) => String(value ?? "").trim()).length;
}

function facilityKey(location: Location): string {
  return `${nameTokens(location.name).join(" ")}|${normalizeText(location.city)}|${normalizeText(location.state)}`;
}

export function facilityLabel(location: Pick<Location, "name" | "city" | "state">): string {
  const where = [location.city, location.state].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
  return where ? `${location.name} (${where})` : location.name;
}

/**
 * Finds the facility a question names. Full-name and acronym hits (NCS) beat partial hits.
 * Same-name rows in the same city collapse to the most complete record. Distinct places → ask which.
 */
export function matchFacility(question: string, locations: Location[]): FacilityMatch {
  const qTokens = questionNameTokens(question);
  if (!qTokens.length) return { kind: "none" };
  const vocabulary = new Set<string>();
  const cityWords = new Set<string>();
  const named = locations.map((location) => {
    const tokens = nameTokens(location.name);
    for (const token of tokens) vocabulary.add(token);
    for (const token of tokenize(location.city)) if (token.length >= 4) cityWords.add(token);
    return { location, tokens, place: [...tokens, ...tokenize(`${location.city} ${location.state}`)] };
  });
  // An acronym ("NCS") is a question word that is not itself a word in any facility name.
  const acronymTokens = qTokens.filter((q) => q.length >= 2 && q.length <= 5 && !vocabulary.has(q));
  // Tiers: 4 exact (name ⇔ question words), 3 name inside a longer question or acronym, 2 question inside a longer name.
  type Hit = { location: Location; tier: number; size: number };
  const hits: Hit[] = [];
  for (const { location, tokens, place } of named) {
    if (!tokens.length) continue;
    const nameCovered = tokens.every((token) => qTokens.some((q) => fuzzyWordMatch(q, token)));
    const meaningful = qTokens.filter((q) => q.length >= 3);
    const questionCovered =
      meaningful.length > 0 &&
      meaningful.length === qTokens.length &&
      meaningful.every((q) => place.some((token) => fuzzyWordMatch(q, token)));
    // A city word in the question that is not this site's city rules the site out ("Americold Omaha").
    const otherCity = qTokens.some(
      (q) => cityWords.has(q) && !tokens.some((token) => fuzzyWordMatch(q, token)) && !place.some((token) => fuzzyWordMatch(q, token)),
    );
    if (otherCity) continue;
    if (nameCovered && questionCovered) {
      hits.push({ location, tier: 4, size: tokens.length });
    } else if (nameCovered) {
      hits.push({ location, tier: 3, size: tokens.length });
    } else if (tokens.length >= 2 && acronymTokens.includes(acronym(tokens))) {
      hits.push({ location, tier: 3, size: tokens.length });
    } else if (questionCovered && qTokens.some((q) => q.length >= 4)) {
      hits.push({ location, tier: 2, size: tokens.length });
    }
  }
  if (!hits.length) return { kind: "none" };
  let best: Hit[];
  if (hits.some((hit) => hit.tier === 4)) {
    // "Americold" exactly, plus every longer "Americold …" name → the driver must pick.
    best = hits.filter((hit) => hit.tier === 4 || hit.tier === 2);
  } else if (hits.some((hit) => hit.tier === 3)) {
    const tier3 = hits.filter((hit) => hit.tier === 3);
    const maxSize = Math.max(...tier3.map((hit) => hit.size));
    best = tier3.filter((hit) => hit.size === maxSize || hit.size >= 2);
    const longest = best.filter((hit) => hit.size === maxSize);
    if (maxSize >= 2 && longest.length) best = longest;
  } else {
    best = hits;
  }
  const groups = new Map<string, Location>();
  for (const hit of best) {
    const key = facilityKey(hit.location);
    const prior = groups.get(key);
    if (!prior || richness(hit.location) > richness(prior) || (richness(hit.location) === richness(prior) && hit.location.id < prior.id)) {
      groups.set(key, hit.location);
    }
  }
  const unique = [...groups.values()];
  const strong = best.some((hit) => hit.tier >= 3);
  if (unique.length === 1) return { kind: "one", location: unique[0], strong };
  return {
    kind: "many",
    strong,
    phrase: qTokens.join(" "),
    choices: unique
      .sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city))
      .slice(0, 6)
      .map((location) => ({ id: location.id, label: facilityLabel(location) })),
  };
}

export function detectFacilityFields(question: string): FacilityField[] {
  const text = normalizeText(question);
  const fields: FacilityField[] = [];
  const receiving = /\b(receiv\w*|deliver\w*|unload\w*|drop)\b/.test(text);
  const shipping = /\b(ship\w*|pick\s*up|pickup|load\s+out)\b/.test(text);
  if (/\b(hours?|hrs|open\w*|close\w*|closing)\b/.test(text) || (/\bwhen\b/.test(text) && (receiving || shipping))) {
    if (receiving && !shipping) fields.push("receiving_hours");
    else if (shipping && !receiving) fields.push("shipping_hours");
    else fields.push("hours");
  }
  if (/\b(park\w*|overnight|sleep|stay\s+the\s+night|truck\s+lot)\b/.test(text)) fields.push("parking");
  if (/\b(check\s*-?\s*in|checkin|appointment|appt|scheduling|instructions?)\b/.test(text)) fields.push("check_in");
  if (/\b(phone|number|call|contact)\b/.test(text)) fields.push("phone");
  if (/\b(gate|dock|docks|door|guard)\b/.test(text)) fields.push("gate_dock");
  if (/\b(address|located|location|where\s+is|directions)\b/.test(text)) fields.push("address");
  return fields;
}

function line(label: string, value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

function addressLine(facility: DriverFacility): string {
  const cityState = [facility.city, facility.state].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
  return [String(facility.street ?? "").trim(), cityState, String(facility.zip ?? "").trim()].filter(Boolean).join(" ");
}

function notOnFile(name: string, what: string, facility: DriverFacility): string {
  const phone = String(facility.phone ?? "").trim();
  return phone ? `${what} for ${name} is not on file. Phone on file: ${phone}.` : `${what} for ${name} is not on file.`;
}

function fieldAnswer(field: FacilityField, facility: DriverFacility, name: string): { text: string; known: boolean } {
  switch (field) {
    case "hours":
    case "receiving_hours":
    case "shipping_hours": {
      const general = String(facility.hours ?? "").trim();
      const receiving = String(facility.receiving_hours ?? "").trim();
      const shipping = String(facility.shipping_hours ?? "").trim();
      const lines =
        field === "receiving_hours"
          ? [line("Receiving hours", receiving) ?? line("Hours", general)]
          : field === "shipping_hours"
            ? [line("Shipping hours", shipping) ?? line("Hours", general)]
            : [line("Hours", general), line("Receiving hours", receiving), line("Shipping hours", shipping)];
      const found = lines.filter((value): value is string => Boolean(value));
      if (!found.length) return { text: notOnFile(name, "Hours", facility), known: false };
      return { text: found.join("\n"), known: true };
    }
    case "parking": {
      const lines = [
        parkingSentence(String(facility.parking ?? "")),
        overnightSentence(String(facility.overnight_parking ?? "")),
        line("Parking notes", facility.parking_notes) ?? "",
      ].filter(Boolean);
      if (!lines.length) return { text: notOnFile(name, "Parking info", facility), known: false };
      return { text: lines.join("\n"), known: true };
    }
    case "check_in": {
      const lines = [
        facility.scheduling_type === "appointment" ? "Appointment required." : facility.scheduling_type === "fcfs" ? "First come, first served." : "",
        facility.call_before ? "Call before arrival." : "",
        line("Check-in notes", facility.scheduling_notes) ?? "",
      ].filter(Boolean);
      const hasNotes = Boolean(String(facility.scheduling_notes ?? "").trim());
      if (!hasNotes) lines.push("Check-in notes are not on file.");
      return { text: lines.join("\n"), known: hasNotes };
    }
    case "phone": {
      const phone = String(facility.phone ?? "").trim();
      return phone ? { text: `Phone: ${phone}`, known: true } : { text: `A phone number for ${name} is not on file.`, known: false };
    }
    case "gate_dock": {
      const value = line("Gate and dock notes", facility.gate_dock_notes);
      return value ? { text: value, known: true } : { text: notOnFile(name, "Gate and dock notes", facility), known: false };
    }
    case "address": {
      const address = addressLine(facility);
      return address ? { text: `Address: ${address}`, known: true } : { text: `An address for ${name} is not on file.`, known: false };
    }
  }
}

/** Facility answer text. With no specific field, returns every driver-facing field. */
export function facilityAnswer(location: Location, fields: FacilityField[]): { answer: string; unknown: boolean } {
  const facility = toDriverFacility(location);
  const name = facilityLabel(location);
  const asked: FacilityField[] = fields.length ? fields : ["address", "hours", "check_in", "parking", "gate_dock", "phone"];
  const parts = asked.map((field) => fieldAnswer(field, facility, name));
  const header = name;
  return {
    answer: [header, ...parts.map((part) => part.text)].join("\n"),
    unknown: parts.every((part) => !part.known),
  };
}

export function facilityIntent(question: string): boolean {
  return detectFacilityFields(question).length > 0;
}
