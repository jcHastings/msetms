export const LOAD_TRUCK_STATUSES = [
  { value: "", label: "—" },
  { value: "available", label: "Available" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_use", label: "In Use" },
  { value: "empty", label: "Empty" },
] as const;

export const LOAD_SIZES = [
  { value: "", label: "—" },
  { value: "full", label: "Full" },
  { value: "partial", label: "Partial" },
] as const;

export const LOAD_CONDITIONS = [
  { value: "", label: "—" },
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
] as const;

export const PAY_ITEM_CATEGORIES = [
  { value: "flat_rate", label: "Flat Rate" },
  { value: "lumper", label: "Lumper" },
  { value: "detention", label: "Detention" },
  { value: "layover", label: "Layover" },
  { value: "tonu", label: "TONU" },
  { value: "washout", label: "Washout" },
  { value: "misc", label: "Misc." },
  { value: "trailer_rental", label: "Trailer Rental" },
  { value: "fuel_advance_fee", label: "Fuel Advance Fee" },
  { value: "claim_for_damages", label: "Claim for Damages" },
] as const;

export type PayItemCategory = (typeof PAY_ITEM_CATEGORIES)[number]["value"];
export type PayItemSide = "income" | "expense";
export type PayItemBillTo = "customer" | "driver";

export function labelForPayCategory(value: string): string {
  return PAY_ITEM_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function isPayItemCategory(value: string): value is PayItemCategory {
  return PAY_ITEM_CATEGORIES.some((item) => item.value === value);
}

export function safeReturnTo(value: unknown, fallback = "/board"): string {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) {
    return fallback;
  }
  return raw;
}

export function overlayHref(
  basePath: string,
  loadId: number,
  current?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(current ?? {})) {
    if (val && key !== "open") params.set(key, val);
  }
  params.set("open", String(loadId));
  return `${basePath}?${params.toString()}`;
}

export function overlayReturnTo(basePath: string, current?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(current ?? {})) {
    if (val && key !== "open") params.set(key, val);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function parseOpenLoadId(value: string | undefined): number | null {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function placeholderLane() {
  const pickup = new Date();
  pickup.setMinutes(0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(pickupEnd.getHours() + 4);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(deliveryEnd.getHours() + 4);
  return {
    origin: "TBD",
    destination: "TBD",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
  };
}
