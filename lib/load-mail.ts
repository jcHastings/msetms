import { agreedAmountForLoad, buildConfirmationForLoad, formatUsd, renderConfirmationPdf } from "./load-confirmation";
import { formatMdYDisplay, formatStopWindow } from "./format";
import { getLocationForLoad } from "./integrations/samsara";
import { sendMail } from "./integrations/mail";
import { formatStopPartyAddress } from "./locations";
import { lastSentMail, recordSentMail } from "./mail-store";
import { isUsableEmail, normalizeEmail, type LoadMailKind, type SentMailRow } from "./mail-shared";
import { getCustomer, getDriver, getLoad } from "./queries";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { routeGuideFromLoad } from "./routing-shared";
import { listStops } from "./stops";
import { stopTypeLabel, stopTypeNumber, type LoadStop } from "./stops-shared";
import { isOwnerOperator, labelForLoadStatus, type LoadView } from "./types";

export type DriverLoadMailDraft = {
  to: string;
  subject: string;
  text: string;
};

export type CustomerUpdateMailDraft = {
  to: string;
  subject: string;
  text: string;
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
    "M & S Loads LLC · MS Express TMS",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  return {
    to: "",
    subject: `Load ${input.loadNumber} — trip information`,
    text: lines.join("\n").trim() + "\n",
  };
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
}): CustomerUpdateMailDraft {
  const lines = [
    `Load ${input.loadNumber}`,
    input.customerRef ? `Your ref ${input.customerRef}` : "",
    input.status ? `Status ${input.status}` : "",
    input.truck ? `Truck ${input.truck}` : "",
    input.trailer ? `Trailer ${input.trailer}` : "",
    `Last location ${input.lastLocation || "not on file"}`,
    input.eta ? `ETA ${input.eta}` : "",
    input.nextStop ? `Next stop ${input.nextStop}` : "",
    "",
    "M & S Loads LLC · MS Express TMS",
  ].filter(Boolean);
  return {
    to: "",
    subject: `Load ${input.loadNumber} — tracking update`,
    text: lines.join("\n").trim() + "\n",
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
    refs: [load.reference_number, load.po_number, load.customer_reference].filter(Boolean).join(" · "),
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
  });
  return { ...draft, to: resolveLoadDriverEmail(load) };
}

export async function buildCustomerUpdateDraft(load: LoadView): Promise<CustomerUpdateMailDraft> {
  const location = await getLocationForLoad(load.id);
  const lastLocation = location?.address?.trim() || "";
  const guide = routeGuideFromLoad(load);
  const eta =
    guide.totalMiles != null
      ? `${guide.totalMiles.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi on file${
          guide.calculatedAt ? ` · ${formatMdYDisplay(guide.calculatedAt)}` : ""
        }`
      : "";
  const draft = composeCustomerUpdateEmail({
    loadNumber: load.load_number,
    customerRef: (load.customer_reference || load.po_number || load.reference_number || "").trim(),
    status: labelForLoadStatus(load.status),
    truck: (load.truck_unit || "").trim(),
    trailer: (load.trailer_unit || load.trailer_number || "").trim(),
    lastLocation,
    eta,
    nextStop: nextOpenStopLabel(listStops(load.id)),
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
  await send({ to: draft.to, subject: draft.subject, text: draft.text });
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

function nextOpenStopLabel(stops: LoadStop[]): string {
  const open = stops.find((stop) => !stop.departed_at.trim());
  if (!open) return "";
  const title = stopTypeLabel(open.kind, stopTypeNumber(stops, open.id));
  const city = [open.city, open.state].filter(Boolean).join(", ");
  return city ? `${title} · ${city}` : title;
}
