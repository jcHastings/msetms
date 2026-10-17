/** Pure detention draft rules. No database, no mail, no invoice writes. */

import { MS_EXPRESS_CARRIER } from "./carrier-identity";
import { DETENTION_FREE_MS, asDetentionDate, detentionClockStart } from "./detention-clock";
import { formatDateTime, isAppointmentSchedule } from "./format";

export const DETENTION_RATE_MISSING = "missing, enter from rate con";
export const DETENTION_REPLY_TO_DEFAULT = "dispatch@msloads.com";
export const INVOICE_ALREADY_SENT_WARNING = "Invoice already sent, bill detention separately";
export const DETENTION_LINE_LOCKED = "This detention line is on a sent invoice or a processed settlement.";

export const DETENTION_STATUSES = ["requested", "approved", "denied", "paid"] as const;
export type DetentionStatus = (typeof DETENTION_STATUSES)[number];

export type DetentionFreeSource = "rate_con" | "desk_clock";

export type DetentionTriggerInput = {
  loadStatus: string;
  stopKind: string;
  arrivedAt?: string | null;
  departedAt?: string | null;
  scheduleType?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  freeMinutes?: number | null;
  roundMinutes?: number | null;
  pickupsEnabled: boolean;
};

export type DetentionTrigger = {
  show: boolean;
  dwellMinutes: number;
  freeMinutes: number;
  freeSource: DetentionFreeSource;
  billableMinutes: number;
  clockStart: string;
};

export type DetentionEmailInput = {
  loadNumber: string;
  po: string;
  stopName: string;
  city: string;
  state: string;
  scheduleType?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  arrivedAt: string;
  departedAt: string;
  arrivedGeofence: boolean;
  departedGeofence: boolean;
  dwellMinutes: number;
  freeMinutes: number;
  freeSource: DetentionFreeSource;
  billableMinutes: number;
};

const BROKERAGE_IDENTITY = [/970613/, /jc@msloads\.com/i, /\bnanuet\b/i, /deerfield beach/i];

export function isDetentionStatus(value: string): value is DetentionStatus {
  return (DETENTION_STATUSES as readonly string[]).includes(value);
}

export function detentionDeskFreeMinutes(): number {
  return DETENTION_FREE_MS / 60_000;
}

export function formatDetentionMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "0m";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours <= 0) return `${sign}${mins}m`;
  if (mins === 0) return hours === 1 ? `${sign}1 hour` : `${sign}${hours} hours`;
  return `${sign}${hours}h ${mins}m`;
}

export function applyDetentionRounding(minutes: number, roundMinutes: number | null | undefined): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const step = Number(roundMinutes ?? 0);
  if (!Number.isFinite(step) || step <= 0) return Math.round(minutes);
  return Math.ceil(minutes / step) * step;
}

export function detentionRequestTrigger(input: DetentionTriggerInput): DetentionTrigger {
  const arrived = asDetentionDate(input.arrivedAt);
  const departed = asDetentionDate(input.departedAt);
  const freeSource: DetentionFreeSource = input.freeMinutes != null && input.freeMinutes >= 0 ? "rate_con" : "desk_clock";
  const freeMinutes = freeSource === "rate_con" ? Math.round(Number(input.freeMinutes)) : detentionDeskFreeMinutes();
  const clock = detentionClockStart({
    scheduleType: input.scheduleType,
    arrivedAt: input.arrivedAt,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });
  const dwellMinutes = arrived && departed ? Math.round((departed.getTime() - arrived.getTime()) / 60_000) : 0;
  let billableMinutes = 0;
  if (arrived && departed && clock) {
    const raw = (departed.getTime() - (clock.getTime() + freeMinutes * 60_000)) / 60_000;
    billableMinutes = applyDetentionRounding(raw, input.roundMinutes);
  }
  const kind = String(input.stopKind ?? "").trim().toLowerCase();
  const pickupAllowed = kind === "pickup" && input.pickupsEnabled;
  const delivery = kind === "delivery";
  const cancelled = String(input.loadStatus ?? "").trim().toLowerCase() === "cancelled";
  const timesDiffer = Boolean(arrived && departed && arrived.getTime() !== departed.getTime());
  const show = !cancelled && (delivery || pickupAllowed) && timesDiffer && dwellMinutes > 0 && billableMinutes > 0;
  return {
    show,
    dwellMinutes: timesDiffer ? dwellMinutes : 0,
    freeMinutes,
    freeSource,
    billableMinutes: show ? billableMinutes : Math.max(0, billableMinutes),
    clockStart: clock ? clock.toISOString() : "",
  };
}

