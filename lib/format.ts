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
  if (dateOnlyParts(iso)) return formatMdYDisplay(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = formatMdYDisplay(iso);
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
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

export function formatStopWindow(start: string, end: string): string {
  const from = start.trim() ? formatDateTime(start) : "";
  const to = end.trim() ? formatDateTime(end) : "";
  if (from && to && from !== "—" && to !== "—") return `${from} – ${to}`;
  if (from && from !== "—") return from;
  if (to && to !== "—") return to;
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
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatGallons(value: number | null | undefined): string {
  if (value == null) return "—";
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
