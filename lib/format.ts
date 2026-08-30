export function parseDriverPin(value: unknown, required = false): string {
  const pin = String(value ?? "").trim();
  if (!pin) {
    if (required) throw new Error("Enter a 4 to 8 digit PIN.");
    return "";
  }
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4 to 8 digits.");
  return pin;
}

export function toInputDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromInputDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Enter a valid date and time.");
  }
  return date.toISOString();
}

export const DISPLAY_TIME_ZONE = "America/New_York";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnlyParts(iso: string): { year: number; month: number; day: number } | null {
  const match = String(iso ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatMdYParts(year: number, month: number, day: number): string {
  return `${pad2(month)}/${pad2(day)}/${String(year).slice(-2)}`;
}

export function formatMdYFull(iso: string): string {
  const parts = dateOnlyParts(iso);
  if (parts) return `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const month = bits.find((part) => part.type === "month")?.value ?? "01";
  const day = bits.find((part) => part.type === "day")?.value ?? "01";
  const year = bits.find((part) => part.type === "year")?.value ?? "0000";
  return `${month}/${day}/${year}`;
}

export function formatAccountingDateTime(iso: string): string {
  try {
    const raw = String(iso ?? "").trim();
    if (!raw) return "—";
    if (dateOnlyParts(raw)) return formatMdYFull(raw);
    const date = parseDisplayDate(raw);
    if (!date) return "—";
    const datePart = formatMdYFull(date.toISOString());
    const timePart = date.toLocaleTimeString("en-US", {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart} ${timePart}`;
  } catch {
    return "—";
  }
}

export function formatMdYDisplay(iso: string): string {
  const parts = dateOnlyParts(iso);
  if (parts) return formatMdYParts(parts.year, parts.month, parts.day);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const month = bits.find((part) => part.type === "month")?.value ?? "01";
  const day = bits.find((part) => part.type === "day")?.value ?? "01";
  const year = bits.find((part) => part.type === "year")?.value ?? "00";
  return `${month}/${day}/${year}`;
}

export function formatDateTime(iso: string): string {
  try {
    const raw = String(iso ?? "").trim();
    if (!raw) return "—";
    if (dateOnlyParts(raw)) return formatMdYDisplay(raw);
    const date = parseDisplayDate(raw);
    if (!date) return "—";
    const datePart = formatMdYDisplay(date.toISOString());
    const timePart = date.toLocaleTimeString("en-US", {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart} ${timePart}`;
  } catch {
    return "—";
  }
}

/** Dispatch board: date on line 1, time on line 2. Do not keep them on one line. */
export function formatBoardDateTime(iso: string): { date: string; time: string } {
  const combined = formatDateTime(iso);
  if (!combined || combined === "—") return { date: "—", time: "" };
  const match = combined.match(/^(\d{1,2}\/\d{1,2}\/\d{2})(?:\s+(.+))?$/);
  if (!match) return { date: combined, time: "" };
  return { date: match[1], time: (match[2] ?? "").trim() };
}

function parseDisplayDate(raw: string): Date | null {
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return native;
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i,
  );
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  let hours = match[4] ? Number(match[4]) : 0;
  const meridiem = (match[7] ?? "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]), hours, match[5] ? Number(match[5]) : 0, match[6] ? Number(match[6]) : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ymdInTimeZone(value: Date | string, timeZone = DISPLAY_TIME_ZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const bits = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = bits.find((part) => part.type === "year")?.value ?? "";
  const month = bits.find((part) => part.type === "month")?.value ?? "";
  const day = bits.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function todayYmd(timeZone = DISPLAY_TIME_ZONE, now = new Date()): string {
  return ymdInTimeZone(now, timeZone);
}

export function isoTouchesYmd(iso: string, ymd: string, timeZone = DISPLAY_TIME_ZONE): boolean {
  const parts = dateOnlyParts(iso);
  if (parts) return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` === ymd;
  const key = ymdInTimeZone(iso, timeZone);
  return Boolean(key) && key === ymd;
}

export function loadTouchesToday(
  load: { pickup_start?: string; pickup_end?: string; delivery_start?: string; delivery_end?: string },
  now = new Date(),
  timeZone = DISPLAY_TIME_ZONE,
): boolean {
  const today = todayYmd(timeZone, now);
  return [load.pickup_start, load.pickup_end, load.delivery_start, load.delivery_end].some(
    (value) => value && isoTouchesYmd(value, today, timeZone),
  );
}

export function shortPlaceLabel(place: string): string {
  const text = String(place ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const matches = [...text.matchAll(/([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?/g)];
  const last = matches.at(-1);
  if (last) return `${last[1].replace(/\s+/g, " ").trim()}, ${last[2]}`;
  return text;
}

export function gpsMotionLabel(speedMph: number | null | undefined): string {
  if (speedMph == null || !Number.isFinite(speedMph)) return "";
  if (speedMph < 3) return "Parked";
  return `${Math.round(speedMph)} mph`;
}

export function isAppointmentSchedule(value?: string | null): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "appointment" || raw === "appt";
}

export function isFcfsSchedule(value?: string | null): boolean {
  return String(value ?? "").trim().toLowerCase() === "fcfs";
}

export function formatStopWindow(start: string, end: string, scheduleType?: string | null): string {
  if (isAppointmentSchedule(scheduleType)) {
    const from = start.trim() ? formatDateTime(start) : "";
    return from && from !== "—" ? from : "";
  }
  const from = start.trim() ? formatDateTime(start) : "";
  const to = end.trim() ? formatDateTime(end) : "";
  if (from && to && from !== "—" && to !== "—") return `${from} – ${to}`;
  if (from && from !== "—") return from;
  if (to && to !== "—") return to;
  return "";
}

function formatSmsClock(iso: string): { date: string; time: string } | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const dateOnly = dateOnlyParts(raw);
  if (dateOnly) return { date: `${pad2(dateOnly.month)}/${pad2(dateOnly.day)}`, time: "" };
  const date = parseDisplayDate(raw);
  if (!date) return null;
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = bits.find((part) => part.type === "month")?.value ?? "";
  const day = bits.find((part) => part.type === "day")?.value ?? "";
  if (!month || !day) return null;
  const time = date.toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return { date: `${month}/${day}`, time };
}

function smsClockLine(clock: { date: string; time: string }): string {
  return clock.time ? `${clock.date} ${clock.time}` : clock.date;
}

export function formatSmsStopWindow(start: string, end: string, scheduleType?: string | null): string {
  const from = start.trim() ? formatSmsClock(start) : null;
  const to = end.trim() ? formatSmsClock(end) : null;
  if (isAppointmentSchedule(scheduleType)) return from ? smsClockLine(from) : "";
  const useWindow =
    isFcfsSchedule(scheduleType) ||
    Boolean(to && from && (from.date !== to.date || from.time !== to.time));
  if (!useWindow) return from ? smsClockLine(from) : to ? smsClockLine(to) : "";
  if (from && to) {
    if (from.date === to.date && from.time && to.time) return `${from.date} ${from.time}–${to.time}`;
    return `${smsClockLine(from)}–${smsClockLine(to)}`;
  }
  if (from) return smsClockLine(from);
  if (to) return smsClockLine(to);
  return "";
}

export function formatInvoiceMoney(value: number | null | undefined, currency = "USD"): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(iso: string): string {
  return formatMdYDisplay(iso);
}

export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function formatFuelMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatGallons(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} gal`;
}

export function formatWeight(value: number | null | undefined, unit = "lb"): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} ${unit === "kg" ? "kg" : "lb"}`;
}

export function todayInputDate(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function parseOptionalFloat(value: FormDataEntryValue | null): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number.parseFloat(String(value));
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function cleanDateInput(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /^0{4}-0{2}-0{2}/.test(raw)) return "";
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

export function requiredString(value: FormDataEntryValue | null, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}