export function timesMatchGeofence(iso: string, stamps: string[]): boolean {
  const target = Date.parse(String(iso ?? "").trim());
  if (!Number.isFinite(target)) return false;
  return stamps.some((stamp) => {
    const at = Date.parse(String(stamp ?? "").trim());
    return Number.isFinite(at) && Math.abs(at - target) < 1000;
  });
}

export function detentionRateLabel(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return DETENTION_RATE_MISSING;
  return `$${rate.toFixed(2)} per hour from the rate confirmation`;
}

export function computeDetentionAmount(
  rate: number | null | undefined,
  billableMinutes: number,
  cap: number | null | undefined,
): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(billableMinutes) || billableMinutes <= 0) return null;
  let amount = Math.round((rate * billableMinutes) / 60 * 100) / 100;
  if (cap != null && Number.isFinite(cap) && cap > 0 && amount > cap) amount = Math.round(cap * 100) / 100;
  return amount;
}

export function approvalEmailHasDollarAmount(text: string): boolean {
  return /\$\s?\d/.test(String(text ?? ""));
}

export function detentionSignature(): string {
  return [
    MS_EXPRESS_CARRIER.legalName,
    MS_EXPRESS_CARRIER.phone,
    `MC ${MS_EXPRESS_CARRIER.mc}`,
    `USDOT ${MS_EXPRESS_CARRIER.usdot}`,
  ].join("\n");
}

export function signatureHasBrokerageIdentity(text: string): boolean {
  return BROKERAGE_IDENTITY.some((pattern) => pattern.test(text));
}

export function composeDetentionApprovalEmail(input: DetentionEmailInput): { subject: string; text: string } {
  const loadNumber = input.loadNumber.trim() || "unknown";
  const po = input.po.trim();
  const subject = po ? `Detention request: Load ${loadNumber} / PO ${po}` : `Detention request: Load ${loadNumber}`;
  const place = [input.stopName.trim(), [input.city.trim(), input.state.trim()].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const freeLine =
    input.freeSource === "rate_con"
      ? `Free time: ${formatDetentionMinutes(input.freeMinutes)} (rate confirmation)`
      : `Free time: ${formatDetentionMinutes(input.freeMinutes)} (desk clock; not stated on the rate confirmation)`;
  const text = [
    "Detention request for written approval.",
    "",
    `Load: ${loadNumber}`,
    `PO / reference: ${po || "None on the load"}`,
    `Stop: ${place || "Stop"}`,
    `Appointment: ${appointmentLabel(input)}`,
    timeLine("Arrived", input.arrivedAt, input.arrivedGeofence),
    timeLine("Departed", input.departedAt, input.departedGeofence),
    `Dwell: ${formatDetentionMinutes(input.dwellMinutes)}`,
    freeLine,
    `Billable time: ${formatDetentionMinutes(input.billableMinutes)}`,
    "",
    "Please reply with written approval or denial.",
    "",
    detentionSignature(),
  ].join("\n");
  return { subject, text };
}

function appointmentLabel(input: DetentionEmailInput): string {
  const start = displayTime(input.windowStart);
  const end = displayTime(input.windowEnd);
  if (isAppointmentSchedule(input.scheduleType)) return start || "Not on the stop";
  if (start && end) return `${start} to ${end}`;
  return start || end || "Not on the stop";
}

function timeLine(label: string, iso: string, geofence: boolean): string {
  const shown = displayTime(iso) || "Not set";
  return geofence ? `${label}: ${shown} (per GPS geofence)` : `${label}: ${shown}`;
}

function displayTime(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const shown = formatDateTime(raw);
  if (!shown || shown === "—" || shown === "-") return "";
  return shown;
}

export type DetentionAttachmentChoice = {
  id: number;
  name: string;
  kind: string;
  selected: boolean;
};

export type DetentionRequestView = {
  id: number;
  status: DetentionStatus;
  rate: number | null;
  amount: number | null;
  payItemId: number | null;
  sentAt: string;
  note: string;
};

export type DetentionDraftView = {
  loadId: number;
  stopId: number;
  loadNumber: string;
  to: string;
  cc: string;
  replyTo: string;
  subject: string;
  body: string;
  clause: string;
  rate: number | null;
  rateLabel: string;
  freeMinutes: number;
  freeSource: DetentionFreeSource;
  billableMinutes: number;
  cap: number | null;
  roundMinutes: number | null;
  attachments: DetentionAttachmentChoice[];
  request: DetentionRequestView | null;
  invoiceWarning: string;
  qboHint: string;
  computedAmount: number | null;
};
