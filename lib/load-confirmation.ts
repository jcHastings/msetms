import PDFDocument from "./pdfkit-document";
import { getCompanyProfile } from "./company";
import { formatMdYDisplay, isAppointmentSchedule, isFcfsSchedule } from "./format";
import { tmsCustomerInvoiceLines } from "./invoice";
import { computeOwnerOperatorPay } from "./settlement";
import {
  applyLocationToStop,
  formatStopPartyAddress,
  isPlaceholderStopName,
  matchLocationForStop,
  normalizeLocationName,
} from "./locations";
import { resolveLoadCustomerPhoneLine } from "./load-contact";
import { getCustomer, getLoad, getLocation, getTrailer, listLocations } from "./queries";
import { listStops, stopTypeNumber, type LoadStop } from "./stops";
import { locationRuleLabels } from "./location-rules-shared";
import { formatInternalRelayLines, formatRelayLane } from "./relays";
import { listRelays, relayForDriver } from "./relay-store";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { expandDocumentTags } from "./document-tags";
import { companyLogoPath, formatCompanyAddress, getCompanySettings, getDocumentDefaults } from "./settings";
import { assignedLoadName } from "./owner-operator-shared";
import { isOwnerOperator, type CompanyProfile, type LoadView } from "./types";
import { parseDriverMessageLocale, type DriverMessageLocale } from "./load-summary";
import { cityStateOnly } from "./load-documents-shared";
import { expandTruncatedDispatchNotes, joinUniqueNotes, parseStopPaperwork } from "./rate-con-paperwork";
import { driverFacingTermsText } from "./document-copy";

export type ConfirmationStop = {
  title: string;
  name: string;
  address: string;
  phone: string;
  date: string;
  time: string;
  type: string;
  quantity: string;
  weight: string;
  poNumber: string;
  confirmationNumber: string;
  puNumber: string;
  extra: string;
  hoursLabel: string;
  hours: string;
  appointment: string;
  description: string;
};

export type ConfirmationRateLine = {
  name: string;
  amount: number;
};

export type ConfirmationModel = {
  packet: "customer" | "internal";
  style: "owner_operator" | "company_driver";
  company: CompanyProfile;
  loadNumber: string;
  shipDate: string;
  todayDate: string;
  carrierName: string;
  carrierPhone: string;
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  equipment: string;
  truckNumber: string;
  trailerNumber: string;
  agreedAmount: number | null;
  customerName: string;
  customerBilling: string;
  customerContact: string;
  customerPhone: string;
  customerEmail: string;
  customerReference: string;
  customerRate: number | null;
  customerRateLines: ConfirmationRateLine[];
  headerCompany: string;
  headerDispatcher: string;
  headerPhone: string;
  headerEmail: string;
  loadStatus: string;
  shipper: ConfirmationStop;
  consignee: ConfirmationStop;
  stops: ConfirmationStop[];
  dispatchNotes: string;
  internalLegs: string;
  reeferSetpoint: string;
  reeferMode: string;
  locale?: DriverMessageLocale;
};

const BLOCKED_CONTACT_NAME =
  /^(ms\s*test|jojo(?:\s+schwartz)?|carrier\s*attn|ana(?:\s+g)?|esti\s+katz)$/i;
const BLOCKED_PAPER_EMAIL = /@(?:msloads|msexpress)\.com$/i;
const INK = "#000000";
const NAVY = "#12315c";

export function confirmationStatus(load: LoadView): string {
  if (load.status === "in_transit" || load.driver_progress) return "On Route";
  if (load.status === "assigned" || load.status === "dispatched") return "Dispatched";
  if (load.status === "available") return "Available";
  if (load.status === "at_pickup") return "At pickup";
  if (load.status === "delivered" || load.status === "completed") return "Delivered";
  if (load.status === "cancelled") return "Cancelled";
  return "";
}

function normalizePersonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeCityZip(value: string): boolean {
  const text = value.trim();
  if (/^\d{5}(?:-\d{4})?$/.test(text)) return true;
  return /^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(text);
}

function looksLikePersonName(value: string): boolean {
  return /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)+$/.test(value.trim());
}

function isBlockedPaperName(value: string, driverName = ""): boolean {
  const text = value.trim();
  if (!text) return true;
  if (BLOCKED_CONTACT_NAME.test(text)) return true;
  if (/m\s*&\s*s\s+loads|ms\s*express/i.test(text)) return true;
  if (driverName && normalizePersonKey(text) === normalizePersonKey(driverName)) return true;
  if (looksLikeCityZip(text)) return true;
  return false;
}

function printableHeaderDispatcher(load: LoadView): string {
  const name = String(load.contact_name ?? "").trim();
  if (isBlockedPaperName(name, load.driver_name ?? "")) return "";
  if (!looksLikePersonName(name)) return "";
  return name;
}

function printableHeaderPhone(load: LoadView): string {
  const phone = resolveLoadCustomerPhoneLine(load);
  if (!phone || looksLikeCityZip(phone)) return "";
  return phone;
}

function printableHeaderEmail(load: LoadView, fallback = ""): string {
  const email = String(load.contact_email || fallback || "").trim();
  if (!email) return "";
  if (BLOCKED_PAPER_EMAIL.test(email) || /ana@msloads/i.test(email)) return "";
  return email;
}

export function isPaperworkJunk(value: string): boolean {
  const text = String(value ?? "").trim();
  if (!text) return true;
  if (text.length <= 1) return true;
  if (/^[sSÐð•·\-_|]+$/.test(text)) return true;
  return false;
}

