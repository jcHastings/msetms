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

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
