import { readFile } from "node:fs/promises";
import { DriverApiHttpError, driverApiError, requireDriverApiAuth } from "./driver-api";
import { requireAssignedLoad } from "./driver-ops";
import { getSignedInDriver } from "./driver-session";
import { getFleetDocument, getFleetDocumentPath, listFleetDocuments, sanitizeName } from "./files";
import { formatDateTime, isAppointmentSchedule } from "./format";
import { getLocation, listLoadsForDriver } from "./queries";
import { relayForDriver } from "./relay-store";
import { ensureDefaultStops, type LoadStop } from "./stops";
import {
  isActiveLoadStatus,
  type DriverWithTruck,
  type FleetDocument,
  type LoadView,
} from "./types";

export const DRIVER_ASSIST_NOT_IN_TMS = "Not in TMS.";
export const DRIVER_ASSIST_NO_ACTIVE_LOAD = "Nothing is assigned to you right now.";
export const DRIVER_ASSIST_REFUSAL =
  "I can only answer from your assigned load and assigned equipment documents.";

type StopTarget = "pickup" | "delivery" | "both";
type AssistIntent = "appointment" | "hours" | "address" | "notes" | "docs" | "unknown";

type EquipmentScope = {
  truckIds: Set<number>;
  trailerIds: Set<number>;
};

export type DriverAssistDocumentRef = {
  id: number;
  kind: FleetDocument["kind"];
  owner_type: FleetDocument["owner_type"];
  owner_id: number;
  original_name: string;
  href: string;
};

export type DriverAssistResponse = {
  answer: string;
  unknown: boolean;
  documents: DriverAssistDocumentRef[];
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
  if (/\b(doc|docs|document|paperwork|registration|insurance|inspection|cdl|license|med(?:ical)?\s*card)\b/i.test(question)) {
    return { intent: "docs", target };
  }
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

function stopFor(stops: LoadStop[], kind: "pickup" | "delivery"): LoadStop | null {
  return stops.find((stop) => stop.kind === kind) ?? null;
}

function resolveEquipmentScope(
  driver: DriverWithTruck,
  load: LoadView | null,
  options: { allowHomeTruck: boolean },
): EquipmentScope {
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

  if (!truckIds.size && !trailerIds.size && options.allowHomeTruck && driver.truck_id) {
    truckIds.add(driver.truck_id);
  }

  return { truckIds, trailerIds };
}

function toAssistDoc(doc: FleetDocument): DriverAssistDocumentRef {
  return {
    id: doc.id,
    kind: doc.kind,
    owner_type: doc.owner_type,
    owner_id: doc.owner_id,
    original_name: doc.original_name,
    href: `/api/driver/v1/assist/docs/${doc.id}`,
  };
}

function listAssistDocuments(driver: DriverWithTruck, scope: EquipmentScope): DriverAssistDocumentRef[] {
  const docs: FleetDocument[] = [];
  for (const truckId of scope.truckIds) {
    docs.push(...listFleetDocuments("truck", truckId));
  }
  for (const trailerId of scope.trailerIds) {
    docs.push(...listFleetDocuments("trailer", trailerId));
  }
  docs.push(...listFleetDocuments("driver", driver.id));
  const seen = new Set<number>();
  return docs
    .filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    })
    .map(toAssistDoc);
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

