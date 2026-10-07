import { readFile } from "node:fs/promises";
import { getCompanyDocument, getCompanyDocumentPath, listCurrentCompanyDocs, type CompanyDocWithUnit } from "./company-docs";
import { COMPANY_DOC_DIVISION, companyDocSlot } from "./company-docs-shared";
import { getDb } from "./db";
import { DriverApiHttpError, driverApiError, requireDriverApiAuth } from "./driver-api";
import {
  FACILITY_PRONOUN,
  detectFacilityFields,
  facilityAnswer,
  matchFacility,
  type FacilityChoice,
  type FacilityField,
} from "./driver-assist-facility";
import {
  mentionsCabCard,
  mentionsDocsGeneric,
  mentionsTrailer,
  mentionsTruck,
  namedAssistDocKinds,
  unitCandidates,
  unitMatches,
  type AssistDocKind,
} from "./driver-assist-match";
import { requireAssignedLoad } from "./driver-ops";
import { getSignedInDriver } from "./driver-session";
import { getFleetDocument, getFleetDocumentPath, listFleetDocuments, sanitizeName } from "./files";
import { formatDateTime, isAppointmentSchedule } from "./format";
import { getLocation, getTrailer, getTruck, listLoadsForDriver, listLocations, listTrailers, listTrucks } from "./queries";
import { relayForDriver } from "./relay-store";
import { ensureDefaultStops, type LoadStop } from "./stops";
import {
  isActiveLoadStatus,
  type DriverWithTruck,
  type FleetDocument,
  type LoadView,
  type Location,
} from "./types";

export const DRIVER_ASSIST_NOT_IN_TMS = "Not in TMS.";
export const DRIVER_ASSIST_NO_ACTIVE_LOAD = "Nothing is assigned to you right now.";
export const DRIVER_ASSIST_REFUSAL =
  "I can only answer from your assigned load, truck and trailer papers, company docs, and shipper or receiver info on file.";
export const DRIVER_ASSIST_INACTIVE = "Assist is for active MS Express drivers. Call the office.";
export const DRIVER_ASSIST_WHICH_PLACE = "Which place do you mean? Say the shipper or receiver name.";
export const DRIVER_ASSIST_PLACE_NOT_FOUND = "That place is not in the TMS. Check the name, or ask the office.";
export const DRIVER_ASSIST_WHICH_TRAILER =
  "Which trailer? Say the trailer number, like \"trailer MS2205 registration\".";

type StopTarget = "pickup" | "delivery" | "both";
type AssistIntent = "appointment" | "hours" | "address" | "notes" | "unknown";

type EquipmentScope = {
  truckIds: Set<number>;
  trailerIds: Set<number>;
};

export type DriverAssistDocumentRef = {
  id: number;
  kind: string;
  owner_type: "truck" | "trailer" | "driver" | "company";
  owner_id: number;
  original_name: string;
  href: string;
  /** "Truck 26", "Trailer MS2205", or "" for driver and company-wide files. */
  unit_label: string;
  expires_on?: string;
};

export type DriverAssistResponse = {
  answer: string;
  unknown: boolean;
  documents: DriverAssistDocumentRef[];
  /** Facility this answer is about. Send it back as `facility_id` so "they" resolves next turn. */
  facility?: { id: number; name: string };
  /** Tap targets when several facilities match. */
  choices?: FacilityChoice[];
};

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? "";
}

async function requireDriverAssistAuth(request: Request): Promise<DriverWithTruck> {
  if (bearerToken(request)) {
    return requireDriverApiAuth(request);
  }
  const driver = await getSignedInDriver();
  if (!driver) {
    throw new DriverApiHttpError(401, "Sign in with your email and password.", "UNAUTHORIZED");
  }
  return driver;
}