export function stripPaperworkPrefix(value: string): string {
  return String(value ?? "")
    .replace(/^(?:PO|CONF(?:IRMATION)?|P\/?U)\s*#\s*/i, "")
    .trim();
}

function stripPaperworkLabelsFromNotes(text: string): string {
  return String(text ?? "")
    .replace(/\bP\/?U\s*#\s*[A-Z0-9-]+/gi, "")
    .replace(/\bPO\s*#\s*[A-Z0-9-]+/gi, "")
    .replace(/\bCONF(?:IRMATION)?\s*#\s*[A-Z0-9-]+/gi, "")
    .replace(/\(\s*\d{2,5}\s*cases?\s*\)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseRepeatedPhrases(text: string): string {
  const parts = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (kept.some((prior) => prior.toLowerCase() === key)) continue;
    if (parts.some((other) => other !== part && other.toLowerCase().startsWith(key) && other.length > part.length + 8)) {
      continue;
    }
    kept.push(part);
  }
  return kept.join("\n").trim();
}

function stripNotesAlreadyPrinted(extra: string, already: string): string {
  const printed = collapseRepeatedPhrases(already).replace(/\s+/g, " ").toLowerCase();
  if (!printed) return collapseRepeatedPhrases(extra);
  const kept: string[] = [];
  for (const part of collapseRepeatedPhrases(extra).split(/\n+/)) {
    const phrase = part.trim();
    if (!phrase) continue;
    if (printed.includes(phrase.replace(/\s+/g, " ").toLowerCase())) continue;
    kept.push(phrase);
  }
  return kept.join("\n").trim();
}

export function equipmentLabel(load: LoadView): string {
  const trailer = load.trailer_id ? getTrailer(load.trailer_id) : null;
  const type = trailer?.type || load.trailer_type || "";
  if (type === "reefer") return "53' Reefer";
  if (type === "dry_van") return "53' Dry Van";
  if (type === "flatbed") return "53' Flatbed";
  if (type === "box") return "Box Truck";
  if (type === "power_only") return "Power Only";
  if (load.equipment === "reefer_53") return "53' Reefer";
  if (load.equipment === "dry_van_53") return "53' Dry Van";
  return type ? type.replaceAll("_", " ") : "";
}

export function agreedAmountForLoad(load: LoadView): number | null {
  if (!isOwnerOperator(load.driver_type)) return null;
  if (load.oo_pay != null) return load.oo_pay;
  return computeOwnerOperatorPay(load.rate, load.oo_percent);
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return `${value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  })} USD`;
}

export function formatMdY(iso: string): string {
  const value = formatMdYDisplay(iso);
  return value === "—" ? "" : value;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatStopClock(stop: LoadStop | undefined, fallback = ""): string {
  const start = stop?.window_start || fallback;
  if (!start) return "";
  if (isAppointmentSchedule(stop?.schedule_type)) return formatClock(start);
  if (isFcfsSchedule(stop?.schedule_type)) {
    const from = formatClock(start);
    const to = formatClock(stop?.window_end || "");
    if (from && to && from !== to) return `${from} – ${to}`;
    return from || to;
  }
  return formatClock(start);
}

function appointmentLabel(notes: string): string {
  if (!notes.trim()) return "No";
  if (/^no\b/i.test(notes.trim())) return "No";
  return "Yes";
}

function confirmationParty(
  stop: LoadStop | undefined,
  fallbackLocationId: number | null,
  laneFallback = "",
  customerName = "",
) {
  const linked = getLocation(stop?.location_id ?? fallbackLocationId ?? 0);
  const matched = linked ?? (stop ? matchLocationForStop(listLocations(), stop) : null);
  const base = stop
    ? {
        name: stop.name,
        street: stop.street,
        city: stop.city,
        state: stop.state,
        zip: stop.zip,
        phone: stop.phone,
        location_id: stop.location_id,
      }
    : matched
      ? {
          name: matched.name,
          street: matched.street,
          city: matched.city,
          state: matched.state,
          zip: matched.zip,
          phone: matched.phone,
          location_id: matched.id,
        }
      : null;
  const merged = base
    ? applyLocationToStop(
        base,
        matched ?? { id: 0, name: "", street: "", city: "", state: "", zip: "", phone: "" },
      )
    : null;
  const address = merged
    ? formatStopPartyAddress(merged) || laneFallback.trim()
    : laneFallback.trim();
  let name = merged?.name.trim() || matched?.name.trim() || "";
  if (isPlaceholderStopName(name, merged?.city ?? "") && matched?.name.trim()) name = matched.name.trim();
  if (customerName && normalizeLocationName(name) === normalizeLocationName(customerName)) {
    name = matched && normalizeLocationName(matched.name) !== normalizeLocationName(customerName)
      ? matched.name.trim()
      : "";
  }
  return {
    name,
    address,
    phone: (merged?.phone || matched?.phone || "").trim(),
    hours: matched?.hours ?? "",
    extra: [
      ...locationRuleLabels(matched),
      matched?.scheduling_notes ?? "",
      stop?.instructions,
      stop?.notes,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n"),
    appointment: matched?.scheduling_type === "appointment" ? "Yes" : matched ? "No" : "",
    location: matched,
  };
}

function looksLikeBillingAddress(value: string): boolean {
  if (/\d/.test(value) && /\b[A-Z]{2}\b/.test(value)) return true;
  return /\d/.test(value) && /\b(st|street|ave|rd|blvd|dr|way|ln|ct|hwy|pkwy|box)\b/i.test(value);
}

function printableCustomerBilling(notes: string): string {
  const trimmed = notes.trim();
  if (!trimmed) return "";
  if (/created from a rate confirmation/i.test(trimmed)) return "";
  if (/^net\s*\d+\s*\.?$/i.test(trimmed)) return "";
  const flattened = trimmed.replace(/\s*\n+\s*/g, ", ");
  return looksLikeBillingAddress(flattened) ? flattened : "";
}

function confirmationCustomer(load: LoadView): {
  name: string;
  billing: string;
  contact: string;
  phone: string;
  email: string;
  reference: string;
} {
  const customer = getCustomer(load.customer_id);
  const storedContact = customer?.contacts[0];
  const billingFromNotes = printableCustomerBilling(String(customer?.billing_notes ?? ""));
  const contactName = printableHeaderDispatcher(load) || "";
  const fallbackContact = String(storedContact?.name ?? "").trim();
  const contact =
    contactName ||
    (!isBlockedPaperName(fallbackContact, load.driver_name ?? "") && looksLikePersonName(fallbackContact)
      ? fallbackContact
      : "");
  return {
    name: load.customer_name.trim(),
    billing: billingFromNotes,
    contact,
    phone: printableHeaderPhone(load),
    email: printableHeaderEmail(load, storedContact?.email ?? ""),
    reference: (load.customer_reference || load.reference_number || "").trim(),
  };
}

export function isCustomerFacingLoadNumber(
  load: Pick<LoadView, "load_number" | "customer_reference">,
  value: string,
): boolean {
  const text = value.trim();
  if (!text) return false;
  return text === String(load.load_number ?? "").trim() || text === String(load.customer_reference ?? "").trim();
}

export function driverFacingStopPo(
  stop: { reference?: string | null } | undefined,
  load: Pick<LoadView, "load_number" | "customer_reference">,
): string {
  const stopPo = stripPaperworkPrefix(String(stop?.reference ?? ""));
  if (!stopPo || isPaperworkJunk(stopPo) || isCustomerFacingLoadNumber(load, stopPo)) return "";
  return stopPo;
}

export function driverFacingStopConfirmation(
  stop: { confirmation?: string | null } | undefined,
  load: Pick<LoadView, "load_number" | "customer_reference">,
): string {
  const value = stripPaperworkPrefix(String(stop?.confirmation ?? ""));
  if (!value || isPaperworkJunk(value) || isCustomerFacingLoadNumber(load, value)) return "";
  return value;
}

export function driverSheetStopRefs(
  stop:
    | {
        reference?: string | null;
        confirmation?: string | null;
        notes?: string | null;
        instructions?: string | null;
        cargo?: string | null;
      }
    | undefined,
  load: Pick<LoadView, "load_number" | "customer_reference">,
): { poNumber: string; confirmationNumber: string; puNumber: string; quantity: string } {
  const blob = [stop?.reference, stop?.confirmation, stop?.notes, stop?.instructions, stop?.cargo]
    .filter(Boolean)
    .join("\n");
  const paper = parseStopPaperwork(blob);
  const puFromText = blob.match(/\bP\/?U\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "";
  const poFromText = blob.match(/\bPO\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "";
  const confFromText =
    blob.match(/\bCONF(?:IRMATION)?\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? paper.confirmation;
  let po = stripPaperworkPrefix(String(stop?.reference ?? ""));
  let conf = stripPaperworkPrefix(String(stop?.confirmation ?? ""));
  let pu = "";
  if (poFromText) po = poFromText;
  else if (puFromText && (!po || po === puFromText)) {
    po = "";
    pu = puFromText;
  }
  if (puFromText && po === puFromText && !poFromText) {
    po = "";
    pu = puFromText;
  } else if (puFromText && po !== puFromText) {
    pu = puFromText;
  }
  if (confFromText) conf = confFromText;
  if (!po && paper.reference && paper.reference !== puFromText) po = paper.reference;
  return {
    poNumber: driverFacingStopPo({ reference: po }, load),
    confirmationNumber: driverFacingStopConfirmation({ confirmation: conf }, load),
    puNumber: driverFacingStopConfirmation({ confirmation: pu }, load),
    quantity: String(stop?.cargo ?? "").trim() || paper.quantity,
  };
}

function stripCustomerLoadNumber(text: string, load: Pick<LoadView, "load_number" | "customer_reference">): string {
  const ref = String(load.customer_reference ?? "").trim();
  if (!ref || ref === String(load.load_number ?? "").trim()) return text;
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\bLoad\\s*(?:No\\.?|Number|#)\\s*${escaped}\\b`, "gi"), "")
    .replace(new RegExp(`\\b${escaped}\\b`, "g"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stopAppointmentLabel(
  stop: LoadStop | undefined,
  locationType: string,
  extra: string,
  loadNotes: string,
): string {
  if (isAppointmentSchedule(stop?.schedule_type)) return "Yes";
  if (/set\s+appt|appointment\s+required|strict\s+loading\s+appts/i.test(`${stop?.notes ?? ""} ${stop?.instructions ?? ""} ${extra}`)) {
    return "Yes";
  }
  if (isFcfsSchedule(stop?.schedule_type)) return "No";
  if (locationType === "appointment") return "Yes";
  if (locationType === "No") return "No";
  return appointmentLabel(loadNotes);
}

function confirmationStopTitle(kind: string | undefined, typeNumber: number): string {
  const n = typeNumber > 0 ? typeNumber : 1;
  if (kind === "delivery") return `Consignee ${n}`;
  return `Shipper ${n}`;
}

function confirmationStopFromParty(
  stop: LoadStop | undefined,
  all: LoadStop[],
  load: LoadView,
  fallbackLocationId: number | null,
  laneFallback: string,
  kindHint: "pickup" | "delivery" = "pickup",
  packet: "customer" | "internal" = "customer",
): ConfirmationStop {
  const party = confirmationParty(stop, fallbackLocationId, laneFallback, load.customer_name);
  const kind = stop?.kind ?? kindHint;
  const isPickup = kind === "pickup";
  const refs = driverSheetStopRefs(stop, load);
  return {
    title: confirmationStopTitle(kind, stop ? stopTypeNumber(all, stop.id) : 1),
    name: party.name,
    address: party.address,
    phone: party.phone,
    date: formatMdY(stop?.window_start || (isPickup ? load.pickup_start : load.delivery_start)),
    time: formatStopClock(stop, isPickup ? load.pickup_start : load.delivery_start),
    type: "",
    quantity: refs.quantity,
    weight: load.weight != null ? String(load.weight) : "",
    poNumber: refs.poNumber,
    confirmationNumber: refs.confirmationNumber,
    puNumber: refs.puNumber,
    extra: collapseRepeatedPhrases(stripPaperworkLabelsFromNotes(party.extra)),
    hoursLabel: isPickup ? "Shipping Hours" : "Receiving Hours",
    hours: party.hours,
    appointment: stopAppointmentLabel(stop, party.appointment, party.extra, load.appointment_notes),
    description: load.commodity,
  };
}

export function buildConfirmationModel(
  load: LoadView,
  company = getCompanyProfile(),
  options: { packet?: "customer" | "internal" } = {},
): ConfirmationModel {
  const packet = options.packet === "internal" ? "internal" : "customer";
  const stops = listStops(load.id);
  const pickup = stops.find((stop) => stop.kind === "pickup") ?? stops[0];
  const lastDelivery = [...stops].reverse().find((stop) => stop.kind === "delivery") ?? stops[stops.length - 1];
  const firstDelivery = stops.find((stop) => stop.kind === "delivery") ?? lastDelivery;
  const listedStops = stops.length
    ? stops.map((stop) => {
        const isFirstPickup = Boolean(pickup && stop.id === pickup.id);
        const isLastDelivery = Boolean(lastDelivery && stop.id === lastDelivery.id);
        return confirmationStopFromParty(
          stop,
          stops,
          load,
          isFirstPickup ? load.shipper_location_id : isLastDelivery ? load.consignee_location_id : stop.location_id,
          isFirstPickup ? load.origin : isLastDelivery ? load.destination : "",
          stop.kind,
          packet,
        );
      })
    : [
        confirmationStopFromParty(pickup, stops, load, load.shipper_location_id, load.origin, "pickup", packet),
        confirmationStopFromParty(
          lastDelivery,
          stops,
          load,
          load.consignee_location_id,
          load.destination,
          "delivery",
          packet,
        ),
      ];
  const shipper =
    listedStops.find((stop) => stop.title.startsWith("Shipper")) ??
    confirmationStopFromParty(pickup, stops, load, load.shipper_location_id, load.origin, "pickup", packet);
  const consignee =
    listedStops.find((stop) => stop.title === "Consignee 1") ??
    listedStops.find((stop) => stop.title.startsWith("Consignee")) ??
    confirmationStopFromParty(
      firstDelivery,
      stops,
      load,
      load.consignee_location_id,
      load.destination,
      "delivery",
      packet,
    );
  const style = isOwnerOperator(load.driver_type) ? "owner_operator" : "company_driver";
  const notes = [
    load.public_notes,
    expandTruncatedDispatchNotes(load.special_instructions),
    load.appointment_notes,
  ]
    .filter(Boolean)
    .join("\n");
  const dispatchNotes = collapseRepeatedPhrases(
    packet === "internal"
      ? stripCustomerLoadNumber(expandTruncatedDispatchNotes(joinUniqueNotes(notes)), load)
      : joinUniqueNotes(notes),
  );
  const trailer = load.trailer_id ? getTrailer(load.trailer_id) : null;
  const reefer = resolveReeferSpec({
    reefer_setpoint_f: load.reefer_setpoint_f ?? trailer?.reefer_setpoint_f ?? null,
    temperature_f: load.temperature_f,
    reefer_mode: load.reefer_mode,
    special_instructions: load.special_instructions,
    equipment: load.equipment || equipmentLabel(load),
    truck_type: load.truck_type,
    trailer_type: trailer?.type ?? load.trailer_type,
  });
  const customer = confirmationCustomer(load);
  const rateLines =
    packet === "customer"
      ? tmsCustomerInvoiceLines(load).map((line) => ({ name: line.name, amount: line.amount }))
      : [];
  const customerRate = rateLines.length ? rateLines.reduce((sum, line) => sum + line.amount, 0) : null;
  return {
    packet,
    style,
    company,
    loadNumber: load.load_number,
    shipDate: formatMdY(load.pickup_start),
    todayDate: formatMdY(new Date().toISOString()),
    carrierName: assignedLoadName(load),
    carrierPhone: load.driver_phone ?? "",
    driverName: load.driver_name ?? "",
    driverPhone: load.driver_phone ?? "",
    driverEmail: "",
    equipment: equipmentLabel(load),
    truckNumber: load.truck_unit ?? "",
    trailerNumber: load.trailer_unit || load.trailer_number || "",
    agreedAmount: packet === "internal" ? agreedAmountForLoad(load) : null,
    customerName: packet === "customer" ? customer.name : "",
    customerBilling: packet === "customer" ? customer.billing : "",
    customerContact: packet === "customer" ? customer.contact : "",
    customerPhone: packet === "customer" ? customer.phone : "",
    customerEmail: packet === "customer" ? customer.email : "",
    customerReference: packet === "customer" ? customer.reference : "",
    customerRate: packet === "customer" ? customerRate : null,
    customerRateLines: packet === "customer" ? rateLines : [],
    headerCompany: load.customer_name.trim(),
    headerDispatcher: printableHeaderDispatcher(load),
    headerPhone: printableHeaderPhone(load),
    headerEmail: printableHeaderEmail(load),
    loadStatus: "",
    shipper: { ...shipper, extra: stripNotesAlreadyPrinted(shipper.extra, dispatchNotes) },
    consignee: { ...consignee, extra: stripNotesAlreadyPrinted(consignee.extra, dispatchNotes) },
    stops: listedStops.map((stop) => ({
      ...stop,
      extra: stripNotesAlreadyPrinted(stop.extra, dispatchNotes),
    })),
    dispatchNotes,
    internalLegs: "",
    reeferSetpoint: reefer.setpointF != null ? formatReeferSetpoint(reefer.setpointF) : "",
    reeferMode: reefer.isReefer ? labelForReeferMode(reefer.mode) || "Continuous" : "",
  };
}

export function buildConfirmationForLoad(
  loadId: number,
  options: { packet?: "customer" | "internal"; driverId?: number; locale?: DriverMessageLocale } = {},
): ConfirmationModel {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const packet = options.packet === "internal" ? "internal" : "customer";
  const locale = packet === "internal" ? parseDriverMessageLocale(options.locale) : "en";
  const model = buildConfirmationModel(load, getCompanyProfile(), { packet });
  if (packet !== "internal") return { ...model, locale: "en" };
  const relays = listRelays(load.id);
  const yours = options.driverId ? relayForDriver(load.id, options.driverId) : null;
  const lines = [
    yours
      ? locale === "es"
        ? `Su tramo: ${formatRelayLane(yours.pickup, yours.delivery)}`
        : `Your leg: ${formatRelayLane(yours.pickup, yours.delivery)}`
      : "",
    formatInternalRelayLines(relays),
  ].filter(Boolean);
  if (locale === "es") {
    const translateTitle = (title: string) =>
      title.replace(/\bShipper\b/g, "Remitente").replace(/\bConsignee\b/g, "Consignatario");
    return {
      ...model,
      locale,
      internalLegs: lines.join("\n"),
      shipper: { ...model.shipper, title: translateTitle(model.shipper.title) },
      consignee: { ...model.consignee, title: translateTitle(model.consignee.title) },
      stops: model.stops.map((stop) => ({ ...stop, title: translateTitle(stop.title) })),
    };
  }
  return { ...model, internalLegs: lines.join("\n"), locale };
}

export function applyBlindConfirmation(model: ConfirmationModel): ConfirmationModel {
  const blindStop = (stop: ConfirmationStop): ConfirmationStop => ({
    ...stop,
    address: cityStateOnly(stop.address),
    phone: "",
  });
  return {
    ...model,
    shipper: blindStop(model.shipper),
    consignee: blindStop(model.consignee),
    stops: model.stops.map(blindStop),
    customerBilling: cityStateOnly(model.customerBilling),
    customerPhone: "",
    customerEmail: "",
  };
}

export async function renderConfirmationPdf(model: ConfirmationModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawConfirmation(doc, model);
    doc.end();
  });
}

function confirmLabel(model: ConfirmationModel, english: string, spanish: string): string {
  return model.locale === "es" && model.packet === "internal" ? spanish : english;
}

function confirmationTitle(model: ConfirmationModel, headerText: string): string {
  if (model.packet === "customer") {
    const custom = headerText.trim();
    if (custom && !/load confirmation|rate & load|driver confirmation/i.test(custom)) return custom;
    return "Customer Confirmation";
  }
  return confirmLabel(model, "Driver Confirmation", "Confirmación de conductor");
}

/** Wrap onto following lines/pages. Never pass a clipping height — live reprints were still cut that way. */
function wrapPdfLines(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const tokens = String(text).split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };
  const hardBreak = (token: string) => {
    let chunk = "";
    for (const ch of token) {
      const next = chunk + ch;
      if (chunk && doc.widthOfString(next) > width) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  };
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) continue;
    const trial = current ? `${current} ${token}` : token;
    if (doc.widthOfString(trial) <= width) {
      current = trial;
      continue;
    }
    if (current) flush();
    if (doc.widthOfString(token) <= width) current = token;
    else hardBreak(token);
  }
  flush();
  return lines.length ? lines : [""];
}

function drawFlowingText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  pageLimit: number,
  addPage: () => number,
): number {
  const lineH = Math.max(12, Number(doc.currentLineHeight(true)) + 1);
  for (const paragraph of String(text).replace(/\r\n/g, "\n").split("\n")) {
    for (const line of wrapPdfLines(doc, paragraph, width)) {
      if (y + lineH > pageLimit) y = addPage();
      doc.text(line, x, y, { width, lineBreak: false, ellipsis: false });
      y += lineH;
    }
  }
  return y;
}

function drawMsExpressWordmark(doc: PDFKit.PDFDocument, x: number, y: number, size = 16): void {
  doc.font("Helvetica-Bold").fontSize(size).fillColor(NAVY);
  doc.text("MS EXPRESS", x, y, { lineBreak: false });
}

function drawConfirmationLogo(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  fit: [number, number],
): boolean {
  const logo = companyLogoPath();
  if (logo) {
    try {
      doc.image(logo, x, y, { fit });
      return true;
    } catch {
      // Fall through to the navy wordmark when the raster file is missing or bad.
    }
  }
  drawMsExpressWordmark(doc, x, y + 6, Math.max(16, Math.min(22, fit[1] - 8)));
  return false;
}

function drawConfirmation(doc: PDFKit.PDFDocument, model: ConfirmationModel): void {
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const pageW = 612;
  const left = 36;
  const width = 540;
  const defaults = getDocumentDefaults(model.packet === "customer" ? "customer_confirmation" : "load_confirmation");
  doc.font("Helvetica");
  const title = confirmationTitle(model, defaults.header_text);
  const contactRows: Array<[string, string]> = (
    [
      [confirmLabel(model, "Contact", "Contacto"), model.headerCompany],
      [confirmLabel(model, "Dispatcher", "Despachador"), model.headerDispatcher],
      [confirmLabel(model, "Phone #", "Teléfono"), model.headerPhone],
      [confirmLabel(model, "Email", "Correo"), model.headerEmail],
      [confirmLabel(model, "LOAD #", "CARGA #"), model.loadNumber],
      [confirmLabel(model, "Ship Date", "Fecha de carga"), model.shipDate],
      [confirmLabel(model, "Today's Date", "Fecha de hoy"), model.todayDate],
    ] as Array<[string, string]>
  ).filter(([label, value]) => label === "LOAD #" || Boolean(value.trim()));

  drawConfirmationLogo(doc, left, 28, [140, 64]);

  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK);
  doc.text(title, 0, 36, { width: pageW, align: "center", lineBreak: false });

  const cardW = 258;
  const cardX = left + width - cardW;
  const cardY = 58;
  const cardH = drawContactCard(doc, cardX, cardY, cardW, contactRows);

  const nameWidth = Math.max(120, cardX - left - 10);
  const nameY = 96;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK);
  doc.text(model.company.company_name || "M&S Loads", left, nameY, { width: nameWidth, lineBreak: false });
  const address = formatCompanyAddress(getCompanySettings());
  if (address) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(address, left, nameY + 16, {
      width: nameWidth,
      lineBreak: true,
    });
  }

  let y = Math.max(148, cardY + cardH + 8);
  const pageLimit = 712;

  function addContentPage(): number {
    doc.addPage();
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    y = drawContinuationHeader(doc, model, title, left, width);
    return y;
  }

  function ensureSpace(needed: number) {
    if (y + needed <= pageLimit) return;
    addContentPage();
  }

  if (model.packet === "customer") {
    y = drawCustomerBlock(doc, left, y, width, model);
    y = drawCustomerRate(doc, left, y + 6, width, model);
    if (model.equipment.trim()) {
      y = drawPartyRow(doc, left, y + 6, width, [["Equipment", model.equipment]]);
    }
  } else if (model.style === "owner_operator") {
    y = drawPartyRow(doc, left, y, width, [
      [confirmLabel(model, "Carrier", "Transportista"), model.carrierName],
      [confirmLabel(model, "Phone #", "Teléfono"), model.carrierPhone],
      [confirmLabel(model, "Equipment", "Equipo"), model.equipment],
      [confirmLabel(model, "Agreed Amount", "Monto acordado"), formatUsd(model.agreedAmount)],
    ]);
  } else {
    y = drawPartyRow(doc, left, y, width, [
      [confirmLabel(model, "Driver", "Conductor"), model.driverName],
      [confirmLabel(model, "Mobile #", "Celular"), model.driverPhone],
      [confirmLabel(model, "Equipment", "Equipo"), model.equipment],
      [confirmLabel(model, "Truck #", "Camión #"), model.truckNumber],
      [confirmLabel(model, "Trailer #", "Remolque #"), model.trailerNumber],
    ]);
  }

  if (model.reeferSetpoint || model.reeferMode) {
    y = drawReeferBar(doc, left, y + 6, width, model.reeferSetpoint, model.reeferMode);
  }

  const stopBoxes = model.stops.length ? model.stops : [model.shipper, model.consignee];
  for (let index = 0; index < stopBoxes.length; index += 1) {
    const gap = index === 0 ? 8 : 6;
    const boxH = stopBoxHeight(doc, stopBoxes[index]);
    ensureSpace(gap + boxH);
    y = drawStop(doc, left, y + gap, width, stopBoxes[index], boxH);
  }

  y += 10;
  ensureSpace(28);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(confirmLabel(model, "DISPATCH NOTES", "NOTAS DE DESPACHO"), left, y, {
    lineBreak: false,
  });
  y += 14;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  y = drawFlowingText(doc, model.dispatchNotes || " ", left, y, width, pageLimit, addContentPage) + 8;

  if (model.packet === "internal" && model.internalLegs) {
    ensureSpace(36);
    doc.font("Helvetica-Bold").fontSize(8).text(confirmLabel(model, "Internal legs (not billed):", "Tramos internos:"), left, y, {
      lineBreak: false,
    });
    y += 14;
    doc.font("Helvetica").fontSize(10);
    y = drawFlowingText(doc, model.internalLegs, left, y, width, pageLimit, addContentPage) + 8;
  }

  if (model.packet === "internal" && model.style === "owner_operator") {
    ensureSpace(72);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Carrier Pay:", left, y, { lineBreak: false });
    y += 16;
    const haul = formatUsd(model.agreedAmount) || "$0.00 USD";
    doc.font("Helvetica-Bold").fontSize(11).text(`Line Haul: ${haul.replace(" USD", "")}   TOTAL: ${haul}`, left, y, {
      width,
      lineBreak: false,
    });
    y += 18;
    drawWriteLine(doc, left, y, 170, "Accepted By");
    drawWriteLine(doc, left + 186, y, 120, "Date");
    drawWriteLine(doc, left + 322, y, 218, "Signature");
    y += 22;
    drawWriteLine(doc, left, y, 150, "Driver Name", model.driverName);
    drawWriteLine(doc, left + 166, y, 120, "Cell #", model.driverPhone);
    drawWriteLine(doc, left + 302, y, 110, "Truck #", model.truckNumber);
    drawWriteLine(doc, left + 428, y, 112, "Trailer #", model.trailerNumber);
    y += 20;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    stampConfirmationFooter(doc, model, defaults, left, width, i + 1, range.count);
  }
}

function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  model: ConfirmationModel,
  title: string,
  left: number,
  width: number,
): number {
  drawConfirmationLogo(doc, left, 28, [64, 28]);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
  doc.text(title, left + 72, 32, { width: 280, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK);
  doc.text(model.loadNumber, left, 32, { width, align: "right", lineBreak: false });
  doc.moveTo(left, 60).lineTo(left + width, 60).strokeColor(INK).lineWidth(1).stroke();
  return 70;
}

function stampConfirmationFooter(
  doc: PDFKit.PDFDocument,
  model: ConfirmationModel,
  defaults: ReturnType<typeof getDocumentDefaults>,
  left: number,
  width: number,
  page: number,
  pageCount: number,
): void {
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const tagCtx = {
    orgName: model.company.company_name,
    userName: model.headerDispatcher || model.company.dispatcher_name,
    userEmail: model.headerEmail,
    userPhone: model.headerPhone || model.company.dispatcher_phone,
    loadId: model.loadNumber,
    customerName: model.customerName,
    customerPhone: model.customerPhone,
  };
  const rawTerms = expandDocumentTags(defaults.terms_text, tagCtx);
  const printedTerms =
    model.packet === "internal" ? driverFacingTermsText(rawTerms).trim() : rawTerms.trim();
  const isLast = page === pageCount;
  if (isLast && printedTerms) {
    doc.font("Helvetica").fontSize(8).fillColor(INK);
    doc.text(printedTerms, left, 716, { width, lineBreak: true });
  }
  const rawFooter = expandDocumentTags(defaults.footer_text, tagCtx).trim();
  const footer = model.packet === "internal" ? driverFacingTermsText(rawFooter) : rawFooter;
  doc.font("Helvetica").fontSize(8).fillColor(INK);
  const footerBits = [
    footer,
    model.packet === "customer" && !/questions\?\s*call dispatch/i.test(footer)
      ? "Questions? Call dispatch."
      : "",
  ].filter(Boolean);
  if (footerBits.length) {
    doc.text(footerBits.join("  "), left, 738, { width: width - 100, lineBreak: false });
  }
  doc.text(
    model.locale === "es" ? `Página ${page} de ${pageCount}` : `Page ${page} of ${pageCount}`,
    left,
    752,
    { width, align: "center", lineBreak: false },
  );
}

function drawCustomerBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  model: ConfirmationModel,
): number {
  const fields: Array<[string, string]> = [
    ["Customer", model.customerName],
    ["Billing", model.customerBilling],
    ["Contact", model.customerContact],
    ["Phone", model.customerPhone],
    ["Email", model.customerEmail],
    ["Reference #", model.customerReference],
  ];
  const rows = fields.filter(([, value]) => value.trim());
  if (!rows.length) {
    rows.push(["Customer", model.customerName || " "]);
  }
  const rowH = 16;
  const height = rows.length * rowH + 10;
  doc.rect(x, y, width, height).strokeColor(INK).lineWidth(1).stroke();
  rows.forEach(([label, value], index) => {
    kv(doc, x + 6, y + 6 + index * rowH, 88, width - 16, label, value, true);
  });
  return y + height;
}

function drawCustomerRate(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  model: ConfirmationModel,
): number {
  const lines = model.customerRateLines.length
    ? model.customerRateLines
    : model.customerRate != null
      ? [{ name: "Flat Rate", amount: model.customerRate }]
      : [];
  const rowH = 16;
  const height = Math.max(36, 22 + lines.length * rowH + 16);
  doc.rect(x, y, width, height).strokeColor(INK).lineWidth(1).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text("RATE", x + 6, y + 6, {
    lineBreak: false,
  });
  if (!lines.length) {
    doc.font("Helvetica-Bold").fontSize(11).text(" ", x + 6, y + 22);
    return y + height;
  }
  lines.forEach((line, index) => {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
    doc.text(line.name, x + 6, y + 22 + index * rowH, { width: width - 140, lineBreak: false });
    doc.text(formatUsd(line.amount), x + width - 140, y + 22 + index * rowH, {
      width: 130,
      align: "right",
      lineBreak: false,
    });
  });
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("Total", x + 6, y + 22 + lines.length * rowH, { width: width - 140, lineBreak: false });
  doc.text(formatUsd(model.customerRate), x + width - 140, y + 22 + lines.length * rowH, {
    width: 130,
    align: "right",
    lineBreak: false,
  });
  return y + height;
}

function drawContactCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>,
): number {
  const valueW = width - 88;
  const heights = rows.map(([label, value]) => {
    const loadRow = /load\s*#|carga\s*#/i.test(label);
    doc.font("Helvetica-Bold").fontSize(loadRow ? 14 : 11);
    return Math.max(16, Math.ceil(doc.heightOfString(value || " ", { width: valueW })) + 2);
  });
  const height = heights.reduce((sum, h) => sum + h, 0) + 8;
  doc.rect(x, y, width, height).strokeColor(INK).lineWidth(1).stroke();
  let rowY = y + 4;
  rows.forEach(([label, value], index) => {
    const loadRow = /load\s*#|carga\s*#/i.test(label);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    doc.text(`${label}:`, x + 6, rowY, { width: 72, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(loadRow ? 14 : 11).fillColor(INK);
    doc.text(value || " ", x + 80, rowY, { width: valueW });
    rowY += heights[index];
  });
  return height;
}

function drawPartyRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  cells: Array<[string, string]>,
): number {
  const col = width / cells.length;
  const headerH = 16;
  const valueH = 24;
  cells.forEach(([label], index) => {
    doc.rect(x + index * col, y, col, headerH + valueH).strokeColor(INK).lineWidth(1).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    doc.text(label.toUpperCase(), x + index * col + 4, y + 3, { width: col - 8, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(cells[index][1] || " ", x + index * col + 4, y + headerH + 4, {
      width: col - 8,
      lineBreak: false,
    });
  });
  return y + headerH + valueH;
}

function drawReeferBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  setpoint: string,
  mode: string,
): number {
  const height = 22;
  doc.save();
  doc.rect(x, y, width, height).fill(NAVY);
  doc.restore();
  const temp = setpoint.trim();
  const modeLabel = mode.trim() ? mode.trim().toUpperCase() : "";
  const line = ["REEFER", temp, modeLabel].filter(Boolean).join("    ");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff");
  doc.text(line, x + 8, y + 5, { width: width - 16, lineBreak: false });
  return y + height;
}

function stopBoxHeight(doc: PDFKit.PDFDocument, stop: ConfirmationStop): number {
  const extra = stop.extra.trim();
  if (!extra) return 102;
  doc.font("Helvetica").fontSize(10);
  const extraH = doc.heightOfString(extra, { width: 528 });
  return 102 + Math.max(14, extraH + 4);
}

function drawStop(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  stop: ConfirmationStop,
  height = 102,
): number {
  doc.rect(x, y, width, height).strokeColor(INK).lineWidth(1).stroke();
  const leftW = 214;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(stop.title, x + 6, y + 5, {
    width: leftW - 8,
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(12).text(stop.name || " ", x + 6, y + 19, {
    width: leftW - 8,
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(stop.address || " ", x + 6, y + 34, { width: leftW - 8, lineBreak: true });
  if (stop.phone) {
    doc.font("Helvetica-Bold").fontSize(11).text(stop.phone, x + 6, y + 58, { width: leftW - 8, lineBreak: false });
  }
  if (stop.hours.trim()) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    doc.text(`${stop.hoursLabel}:`, x + 6, y + 70, { width: leftW - 8, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(stop.hours, x + 6, y + 80, { width: leftW - 8, lineBreak: false });
  }

  const gridX = x + leftW;
  const colW = (width - leftW) / 2;
  const rows: Array<[string, string]> = [
    ["Date", stop.date],
    ["Time", stop.time],
    ["Quantity", stop.quantity],
    ["Weight", stop.weight ? `${stop.weight} lbs` : ""],
    ["Appointment", stop.appointment],
    ["Purchase Order #", stop.poNumber],
    ["Confirmation number", stop.confirmationNumber],
    ...(stop.puNumber ? ([["PU #", stop.puNumber]] as Array<[string, string]>) : []),
    ["Description", stop.description],
  ];
  rows.forEach(([label, value], index) => {
    const col = index < 5 ? 0 : 1;
    const row = index < 5 ? index : index - 5;
    kv(doc, gridX + col * colW, y + 8 + row * 16, 88, colW - 6, label, value, true);
  });
  if (stop.extra.trim()) {
    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(stop.extra, x + 6, y + 86, { width: width - 12, lineBreak: true });
  }
  return y + height;
}

function kv(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  labelW: number,
  width: number,
  label: string,
  value: string,
  emphasize = false,
): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(`${label}:`, x, y, {
    width: labelW,
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
  doc.text(value || " ", x + labelW, y - 1, {
    width: Math.max(36, width - labelW),
    lineBreak: false,
  });
}

function drawWriteLine(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value = "",
): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(`${label}:`, x, y);
  const labelW = doc.widthOfString(`${label}: `);
  doc.moveTo(x + labelW, y + 10).lineTo(x + width, y + 10).strokeColor(INK).lineWidth(1).stroke();
  if (value) {
    doc.font("Helvetica-Bold").fontSize(11).text(value, x + labelW + 2, y - 1, { width: width - labelW - 4 });
  }
}