function hoursValue(kind: "pickup" | "delivery", load: LoadView, stop: LoadStop | null): string {
  const locationId =
    stop?.location_id ??
    (kind === "pickup" ? (load.shipper_location_id ?? null) : (load.consignee_location_id ?? null));
  const hours = locationId ? String(getLocation(locationId)?.hours ?? "").trim() : "";
  return hours;
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

const CAB_DOC_KINDS = ["registration", "dot_inspection", "insurance"] as const;
const DRIVER_CAB_DOC_KINDS = ["cdl", "med_card"] as const;

const CAB_KIND_RANK: Record<string, number> = {
  registration: 0,
  dot_inspection: 1,
  insurance: 2,
  cdl: 3,
  med_card: 4,
  other: 5,
};

const CAB_OWNER_RANK: Record<string, number> = {
  truck: 0,
  trailer: 1,
  driver: 2,
};

function cabKindPhrase(kind: FleetDocument["kind"]): string {
  switch (kind) {
    case "registration":
      return "registration";
    case "dot_inspection":
      return "DOT";
    case "insurance":
      return "insurance";
    case "cdl":
      return "CDL";
    case "med_card":
      return "med card";
    default:
      return "other";
  }
}

function namedDocKinds(question: string): FleetDocument["kind"][] {
  const kinds: FleetDocument["kind"][] = [];
  if (/\breg(?:istration)?\b/i.test(question)) kinds.push("registration");
  if (/\b(?:dot(?:\s*inspection)?|inspection)\b/i.test(question)) kinds.push("dot_inspection");
  if (/\binsurance\b/i.test(question)) kinds.push("insurance");
  if (/\b(?:cdl|licen[sc]e)\b/i.test(question)) kinds.push("cdl");
  if (/\bmed(?:ical)?\s*cards?\b/i.test(question)) kinds.push("med_card");
  if (/\bother\b/i.test(question)) kinds.push("other");
  return kinds;
}

function sortCabDocs(docs: DriverAssistDocumentRef[]): DriverAssistDocumentRef[] {
  return [...docs].sort((a, b) => {
    const kindDelta = (CAB_KIND_RANK[a.kind] ?? 9) - (CAB_KIND_RANK[b.kind] ?? 9);
    if (kindDelta) return kindDelta;
    return (CAB_OWNER_RANK[a.owner_type] ?? 9) - (CAB_OWNER_RANK[b.owner_type] ?? 9);
  });
}

function missingCabDocSentence(kinds: FleetDocument["kind"][]): string {
  const phrases = kinds.map(cabKindPhrase);
  const list =
    phrases.length <= 1
      ? (phrases[0] ?? "registration")
      : phrases.length === 2
        ? `${phrases[0]} or ${phrases[1]}`
        : `${phrases.slice(0, -1).join(", ")}, or ${phrases[phrases.length - 1]}`;
  const driverOnly = kinds.length > 0 && kinds.every((kind) => kind === "cdl" || kind === "med_card");
  if (driverOnly) return `No ${list} file on file for you.`;
  return `No ${list} file on file for your assigned truck/trailer.`;
}

/**
 * Default "My truck docs" keeps cab kinds on the assigned truck and trailer,
 * then this driver's CDL and med card. Other kinds stay out until the question names them.
 */
function selectCabDocs(
  question: string,
  docs: DriverAssistDocumentRef[],
): { selected: DriverAssistDocumentRef[]; missingKinds: FleetDocument["kind"][] } {
  const named = namedDocKinds(question);
  if (named.length) {
    const selected = sortCabDocs(docs.filter((doc) => named.includes(doc.kind)));
    const missingKinds = named.filter((kind) => !selected.some((doc) => doc.kind === kind));
    return { selected, missingKinds };
  }
  const cab = docs.filter(
    (doc) =>
      (doc.owner_type === "truck" || doc.owner_type === "trailer") &&
      (CAB_DOC_KINDS as readonly string[]).includes(doc.kind),
  );
  const personal = docs.filter(
    (doc) => doc.owner_type === "driver" && (DRIVER_CAB_DOC_KINDS as readonly string[]).includes(doc.kind),
  );
  const selected = sortCabDocs([...cab, ...personal]);
  return {
    selected,
    missingKinds: selected.length ? [] : ["registration", "dot_inspection", "insurance"],
  };
}

function docsAnswer(question: string, docs: DriverAssistDocumentRef[]): DriverAssistResponse {
  const { selected, missingKinds } = selectCabDocs(question, docs);
  if (!selected.length) {
    return { answer: missingCabDocSentence(missingKinds), unknown: true, documents: [] };
  }
  return {
    answer: "Cab docs on file.",
    unknown: false,
    documents: selected,
  };
}

function answerQuestion(
  load: LoadView,
  question: string,
  docs: DriverAssistDocumentRef[],
): DriverAssistResponse {
  const { intent, target } = classifyIntent(question);
  const stops = ensureDefaultStops(load.id);
  const pickupStop = stopFor(stops, "pickup");
  const deliveryStop = stopFor(stops, "delivery");

  if (intent === "unknown") {
    return { answer: DRIVER_ASSIST_REFUSAL, unknown: true, documents: [] };
  }
  if (intent === "docs") {
    return docsAnswer(question, docs);
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

function canReadDoc(
  doc: FleetDocument,
  scope: EquipmentScope,
  driverId: number,
): boolean {
  if (doc.owner_type === "truck") return scope.truckIds.has(doc.owner_id);
  if (doc.owner_type === "trailer") return scope.trailerIds.has(doc.owner_id);
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
    const body = (await request.json()) as { question?: unknown };
    const question = String(body?.question ?? "").trim();
    if (!question) {
      throw new DriverApiHttpError(409, "Question is required.", "CONFLICT");
    }
    const load = activeAssignedLoad(driver.id);
    if (!load) {
      return Response.json({ answer: DRIVER_ASSIST_NO_ACTIVE_LOAD, unknown: true, documents: [] });
    }
    const assigned = requireAssignedLoad(load.id, driver.id, { allowCancelled: true });
    const scope = resolveEquipmentScope(driver, assigned, { allowHomeTruck: false });
    const docs = listAssistDocuments(driver, scope);
    return Response.json(answerQuestion(assigned, question, docs));
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
    const scope = resolveEquipmentScope(driver, assigned, { allowHomeTruck: true });
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