/** Only active MS Express drivers get anything from Assist. */
export function isActiveMseDriver(driver: Pick<DriverWithTruck, "active" | "division"> | null | undefined): boolean {
  if (!driver) return false;
  if (Number(driver.active ?? 1) === 0) return false;
  return String(driver.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION;
}

function activeAssignedLoad(driverId: number): LoadView | null {
  return listLoadsForDriver(driverId).find((load) => isActiveLoadStatus(load.status)) ?? null;
}

function detectTarget(question: string): StopTarget {
  const hasPickup = /\b(pickup|shipper|origin)\b/i.test(question);
  const hasDelivery = /\b(delivery|receiver|consignee|destination)\b/i.test(question);
  if (hasPickup && hasDelivery) return "both";
  if (hasPickup) return "pickup";
  if (hasDelivery) return "delivery";
  return "both";
}

function classifyIntent(question: string): { intent: AssistIntent; target: StopTarget } {
  const target = detectTarget(question);
  if (/\b(hours?|open|close|closing|opening)\b/i.test(question)) {
    return { intent: "hours", target };
  }
  if (/\b(address|street|zip|postal|city|state|where)\b/i.test(question)) {
    return { intent: "address", target };
  }
  if (/\b(note|notes|instruction|instructions|special|public)\b/i.test(question)) {
    return { intent: "notes", target };
  }
  if (/\b(appointment|appt|window|when|time)\b/i.test(question)) {
    return { intent: "appointment", target };
  }
  return { intent: "unknown", target };
}

/** Words that tie a question to the driver's own load rather than a remembered facility. */
const LOAD_SCOPED = /\b(appointment|appt|window|confirmation|my load|this load|pickup|pick up|delivery|shipper|receiver|consignee|origin|destination)\b/i;

function stopFor(stops: LoadStop[], kind: "pickup" | "delivery"): LoadStop | null {
  return stops.find((stop) => stop.kind === kind) ?? null;
}

/**
 * Equipment the driver may open gated docs for. Load truck/trailer (or relay leg) first.
 * With no load equipment, the driver's home truck and the trailer hooked to it.
 */
function resolveEquipmentScope(driver: DriverWithTruck, load: LoadView | null): EquipmentScope {
  const truckIds = new Set<number>();
  const trailerIds = new Set<number>();
  if (load?.truck_id) truckIds.add(load.truck_id);
  if (load?.trailer_id) trailerIds.add(load.trailer_id);

  if (load) {
    const relay = relayForDriver(load.id, driver.id);
    if (relay) {
      if (relay.driver_id === driver.id) {
        if (!truckIds.size && relay.truck_id) truckIds.add(relay.truck_id);
        if (!trailerIds.size && relay.trailer_id) trailerIds.add(relay.trailer_id);
      }
      if (relay.from_driver_id === driver.id) {
        if (!truckIds.size && relay.from_truck_id) truckIds.add(relay.from_truck_id);
        if (!trailerIds.size && relay.from_trailer_id) trailerIds.add(relay.from_trailer_id);
      }
    }
  }

  if (!truckIds.size && !trailerIds.size && driver.truck_id) {
    truckIds.add(driver.truck_id);
    const hooked = getDb()
      .prepare("SELECT id FROM trailers WHERE truck_id = ? AND active != 0")
      .all(driver.truck_id) as Array<{ id: number }>;
    for (const row of hooked) trailerIds.add(row.id);
  }

  return { truckIds, trailerIds };
}

function unitLabel(ownerType: string, ownerId: number): string {
  if (ownerType === "truck") {
    const truck = getTruck(ownerId);
    return truck ? `Truck ${truck.unit_number}` : "Truck";
  }
  if (ownerType === "trailer") {
    const trailer = getTrailer(ownerId);
    return trailer ? `Trailer ${trailer.unit_number}` : "Trailer";
  }
  return "";
}

function toAssistDoc(doc: FleetDocument): DriverAssistDocumentRef {
  return {
    id: doc.id,
    kind: doc.kind,
    owner_type: doc.owner_type,
    owner_id: doc.owner_id,
    original_name: doc.original_name,
    href: `/api/driver/v1/assist/docs/${doc.id}`,
    unit_label: unitLabel(doc.owner_type, doc.owner_id),
  };
}

function toCompanyAssistDoc(doc: CompanyDocWithUnit): DriverAssistDocumentRef {
  return {
    id: doc.id,
    kind: doc.slot,
    owner_type: "company",
    owner_id: doc.unit_id ?? 0,
    original_name: doc.original_name,
    href: `/api/driver/v1/assist/company-docs/${doc.id}`,
    unit_label: doc.unit_type === "truck" ? `Truck ${doc.unit_number}` : doc.unit_type === "trailer" ? `Trailer ${doc.unit_number}` : "",
    expires_on: doc.expires_on,
  };
}

function appointmentLine(kind: "pickup" | "delivery", load: LoadView, stop: LoadStop | null): string {
  const whenRaw =
    String(stop?.window_start ?? "").trim() ||
    String(kind === "pickup" ? load.pickup_start : load.delivery_start).trim();
  if (!whenRaw) return "";
  const when = formatDateTime(whenRaw);
  if (!when || when === "—") return "";
  const schedule = String(stop?.schedule_type ?? "").trim();
  const scheduleLabel = isAppointmentSchedule(schedule) ? "APPT" : schedule.toLowerCase() === "fcfs" ? "FCFS" : "";
  const confirmation = String(stop?.confirmation ?? "").trim();
  const side = kind === "pickup" ? "Pickup" : "Delivery";
  const main = scheduleLabel ? `${side} appointment (${scheduleLabel}): ${when}.` : `${side} appointment: ${when}.`;
  return confirmation ? `${main} Confirmation: "${confirmation}".` : main;
}

function stopLocation(kind: "pickup" | "delivery", load: LoadView, stop: LoadStop | null): Location | null {
  const locationId =
    stop?.location_id ??
    (kind === "pickup" ? (load.shipper_location_id ?? null) : (load.consignee_location_id ?? null));
  return locationId ? getLocation(locationId) : null;
}

function hoursValue(kind: "pickup" | "delivery", load: LoadView, stop: LoadStop | null): string {
  const location = stopLocation(kind, load, stop);
  if (!location) return "";
  const sideHours = String((kind === "pickup" ? location.shipping_hours : location.receiving_hours) ?? "").trim();
  return sideHours || String(location.hours ?? "").trim();
}

function addressValue(stop: LoadStop | null): string {
  if (!stop) return "";
  const street = String(stop.street ?? "").trim();
  const city = String(stop.city ?? "").trim();
  const state = String(stop.state ?? "").trim();
  const zip = String(stop.zip ?? "").trim();
  const cityState = [city, state].filter(Boolean).join(", ");
  return [street, cityState, zip].filter(Boolean).join(" ");
}

function answerWithTarget(
  target: StopTarget,
  pickupValue: string,
  deliveryValue: string,
  label: string,
  quote = false,
): DriverAssistResponse {
  if (target === "pickup") {
    if (!pickupValue) return { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
    const value = quote ? `"${pickupValue}"` : pickupValue;
    return { answer: `Pickup ${label}: ${value}`, unknown: false, documents: [] };
  }
  if (target === "delivery") {
    if (!deliveryValue) return { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
    const value = quote ? `"${deliveryValue}"` : deliveryValue;
    return { answer: `Delivery ${label}: ${value}`, unknown: false, documents: [] };
  }
  const pickup = pickupValue ? (quote ? `"${pickupValue}"` : pickupValue) : DRIVER_ASSIST_NOT_IN_TMS;
  const delivery = deliveryValue ? (quote ? `"${deliveryValue}"` : deliveryValue) : DRIVER_ASSIST_NOT_IN_TMS;
  return {
    answer: `Pickup ${label}: ${pickup}\nDelivery ${label}: ${delivery}`,
    unknown: !pickupValue && !deliveryValue,
    documents: [],
  };
}

function notesAnswer(load: LoadView, question: string): DriverAssistResponse {
  const wantsAppointment = /\bappointment\b/i.test(question);
  const wantsSpecial = /\bspecial|instruction/i.test(question);
  const wantsPublic = /\bpublic\b/i.test(question);

  if (wantsAppointment) {
    const value = String(load.appointment_notes ?? "").trim();
    return value
      ? { answer: value, unknown: false, documents: [] }
      : { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
  }
  if (wantsSpecial) {
    const value = String(load.special_instructions ?? "").trim();
    return value
      ? { answer: value, unknown: false, documents: [] }
      : { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
  }
  if (wantsPublic) {
    const value = String(load.public_notes ?? "").trim();
    return value
      ? { answer: value, unknown: false, documents: [] }
      : { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
  }

  const lines: string[] = [];
  const appointment = String(load.appointment_notes ?? "").trim();
  const special = String(load.special_instructions ?? "").trim();
  const publicNotes = String(load.public_notes ?? "").trim();
  if (appointment) lines.push(`Appointment notes: ${appointment}`);
  if (special) lines.push(`Special instructions: ${special}`);
  if (publicNotes) lines.push(`Public notes: ${publicNotes}`);
  if (!lines.length) {
    return { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
  }
  return { answer: lines.join("\n"), unknown: false, documents: [] };
}

/* ----------------------------- Documents ----------------------------- */

const CAB_DOC_KINDS = ["registration", "dot_inspection", "insurance"] as const;
const DRIVER_CAB_DOC_KINDS = ["cdl", "med_card"] as const;

const KIND_RANK: Record<string, number> = {
  registration: 0,
  insurance_card: 1,
  insurance: 2,
  ifta_license: 3,
  dot_inspection: 4,
  cdl: 5,
  med_card: 6,
  other: 7,
};

const OWNER_RANK: Record<string, number> = { company: 0, truck: 1, trailer: 2, driver: 3 };

function sortDocs(docs: DriverAssistDocumentRef[]): DriverAssistDocumentRef[] {
  return [...docs].sort((a, b) => {
    const kindDelta = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
    if (kindDelta) return kindDelta;
    const ownerDelta = (OWNER_RANK[a.owner_type] ?? 9) - (OWNER_RANK[b.owner_type] ?? 9);
    if (ownerDelta) return ownerDelta;
    return a.unit_label.localeCompare(b.unit_label);
  });
}

function dedupeDocs(docs: DriverAssistDocumentRef[]): DriverAssistDocumentRef[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = `${doc.owner_type}-${doc.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type UnitRow = { id: number; unit_number: string; division?: string | null; active?: number | null };

function mseTrailers(): UnitRow[] {
  return listTrailers().filter(
    (trailer) => String(trailer.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION && Number(trailer.active ?? 1) !== 0,
  );
}

function mseTrucks(): UnitRow[] {
  return listTrucks().filter(
    (truck) => String(truck.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION && Number(truck.active ?? 1) !== 0,
  );
}

function matchUnits(candidates: string[], units: UnitRow[]): UnitRow[] {
  return units.filter((unit) => candidates.some((candidate) => unitMatches(candidate, unit.unit_number)));
}

function unitNumberOf(table: "trucks" | "trailers", id: number): string {
  const row = getDb().prepare(`SELECT unit_number FROM ${table} WHERE id = ?`).get(id) as { unit_number?: string } | undefined;
  return row?.unit_number ?? String(id);
}

type DocsContext = {
  driver: DriverWithTruck;
  scope: EquipmentScope;
};

function fleetDocsFor(ownerType: "truck" | "trailer", ids: Iterable<number>, kind: string): DriverAssistDocumentRef[] {
  const out: DriverAssistDocumentRef[] = [];
  for (const id of ids) {
    out.push(...listFleetDocuments(ownerType, id).filter((doc) => doc.kind === kind).map(toAssistDoc));
  }
  return out;
}

function ownDriverDocs(driverId: number, kinds: readonly string[]): DriverAssistDocumentRef[] {
  return listFleetDocuments("driver", driverId)
    .filter((doc) => kinds.includes(doc.kind))
    .map(toAssistDoc);
}

type DocPart = { documents: DriverAssistDocumentRef[]; notes: string[]; ask?: boolean };

function registrationPart(question: string, ctx: DocsContext): DocPart {
  const cabCard = mentionsCabCard(question);
  const saysTrailer = mentionsTrailer(question);
  const saysTruck = mentionsTruck(question) || cabCard;
  const wantTrailer = saysTrailer || !saysTruck;
  const wantTruck = saysTruck || !saysTrailer;
  const candidates = unitCandidates(question);
  const documents: DriverAssistDocumentRef[] = [];
  const notes: string[] = [];
  let ask = false;

  const namedTrailers = candidates.length && wantTrailer ? matchUnits(candidates, mseTrailers()) : [];
  const namedTrucks = candidates.length && wantTruck ? matchUnits(candidates, listTrucks()) : [];

  if (candidates.length && !namedTrailers.length && !namedTrucks.length) {
    const label = saysTrailer && !saysTruck ? "Trailer" : saysTruck && !saysTrailer ? "Truck" : "Unit";
    return { documents: [], notes: [`${label} ${candidates.join(", ")} not found in MS Express units.`] };
  }

  // Trailers: fleet-wide for active MS Express drivers. Named trailer wins, else the assigned trailer.
  if (wantTrailer) {
    const targets = namedTrailers.length
      ? namedTrailers.map((trailer) => trailer.id)
      : namedTrucks.length
        ? []
        : [...ctx.scope.trailerIds];
    if (!targets.length && !namedTrucks.length) {
      if (saysTrailer && !saysTruck) ask = true;
      else notes.push("No trailer is assigned to you. Say a trailer number to get its registration.");
    }
    for (const id of targets) {
      const docs = fleetDocsFor("trailer", [id], "registration");
      if (docs.length) documents.push(...docs);
      else notes.push(`Trailer ${unitNumberOf("trailers", id)}: no registration on file. Ask the office to upload it.`);
    }
  }

  // Trucks: assigned truck only. A named truck that is not theirs is refused.
  if (wantTruck) {
    let targets: number[] = [];
    if (namedTrucks.length) {
      for (const truck of namedTrucks) {
        if (ctx.scope.truckIds.has(truck.id)) targets.push(truck.id);
        else notes.push(`Truck ${truck.unit_number} is not assigned to you. Ask the office for its registration.`);
      }
    } else if (!namedTrailers.length) {
      targets = [...ctx.scope.truckIds];
      if (!targets.length) notes.push("No truck is assigned to you right now.");
    }
    for (const id of targets) {
      const docs = fleetDocsFor("truck", [id], "registration");
      if (docs.length) documents.push(...docs);
      else notes.push(`Truck ${unitNumberOf("trucks", id)}: no registration on file. Ask the office to upload it.`);
    }
  }
  return { documents, notes, ask };
}

function insurancePart(question: string, ctx: DocsContext): DocPart {
  const candidates = unitCandidates(question);
  const saysTrailer = mentionsTrailer(question);
  const saysTruck = mentionsTruck(question);
  const cards = listCurrentCompanyDocs("insurance_card");
  let unitKeys: Set<string>;
  if (candidates.length) {
    // Per-unit insurance cards are fleet-wide for active drivers, like trailer registrations.
    const trailers = saysTruck && !saysTrailer ? [] : matchUnits(candidates, mseTrailers());
    const trucks = saysTrailer && !saysTruck ? [] : matchUnits(candidates, mseTrucks());
    if (!trailers.length && !trucks.length) {
      return { documents: [], notes: [`Unit ${candidates.join(", ")} not found in MS Express units.`] };
    }
    unitKeys = new Set([...trailers.map((t) => `trailer:${t.id}`), ...trucks.map((t) => `truck:${t.id}`)]);
  } else {
    unitKeys = new Set([
      ...[...ctx.scope.truckIds].map((id) => `truck:${id}`),
      ...[...ctx.scope.trailerIds].map((id) => `trailer:${id}`),
    ]);
  }
  const documents = cards
    .filter((card) => !card.unit_type || unitKeys.has(`${card.unit_type}:${card.unit_id}`))
    .map(toCompanyAssistDoc);
  // Older insurance files saved on the assigned truck or trailer record stay gated to assignment.
  documents.push(...fleetDocsFor("truck", ctx.scope.truckIds, "insurance"), ...fleetDocsFor("trailer", ctx.scope.trailerIds, "insurance"));
  const notes = documents.length ? [] : ["No insurance card is on file. Ask the office to upload it."];
  return { documents, notes };
}

function iftaPart(): DocPart {
  const documents = listCurrentCompanyDocs("ifta_license").map(toCompanyAssistDoc);
  return { documents, notes: documents.length ? [] : ["The IFTA license is not on file. Ask the office to upload it."] };
}

function gatedEquipmentPart(kind: "dot_inspection" | "other", ctx: DocsContext, label: string): DocPart {
  const documents = [...fleetDocsFor("truck", ctx.scope.truckIds, kind), ...fleetDocsFor("trailer", ctx.scope.trailerIds, kind)];
  return { documents, notes: documents.length ? [] : [`No ${label} file on file for your assigned truck/trailer.`] };
}

function personalPart(kind: "cdl" | "med_card", ctx: DocsContext): DocPart {
  const documents = ownDriverDocs(ctx.driver.id, [kind]);
  const label = kind === "cdl" ? "CDL" : "med card";
  return { documents, notes: documents.length ? [] : [`No ${label} file on file for you.`] };
}

function defaultBundle(ctx: DocsContext): DocPart {
  const cab: DriverAssistDocumentRef[] = [];
  for (const kind of CAB_DOC_KINDS) {
    cab.push(...fleetDocsFor("truck", ctx.scope.truckIds, kind), ...fleetDocsFor("trailer", ctx.scope.trailerIds, kind));
  }
  const unitKeys = new Set([
    ...[...ctx.scope.truckIds].map((id) => `truck:${id}`),
    ...[...ctx.scope.trailerIds].map((id) => `trailer:${id}`),
  ]);
  const company = listCurrentCompanyDocs()
    .filter((doc) => !doc.unit_type || unitKeys.has(`${doc.unit_type}:${doc.unit_id}`))
    .map(toCompanyAssistDoc);
  const documents = [...cab, ...company, ...ownDriverDocs(ctx.driver.id, DRIVER_CAB_DOC_KINDS)];
  return {
    documents,
    notes: documents.length ? [] : ["No registration, DOT, or insurance file on file for your assigned truck/trailer."],
  };
}

function docsAnswer(question: string, ctx: DocsContext): DriverAssistResponse {
  const kinds = namedAssistDocKinds(question);
  const parts: DocPart[] = [];
  if (!kinds.length) {
    parts.push(defaultBundle(ctx));
  } else {
    for (const kind of kinds as AssistDocKind[]) {
      if (kind === "registration") parts.push(registrationPart(question, ctx));
      else if (kind === "insurance") parts.push(insurancePart(question, ctx));
      else if (kind === "ifta_license") parts.push(iftaPart());
      else if (kind === "dot_inspection") parts.push(gatedEquipmentPart("dot_inspection", ctx, "DOT"));
      else if (kind === "other") parts.push(gatedEquipmentPart("other", ctx, "other"));
      else if (kind === "cdl" || kind === "med_card") parts.push(personalPart(kind, ctx));
    }
  }
  const documents = sortDocs(dedupeDocs(parts.flatMap((part) => part.documents)));
  const notes = [...new Set(parts.flatMap((part) => part.notes))];
  if (!documents.length && parts.some((part) => part.ask)) {
    return { answer: [DRIVER_ASSIST_WHICH_TRAILER, ...notes].join("\n"), unknown: true, documents: [] };
  }
  if (!documents.length) {
    return { answer: notes.join("\n") || DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
  }
  return { answer: ["Cab docs on file.", ...notes].join("\n"), unknown: false, documents };
}

/* ----------------------------- Facilities ----------------------------- */

function facilityResponse(location: Location, fields: FacilityField[]): DriverAssistResponse {
  const { answer, unknown } = facilityAnswer(location, fields);
  return { answer, unknown, documents: [], facility: { id: location.id, name: location.name } };
}

/** A capitalized word past the first ("When does Nebraska Cold Storage open?") or an all-caps acronym. */
function namesAPlace(question: string): boolean {
  const words = question.trim().split(/\s+/).slice(1);
  return words.some((word) => /^[A-Z][a-z]{2,}/.test(word) || /^[A-Z]{2,5}[,.?!]?$/.test(word));
}

function facilityTurn(
  question: string,
  contextFacilityId: number | null,
  hasLoad: boolean,
): DriverAssistResponse | null {
  const fields = detectFacilityFields(question);
  const match = matchFacility(question, listLocations());
  if (match.kind === "one") {
    if (!fields.length && !match.strong) return null;
    return facilityResponse(match.location, fields);
  }
  if (match.kind === "many" && (match.strong || fields.length)) {
    const picked = contextFacilityId && match.choices.some((choice) => choice.id === contextFacilityId) ? getLocation(contextFacilityId) : null;
    if (picked) return facilityResponse(picked, fields);
    return {
      answer: `Several places match "${match.phrase}". Which one?\n${match.choices.map((choice, index) => `${index + 1}. ${choice.label}`).join("\n")}${match.choices.length >= 6 ? "\nNot listed? Add the city, like \"Americold Atlanta hours\"." : ""}`,
      unknown: true,
      documents: [],
      choices: match.choices,
    };
  }
  if (!fields.length) return null;
  const pronoun = FACILITY_PRONOUN.test(question);
  if (match.kind === "none" && namesAPlace(question) && !LOAD_SCOPED.test(question)) {
    return { answer: DRIVER_ASSIST_PLACE_NOT_FOUND, unknown: true, documents: [] };
  }
  const context = contextFacilityId ? getLocation(contextFacilityId) : null;
  if (context && (pronoun || !LOAD_SCOPED.test(question))) {
    return facilityResponse(context, fields);
  }
  if (pronoun && !hasLoad) {
    return { answer: DRIVER_ASSIST_WHICH_PLACE, unknown: true, documents: [] };
  }
  return null;
}

/** Parking, gate/dock, phone, and check-in for the driver's own pickup or delivery stop. */
function loadFacilityAnswer(load: LoadView, question: string, target: StopTarget): DriverAssistResponse | null {
  const fields = detectFacilityFields(question).filter((field) => field === "parking" || field === "gate_dock" || field === "phone");
  if (!fields.length) return null;
  const stops = ensureDefaultStops(load.id);
  const sides: Array<"pickup" | "delivery"> = target === "both" ? ["pickup", "delivery"] : [target];
  const answers: string[] = [];
  let anyKnown = false;
  let lastLocation: Location | null = null;
  for (const side of sides) {
    const location = stopLocation(side, load, stopFor(stops, side));
    const label = side === "pickup" ? "Pickup" : "Delivery";
    if (!location) {
      answers.push(`${label}: ${DRIVER_ASSIST_NOT_IN_TMS}`);
      continue;
    }
    const result = facilityAnswer(location, fields);
    anyKnown = anyKnown || !result.unknown;
    lastLocation = location;
    answers.push(`${label} · ${result.answer}`);
  }
  const response: DriverAssistResponse = { answer: answers.join("\n"), unknown: !anyKnown, documents: [] };
  if (sides.length === 1 && lastLocation) response.facility = { id: lastLocation.id, name: lastLocation.name };
  return response;
}

/* ----------------------------- Router ----------------------------- */

function loadAnswer(load: LoadView, question: string): DriverAssistResponse {
  const { intent, target } = classifyIntent(question);
  const facilityExtra = loadFacilityAnswer(load, question, target);
  if (facilityExtra && intent !== "hours" && intent !== "appointment") return facilityExtra;
  const stops = ensureDefaultStops(load.id);
  const pickupStop = stopFor(stops, "pickup");
  const deliveryStop = stopFor(stops, "delivery");

  if (intent === "unknown") {
    return { answer: DRIVER_ASSIST_REFUSAL, unknown: true, documents: [] };
  }
  if (intent === "appointment") {
    const pickup = appointmentLine("pickup", load, pickupStop);
    const delivery = appointmentLine("delivery", load, deliveryStop);
    if (target === "pickup") return pickup ? { answer: pickup, unknown: false, documents: [] } : { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
    if (target === "delivery") return delivery ? { answer: delivery, unknown: false, documents: [] } : { answer: DRIVER_ASSIST_NOT_IN_TMS, unknown: true, documents: [] };
    return {
      answer: `Pickup: ${pickup || DRIVER_ASSIST_NOT_IN_TMS}\nDelivery: ${delivery || DRIVER_ASSIST_NOT_IN_TMS}`,
      unknown: !pickup && !delivery,
      documents: [],
    };
  }
  if (intent === "hours") {
    return answerWithTarget(target, hoursValue("pickup", load, pickupStop), hoursValue("delivery", load, deliveryStop), "hours", true);
  }
  if (intent === "address") {
    return answerWithTarget(target, addressValue(pickupStop), addressValue(deliveryStop), "address");
  }
  return notesAnswer(load, question);
}

export function answerDriverAssist(
  driver: DriverWithTruck,
  question: string,
  options: { facilityId?: number | null } = {},
): DriverAssistResponse {
  if (!isActiveMseDriver(driver)) {
    return { answer: DRIVER_ASSIST_INACTIVE, unknown: true, documents: [] };
  }
  const load = activeAssignedLoad(driver.id);
  const assigned = load ? requireAssignedLoad(load.id, driver.id, { allowCancelled: true }) : null;
  const scope = resolveEquipmentScope(driver, assigned);

  if (namedAssistDocKinds(question).length || mentionsDocsGeneric(question)) {
    return docsAnswer(question, { driver, scope });
  }
  const facility = facilityTurn(question, options.facilityId ?? null, Boolean(assigned));
  if (facility) return facility;
  if (!assigned) {
    const { intent } = classifyIntent(question);
    if (intent === "unknown" && !detectFacilityFields(question).length) {
      return { answer: DRIVER_ASSIST_REFUSAL, unknown: true, documents: [] };
    }
    return { answer: DRIVER_ASSIST_NO_ACTIVE_LOAD, unknown: true, documents: [] };
  }
  return loadAnswer(assigned, question);
}

function canReadDoc(doc: FleetDocument, scope: EquipmentScope, driverId: number): boolean {
  if (doc.owner_type === "truck") return scope.truckIds.has(doc.owner_id);
  if (doc.owner_type === "trailer") {
    if (scope.trailerIds.has(doc.owner_id)) return true;
    // Trailer registrations are fleet-wide for active MS Express drivers (drivers swap trailers).
    if (doc.kind !== "registration") return false;
    const trailer = getTrailer(doc.owner_id);
    return Boolean(
      trailer &&
        Number(trailer.active ?? 1) !== 0 &&
        String(trailer.division ?? "MSE").toUpperCase() === COMPANY_DOC_DIVISION,
    );
  }
  return doc.owner_type === "driver" && doc.owner_id === driverId;
}

function mapAssistError(error: unknown): Response {
  if (error instanceof DriverApiHttpError) {
    return driverApiError(error.status, error.message, error.code);
  }
  if (error instanceof Error && error.message === "Request body is missing.") {
    return driverApiError(409, error.message, "CONFLICT");
  }
  if (error instanceof Error && error.message === "Sign in with your email and password.") {
    return driverApiError(401, error.message, "UNAUTHORIZED");
  }
  return driverApiError(409, "Something went wrong.", "CONFLICT");
}

export async function handleDriverAssist(request: Request): Promise<Response> {
  try {
    const driver = await requireDriverAssistAuth(request);
    const body = (await request.json()) as { question?: unknown; facility_id?: unknown };
    const question = String(body?.question ?? "").trim();
    if (!question) {
      throw new DriverApiHttpError(409, "Question is required.", "CONFLICT");
    }
    const facilityId = Number.parseInt(String(body?.facility_id ?? ""), 10);
    return Response.json(
      answerDriverAssist(driver, question.slice(0, 500), {
        facilityId: Number.isInteger(facilityId) && facilityId > 0 ? facilityId : null,
      }),
    );
  } catch (error) {
    return mapAssistError(error);
  }
}

export async function handleDriverAssistDocument(
  request: Request,
  params: Promise<{ fleetDocumentId: string }>,
): Promise<Response> {
  try {
    const driver = await requireDriverAssistAuth(request);
    if (!isActiveMseDriver(driver)) {
      return driverApiError(403, DRIVER_ASSIST_INACTIVE, "FORBIDDEN");
    }
    const docId = Number.parseInt((await params).fleetDocumentId, 10);
    if (!docId) {
      return driverApiError(404, "Document not found.", "NOT_FOUND");
    }
    const doc = getFleetDocument(docId);
    if (!doc) {
      return driverApiError(404, "Document not found.", "NOT_FOUND");
    }
    const load = activeAssignedLoad(driver.id);
    const assigned = load ? requireAssignedLoad(load.id, driver.id, { allowCancelled: true }) : null;
    const scope = resolveEquipmentScope(driver, assigned);
    if (!canReadDoc(doc, scope, driver.id)) {
      return driverApiError(403, "This document is not assigned to you.", "FORBIDDEN");
    }
    const buffer = await readFile(getFleetDocumentPath(doc));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${sanitizeName(doc.original_name)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return new Response("This file is no longer on this computer.", { status: 404 });
    }
    return mapAssistError(error);
  }
}

/** Current MS Express company docs (IFTA license, insurance cards): any active MS Express driver, read-only. */
export async function handleDriverAssistCompanyDocument(
  request: Request,
  params: Promise<{ companyDocumentId: string }>,
): Promise<Response> {
  try {
    const driver = await requireDriverAssistAuth(request);
    if (!isActiveMseDriver(driver)) {
      return driverApiError(403, DRIVER_ASSIST_INACTIVE, "FORBIDDEN");
    }
    const doc = getCompanyDocument(Number.parseInt((await params).companyDocumentId, 10));
    if (!doc || doc.status !== "current" || !companyDocSlot(doc.slot)) {
      return driverApiError(404, "Document not found.", "NOT_FOUND");
    }
    const buffer = await readFile(getCompanyDocumentPath(doc));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${sanitizeName(doc.original_name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return new Response("This file is no longer on this computer.", { status: 404 });
    }
    return mapAssistError(error);
  }
}

