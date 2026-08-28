import { agreedAmountForLoad, buildConfirmationForLoad, formatUsd, renderConfirmationPdf } from "./load-confirmation";
import { formatStopWindow } from "./format";
import { getLocationForLoad } from "./integrations/samsara";
import { sendMail } from "./integrations/mail";
import { formatStopPartyAddress } from "./locations";
import { lastSentMail, recordSentMail } from "./mail-store";
import { getCompanyProfile } from "./company";
import { isUsableEmail, MAIL_NOREPLY, normalizeEmail, type LoadMailKind, type SentMailRow } from "./mail-shared";
import { getCustomer, getDriver, getLoad } from "./queries";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { listStops } from "./stops";
import { stopIsDelivered, stopTypeLabel, stopTypeNumber, type LoadStop } from "./stops-shared";
import { isOwnerOperator, labelForLoadStatus, type LoadView } from "./types";

export type DriverLoadMailDraft = {
  to: string;
  subject: string;
  text: string;
  replyTo: string;
};

export type CustomerUpdateMailDraft = {
  to: string;
  subject: string;
  text: string;
  replyTo: string;
};

export function resolveLoadDriverEmail(load: Pick<LoadView, "driver_id">): string {
  if (!load.driver_id) return "";
  return normalizeEmail(getDriver(load.driver_id)?.email);
}

export function resolveLoadCustomerEmail(load: Pick<LoadView, "contact_email" | "customer_id">): string {
  const onLoad = normalizeEmail(load.contact_email);
  if (isUsableEmail(onLoad)) return onLoad;
  const customer = getCustomer(load.customer_id);
  const fromContact = customer?.contacts.map((row) => normalizeEmail(row.email)).find((email) => isUsableEmail(email));
  return fromContact ?? "";
}

export function driverMailBlockReason(load: LoadView | null): string {
  if (!load) return "Load not found.";
  if (!load.driver_id) return "Assign a driver first.";
  if (!isUsableEmail(resolveLoadDriverEmail(load))) return "This driver has no email on the driver record.";
  return "";
}

export function customerMailBlockReason(load: LoadView | null): string {
  if (!load) return "Load not found.";
  if (!isUsableEmail(resolveLoadCustomerEmail(load))) return "This load has no customer email.";
  return "";
}

export function mailNoReplyLine(officePhone = ""): string {
  const phone = officePhone.trim();
  return phone
    ? `Do not reply. This mailbox is not monitored. Call the office at ${phone} if you need something.`
    : "Do not reply. This mailbox is not monitored. Call the office if you need something.";
}

