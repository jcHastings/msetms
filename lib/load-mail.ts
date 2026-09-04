import fs from "node:fs";
import path from "node:path";
import { agreedAmountForLoad, buildConfirmationForLoad, formatUsd, renderConfirmationPdf } from "./load-confirmation";
import { formatInvoiceMoney, formatStopWindow } from "./format";
import { getAttachment, getAttachmentPath, guessMime, listAttachments, sanitizeName } from "./files";
import { getLocationForLoad } from "./integrations/samsara";
import { sendMail } from "./integrations/mail";
import { buildTmsInvoice, createTmsInvoice } from "./invoice";
import { formatStopPartyAddress } from "./locations";
import { lastSentMail, recordSentMail } from "./mail-store";
import { getCompanyProfile } from "./company";
import { fillInvoiceEmailBody } from "./invoice-email-shared";
import { getInvoiceEmailBody } from "./settings";
import {
  invoiceFromAddress,
  isUsableEmail,
  MAIL_NOREPLY,
  normalizeEmail,
  type LoadMailKind,
  type OutgoingMail,
  type SentMailRow,
} from "./mail-shared";
import { getCustomer, getDriver, getLoad } from "./queries";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";
import { listStops } from "./stops";
import { stopIsDelivered, stopTypeLabel, stopTypeNumber, type LoadStop } from "./stops-shared";
import { isOwnerOperator, labelForAttachmentKind, labelForLoadStatus, type LoadView } from "./types";
import {
  driverLoadGreeting,
  parseDriverMessageLocale,
  type DriverMessageLocale,
} from "./load-summary";

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

export type CustomerInvoiceMailDraft = {
  to: string;
  from: string;
  subject: string;
  text: string;
  replyTo: string;
};

export type InvoiceMailExtraDoc = {
  id: number;
  name: string;
  kind: string;
  kindLabel: string;
};

export function resolveLoadDriverEmail(load: Pick<LoadView, "driver_id">): string {
  if (!load.driver_id) return "";
  return normalizeEmail(getDriver(load.driver_id)?.email);
}

export function resolveCustomerMainEmail(customerId: number): string {
  const customer = getCustomer(customerId);
  const main = normalizeEmail(customer?.main_email);
  if (isUsableEmail(main)) return main;
  const fromContact = customer?.contacts.map((row) => normalizeEmail(row.email)).find((email) => isUsableEmail(email));
  return fromContact ?? "";
}

export function resolveCustomerBillingEmail(customerId: number): string {
  const customer = getCustomer(customerId);
  return isUsableEmail(customer?.billing_email) ? normalizeEmail(customer?.billing_email) : "";
}

export function resolveLoadPerLoadEmail(load: Pick<LoadView, "contact_email">): string {
  const onLoad = normalizeEmail(load.contact_email);
  return isUsableEmail(onLoad) ? onLoad : "";
}

/** Email customer update / load comms: per-load broker email, else customer main. Never billing-only. */
export function resolveLoadCustomerEmail(load: Pick<LoadView, "contact_email" | "customer_id">): string {
  const perLoad = resolveLoadPerLoadEmail(load);
  if (perLoad) return perLoad;
  return resolveCustomerMainEmail(load.customer_id);
}

/** Invoice send: billing, else main. Never the per-load broker address. */
export function resolveInvoiceCustomerEmail(load: Pick<LoadView, "customer_id">): string {
  const billing = resolveCustomerBillingEmail(load.customer_id);
  if (billing) return billing;
  return resolveCustomerMainEmail(load.customer_id);
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

export function mailNoReplyLine(officePhone = "", locale: DriverMessageLocale = "en"): string {
  const phone = officePhone.trim();
  if (locale === "es") {
    return phone
      ? `No responda. Este correo no se revisa. Llame a la oficina al ${phone} si necesita más ayuda.`
      : "No responda. Este correo no se revisa. Llame a la oficina si necesita más ayuda.";
  }
  return phone
    ? `Do not reply. This mailbox is not monitored. Call the office at ${phone} if you need further assistance.`
    : "Do not reply. This mailbox is not monitored. Call the office if you need further assistance.";
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
  locale?: DriverMessageLocale;
  driverName?: string | null;
  now?: Date;
}): DriverLoadMailDraft {
  const locale = input.locale === "es" ? "es" : "en";
  const copy =
    locale === "es"
      ? {
          load: "Carga",
          window: "Ventana",
          appointment: "Cita",
          ref: "Ref",
          refs: "Refs",
          commodity: "Commodity",
          trailer: "Remolque",
          reefer: "Reefer",
          special: "Instrucciones especiales",
          settlement: "Liquidación",
          subject: `Carga ${input.loadNumber} — información del viaje`,
        }
      : {
          load: "Load",
          window: "Window",
          appointment: "Appointment",
          ref: "Ref",
          refs: "Refs",
          commodity: "Commodity",
          trailer: "Trailer",
          reefer: "Reefer",
          special: "Special instructions",
          settlement: "Settlement",
          subject: `Load ${input.loadNumber} — trip information`,
        };
  const greeting = driverLoadGreeting({
    locale,
    driverName: input.driverName,
    now: input.now,
  });
  const lines = [
    greeting,
    "",
    `${copy.load} ${input.loadNumber}`,
    "",
    ...input.stops.flatMap((stop) => [
      stop.title,
      stop.address,
      stop.window ? `${copy.window} ${stop.window}` : "",
      stop.appointment ? `${copy.appointment} ${stop.appointment}` : "",
      stop.reference ? `${copy.ref} ${stop.reference}` : "",
      "",
    ]),
    input.refs ? `${copy.refs} ${input.refs}` : "",
    input.commodity ? `${copy.commodity} ${input.commodity}` : "",
    input.trailer ? `${copy.trailer} ${input.trailer}` : "",
    input.reefer ? `${copy.reefer} ${input.reefer}` : "",
    input.specialInstructions ? `${copy.special}: ${input.specialInstructions}` : "",
    input.settlement ? `${copy.settlement} ${input.settlement}` : "",
    "",
    mailNoReplyLine(input.officePhone, locale),
    "",
    "M & S Loads LLC · MS Express TMS",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  return {
    to: "",
    subject: copy.subject,
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

export function buildDriverLoadDraft(
  load: LoadView,
  options: { locale?: DriverMessageLocale; now?: Date } = {},
): DriverLoadMailDraft {
  const locale = parseDriverMessageLocale(options.locale);
  const stops = listStops(load.id);
  const reefer = resolveReeferSpec(load);
  const settlement =
    isOwnerOperator(load.driver_type) && agreedAmountForLoad(load) != null
      ? formatUsd(agreedAmountForLoad(load))
      : "";
  const draft = composeDriverLoadEmail({
    loadNumber: load.load_number,
    stops: stops.map((stop) => mailStopLines(stops, stop, locale)),
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
    locale,
    driverName: load.driver_name,
    now: options.now,
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
  options: { locale?: DriverMessageLocale } = {},
): Promise<{ to: string; subject: string }> {
  const load = getLoad(loadId);
  const blocked = driverMailBlockReason(load);
  if (!load || blocked) throw new Error(blocked || "Load not found.");
  const locale = parseDriverMessageLocale(options.locale);
  const draft = buildDriverLoadDraft(load, { locale });
  const pdf = await renderConfirmationPdf(buildConfirmationForLoad(load.id, { packet: "internal", locale }));
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

export function invoiceMailExtraDocs(loadId: number): InvoiceMailExtraDoc[] {
  return listAttachments(loadId)
    .filter((file) => file.kind !== "invoice")
    .map((file) => ({
      id: file.id,
      name: file.original_name,
      kind: file.kind,
      kindLabel: labelForAttachmentKind(file.kind),
    }));
}

function uniqueMailFilename(name: string, used: Set<string>): string {
  const safe = sanitizeName(name);
  const key = safe.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return safe;
  }
  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next.toLowerCase())) {
    n += 1;
    next = `${stem}-${n}${ext}`;
  }
  used.add(next.toLowerCase());
  return next;
}

export function mailFilesForLoadDocs(loadId: number, ids: number[]): Array<{
  filename: string;
  contentType: string;
  content: Buffer;
  label: string;
}> {
  const extras = invoiceMailExtraDocs(loadId);
  const byId = new Map(extras.map((row) => [row.id, row]));
  const used = new Set<string>();
  return ids.map((id) => {
    const extra = byId.get(id);
    const file = getAttachment(id);
    if (!extra || !file || file.load_id !== loadId || file.kind === "invoice") {
      throw new Error("That document is not on this load.");
    }
    const stored = getAttachmentPath(file);
    if (!fs.existsSync(stored)) throw new Error(`${file.original_name} is missing.`);
    return {
      filename: uniqueMailFilename(file.original_name, used),
      contentType: file.mime_type || guessMime(file.original_name),
      content: fs.readFileSync(stored),
      label: extra.kindLabel,
    };
  });
}

export function composeCustomerInvoiceEmail(input: {
  invoiceNumber: string;
  loadNumber: string;
  customerName?: string;
  totalLabel?: string;
  extraLabels?: string[];
  body?: string;
  officePhone?: string;
}): CustomerInvoiceMailDraft {
  const invoiceNumber = input.invoiceNumber.trim();
  const loadNumber = input.loadNumber.trim();
  const from = invoiceFromAddress();
  const extras = (input.extraLabels ?? []).map((label) => label.trim()).filter(Boolean);
  const subject = invoiceNumber
    ? `Invoice ${invoiceNumber}${loadNumber ? ` — Load ${loadNumber}` : ""}`
    : loadNumber
      ? `Invoice — Load ${loadNumber}`
      : "Invoice";
  const letter = fillInvoiceEmailBody(input.body ?? "", {
    orgName: "M & S Loads LLC",
    customerName: input.customerName,
    loadId: loadNumber,
    invoiceNumber,
    invoiceTotal: input.totalLabel,
    userEmail: from,
    userPhone: input.officePhone,
  }).trim();
  const lines = letter
    ? [
        letter,
        extras.length ? `Also attached: ${extras.join(", ")}.` : "",
        "Questions? Reply to this email.",
        "",
        "M & S Loads LLC · Accounts Receivable",
      ]
    : [
        invoiceNumber && loadNumber
          ? `Invoice ${invoiceNumber} for load ${loadNumber}.`
          : invoiceNumber
            ? `Invoice ${invoiceNumber}.`
            : loadNumber
              ? `Invoice for load ${loadNumber}.`
              : "Invoice attached.",
        input.customerName?.trim() ? `Bill to: ${input.customerName.trim()}` : "",
        input.totalLabel?.trim() ? `Total: ${input.totalLabel.trim()}` : "",
        "The invoice PDF is attached.",
        extras.length ? `Also attached: ${extras.join(", ")}.` : "",
        "Questions? Reply to this email.",
        "",
        "M & S Loads LLC · Accounts Receivable",
      ];
  return {
    to: "",
    from,
    subject,
    text: `${lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim()}\n`,
    replyTo: from,
  };
}

async function invoicePdfForMail(load: LoadView): Promise<{
  invoiceNumber: string;
  filename: string;
  buffer: Buffer;
  total: number;
}> {
  const model = buildTmsInvoice(load);
  const existing = listAttachments(load.id).find((file) => file.kind === "invoice");
  if (existing) {
    const stored = getAttachmentPath(existing);
    if (fs.existsSync(stored)) {
      return {
        invoiceNumber: load.tms_invoice_number || model.invoiceNumber,
        filename: existing.original_name || `${model.invoiceNumber}.pdf`,
        buffer: fs.readFileSync(stored),
        total: model.total,
      };
    }
  }
  const made = await createTmsInvoice(load.id);
  return {
    invoiceNumber: made.invoiceNumber,
    filename: made.filename,
    buffer: made.buffer,
    total: model.total,
  };
}

export function invoiceEmailBodyForLoad(
  load: LoadView,
  invoice?: { invoiceNumber?: string; total?: number } | null,
): string {
  const shown = customerFacingLoadNumber(load) || load.load_number;
  let invoiceNumber = (load.tms_invoice_number || invoice?.invoiceNumber || "").trim();
  let totalLabel = invoice != null && Number.isFinite(invoice.total) ? formatInvoiceMoney(invoice.total) : "";
  if (!invoiceNumber || !totalLabel) {
    try {
      const model = buildTmsInvoice(load);
      invoiceNumber = invoiceNumber || model.invoiceNumber;
      totalLabel = totalLabel || formatInvoiceMoney(model.total);
    } catch {
      // Leave missing invoice fields blank — never show [brackets].
    }
  }
  return fillInvoiceEmailBody(getInvoiceEmailBody(), {
    customerName: load.customer_name,
    loadId: shown,
    invoiceNumber,
    invoiceTotal: totalLabel,
  });
}

export function invoiceMailTo(load: LoadView, typedTo = ""): string {
  const stored = resolveInvoiceCustomerEmail(load);
  if (isUsableEmail(stored)) return normalizeEmail(stored);
  return normalizeEmail(typedTo);
}

export async function sendCustomerInvoiceMail(
  loadId: number,
  send: typeof sendMail = sendMail,
  options: { extraIds?: number[]; body?: string; to?: string } = {},
): Promise<{ to: string; subject: string }> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const to = invoiceMailTo(load, options.to);
  if (!isUsableEmail(to)) throw new Error("Enter an email to send this invoice.");
  const extras = mailFilesForLoadDocs(loadId, options.extraIds ?? []);
  const invoice = await invoicePdfForMail(load);
  const shown = customerFacingLoadNumber(load) || load.load_number;
  const draft = composeCustomerInvoiceEmail({
    invoiceNumber: invoice.invoiceNumber,
    loadNumber: shown,
    customerName: load.customer_name,
    totalLabel: formatInvoiceMoney(invoice.total),
    extraLabels: extras.map((file) => file.label),
    body: options.body ?? getInvoiceEmailBody(),
    officePhone: getCompanyProfile().dispatcher_phone,
  });
  const usedNames = new Set([invoice.filename.toLowerCase()]);
  const mail: OutgoingMail = {
    to,
    from: draft.from || invoiceFromAddress(),
    subject: draft.subject,
    text: draft.text,
    replyTo: draft.replyTo || invoiceFromAddress(),
    attachments: [
      {
        filename: invoice.filename,
        contentType: "application/pdf",
        content: invoice.buffer,
      },
      ...extras.map((file) => ({
        filename: uniqueMailFilename(file.filename, usedNames),
        contentType: file.contentType,
        content: file.content,
      })),
    ],
  };
  await send(mail);
  recordSentMail({ loadId, kind: "customer_invoice", to, subject: draft.subject });
  return { to, subject: draft.subject };
}

export function lastLoadMail(loadId: number, kind: LoadMailKind): SentMailRow | null {
  return lastSentMail(loadId, kind);
}

function mailStopLines(
  stops: LoadStop[],
  stop: LoadStop,
  locale: DriverMessageLocale = "en",
): {
  title: string;
  address: string;
  window: string;
  appointment: string;
  reference: string;
} {
  const title = stopTypeLabel(stop.kind, stopTypeNumber(stops, stop.id));
  const labeled =
    locale === "es"
      ? title.replace(/^Pickup\b/, "Recogida").replace(/^Delivery\b/, "Entrega")
      : title;
  const address = [
    stop.name.trim(),
    formatStopPartyAddress(stop).replace(/\n/g, ", "),
  ]
    .filter(Boolean)
    .join(" — ");
  const window = formatStopWindow(stop.window_start, stop.window_end, stop.schedule_type);
  return {
    title: labeled,
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