export function composeDriverLoadEmail(input: {
  loadNumber: string;
  stops: Array<{
    title: string;
    address: string;
    window: string;
    appointment: string;
    reference: string;
  }>;
  refs: string;
  commodity: string;
  trailer: string;
  reefer: string;
  specialInstructions: string;
  settlement: string;
  officePhone?: string;
}): DriverLoadMailDraft {
  const lines = [
    `Load ${input.loadNumber}`,
    "",
    ...input.stops.flatMap((stop) => [
      stop.title,
      stop.address,
      stop.window ? `Window ${stop.window}` : "",
      stop.appointment ? `Appointment ${stop.appointment}` : "",
      stop.reference ? `Ref ${stop.reference}` : "",
      "",
    ]),
    input.refs ? `Refs ${input.refs}` : "",
    input.commodity ? `Commodity ${input.commodity}` : "",
    input.trailer ? `Trailer ${input.trailer}` : "",
    input.reefer ? `Reefer ${input.reefer}` : "",
    input.specialInstructions ? `Special instructions: ${input.specialInstructions}` : "",
    input.settlement ? `Settlement ${input.settlement}` : "",
    "",
    mailNoReplyLine(input.officePhone),
    "",
    "M & S Loads LLC · MS Express TMS",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  return {
    to: "",
    subject: `Load ${input.loadNumber} — trip information`,
    text: lines.join("\n").trim() + "\n",
    replyTo: MAIL_NOREPLY,
  };
}

export function customerFacingLoadNumber(load: {
  load_number: string;
  customer_reference?: string | null;
  po_number?: string | null;
  reference_number?: string | null;
}): string {
  const internal = load.load_number.trim();
  const picks = [load.customer_reference, load.po_number, load.reference_number]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return picks.find((value) => value !== internal) || picks.find((value) => value === internal) || "";
}

export function cityStateFromAddress(address: string): string {
  const parts = String(address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1] ?? "";
  const lastStateZip = last.match(/^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (lastStateZip && parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${lastStateZip[1].toUpperCase()}`;
  }
  if (parts.length >= 3 && /^\d{5}(?:-\d{4})?$/.test(last)) {
    const state = parts[parts.length - 2] ?? "";
    if (/^[A-Za-z]{2}$/.test(state)) {
      return `${parts[parts.length - 3]}, ${state.toUpperCase()}`;
    }
  }
  if (parts.length === 2 && /^[A-Za-z]{2}$/.test(last)) {
    return `${parts[0]}, ${last.toUpperCase()}`;
  }
  return parts.join(", ");
}

function isClockEta(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/\bmi\b|on file|leftover/i.test(text)) return false;
  return /\d/.test(text);
}

export function composeCustomerUpdateEmail(input: {
  loadNumber: string;
  customerRef: string;
  status: string;
  truck: string;
  trailer: string;
  lastLocation: string;
  eta: string;
  nextStop: string;
  stops?: Array<{ title: string; place: string; delivered?: boolean }>;
  officePhone?: string;
}): CustomerUpdateMailDraft {
  const shown = input.loadNumber.trim();
  const extraRef = input.customerRef.trim();
  const places = (input.stops ?? []).filter((stop) => stop.place.trim());
  const pickups = places.filter((stop) => /^pickup/i.test(stop.title));
  const deliveries = places.filter((stop) => /^delivery/i.test(stop.title));
  const stopLine = (stop: { title: string; place: string; delivered?: boolean }) => {
    if (!stop.delivered) return stop.place;
    return /^pickup/i.test(stop.title) ? `${stop.place} · Picked up` : `${stop.place} · Delivered`;
  };
  const pickupDone = pickups.some((stop) => stop.delivered);
  const loadDelivered = deliveries.length > 0 && deliveries.every((stop) => stop.delivered);
  const location = cityStateFromAddress(input.lastLocation);
  const header = [
    shown ? `Load ${shown}` : "Tracking update",
    extraRef && extraRef !== shown ? `Your ref: ${extraRef}` : "",
    input.status ? `Status: ${input.status}` : "",
    pickupDone ? "The load was picked up." : "",
    loadDelivered ? "The load was delivered." : "",
  ].filter(Boolean);
  const assets = [
    input.truck ? `Truck: ${input.truck}` : "",
    input.trailer ? `Trailer: ${input.trailer}` : "",
  ].filter(Boolean);
  const blocks = [
    header.join("\n"),
    assets.join("\n"),
    location ? `Last location: ${location}` : "",
    input.eta && isClockEta(input.eta) ? `ETA: ${input.eta}` : "",
    pickups.length ? ["Pickup", ...pickups.map((stop) => stopLine(stop))].join("\n") : "",
    deliveries.length
      ? ["Deliveries", ...deliveries.map((stop, index) => `${index + 1}. ${stopLine(stop)}`)].join("\n")
      : "",
    mailNoReplyLine(input.officePhone),
    "M & S Loads LLC · MS Express TMS",
  ].filter(Boolean);
  return {
    to: "",
    subject: shown ? `Load ${shown} — tracking update` : "Tracking update",
    text: `${blocks.join("\n\n").trim()}\n`,
    replyTo: MAIL_NOREPLY,
  };
}

export function buildDriverLoadDraft(load: LoadView): DriverLoadMailDraft {
  const stops = listStops(load.id);
  const reefer = resolveReeferSpec(load);
  const settlement =
    isOwnerOperator(load.driver_type) && agreedAmountForLoad(load) != null
      ? formatUsd(agreedAmountForLoad(load))
      : "";
  const draft = composeDriverLoadEmail({
    loadNumber: load.load_number,
    stops: stops.map((stop) => mailStopLines(stops, stop)),
    refs: "",
    commodity: load.commodity.trim(),
    trailer: (load.trailer_unit || load.trailer_number || "").trim(),
    reefer:
      reefer.setpointF != null
        ? `${formatReeferSetpoint(reefer.setpointF)} · ${labelForReeferMode(reefer.mode) || "Continuous"}`
        : reefer.isReefer
          ? labelForReeferMode(reefer.mode) || "Continuous"
          : "",
    specialInstructions: load.special_instructions.trim(),
    settlement,
    officePhone: getCompanyProfile().dispatcher_phone,
  });
  return { ...draft, to: resolveLoadDriverEmail(load) };
}

export async function buildCustomerUpdateDraft(load: LoadView): Promise<CustomerUpdateMailDraft> {
  const location = await getLocationForLoad(load.id);
  const lastLocation = cityStateFromAddress(location?.address?.trim() || "");
  const shown = customerFacingLoadNumber(load);
  const stops = listStops(load.id);
  const draft = composeCustomerUpdateEmail({
    loadNumber: shown,
    customerRef: shown,
    status: labelForLoadStatus(load.status),
    truck: (load.truck_unit || "").trim(),
    trailer: (load.trailer_unit || load.trailer_number || "").trim(),
    lastLocation,
    eta: "",
    nextStop: "",
    stops: customerMailStops(stops),
    officePhone: getCompanyProfile().dispatcher_phone,
  });
  return { ...draft, to: resolveLoadCustomerEmail(load) };
}

export async function sendDriverLoadMail(
  loadId: number,
  send: typeof sendMail = sendMail,
): Promise<{ to: string; subject: string }> {
  const load = getLoad(loadId);
  const blocked = driverMailBlockReason(load);
  if (!load || blocked) throw new Error(blocked || "Load not found.");
  const draft = buildDriverLoadDraft(load);
  const pdf = await renderConfirmationPdf(buildConfirmationForLoad(load.id, { packet: "internal" }));
  await send({
    to: draft.to,
    subject: draft.subject,
    text: draft.text,
    replyTo: draft.replyTo || MAIL_NOREPLY,
    attachments: [
      {
        filename: `${load.load_number}-driver-packet.pdf`,
        contentType: "application/pdf",
        content: pdf,
      },
    ],
  });
  recordSentMail({ loadId, kind: "driver_load", to: draft.to, subject: draft.subject });
  return { to: draft.to, subject: draft.subject };
}

export async function sendCustomerUpdateMail(
  loadId: number,
  send: typeof sendMail = sendMail,
): Promise<{ to: string; subject: string }> {
  const load = getLoad(loadId);
  const blocked = customerMailBlockReason(load);
  if (!load || blocked) throw new Error(blocked || "Load not found.");
  const draft = await buildCustomerUpdateDraft(load);
  await send({
    to: draft.to,
    subject: draft.subject,
    text: draft.text,
    replyTo: draft.replyTo || MAIL_NOREPLY,
  });
  recordSentMail({ loadId, kind: "customer_update", to: draft.to, subject: draft.subject });
  return { to: draft.to, subject: draft.subject };
}

export function lastLoadMail(loadId: number, kind: LoadMailKind): SentMailRow | null {
  return lastSentMail(loadId, kind);
}

function mailStopLines(
  stops: LoadStop[],
  stop: LoadStop,
): {
  title: string;
  address: string;
  window: string;
  appointment: string;
  reference: string;
} {
  const title = stopTypeLabel(stop.kind, stopTypeNumber(stops, stop.id));
  const address = [
    stop.name.trim(),
    formatStopPartyAddress(stop).replace(/\n/g, ", "),
  ]
    .filter(Boolean)
    .join(" — ");
  const window = formatStopWindow(stop.window_start, stop.window_end, stop.schedule_type);
  return {
    title,
    address,
    window,
    appointment: stop.confirmation.trim() || stop.notes.trim(),
    reference: stop.reference.trim(),
  };
}

function customerStopPlace(stop: LoadStop): string {
  const name = stop.name.trim();
  const city = stop.city.trim();
  const cityState = [city, stop.state.trim()].filter(Boolean).join(", ");
  if (name && cityState) {
    if (name.toLowerCase() === city.toLowerCase() || name.toLowerCase() === cityState.toLowerCase()) {
      return cityState;
    }
    return `${name}, ${cityState}`;
  }
  return name || cityState;
}

function customerMailStops(stops: LoadStop[]): Array<{ title: string; place: string; delivered: boolean }> {
  const lines: Array<{ title: string; place: string; delivered: boolean }> = [];
  const pickups = stops.filter((stop) => stop.kind === "pickup");
  const firstPickup = pickups[0];
  if (firstPickup) {
    lines.push({
      title: stopTypeLabel(firstPickup.kind, 1),
      place: customerStopPlace(firstPickup),
      delivered: stopIsDelivered(firstPickup),
    });
  }
  const deliveries = stops.filter((stop) => stop.kind === "delivery");
  deliveries.forEach((stop, index) => {
    lines.push({
      title: stopTypeLabel(stop.kind, index + 1),
      place: customerStopPlace(stop),
      delivered: stopIsDelivered(stop),
    });
  });
  return lines;
}
