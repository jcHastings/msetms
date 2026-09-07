/** Load vs customer phone. No env or API keys. */

import { getCustomer } from "./queries";

export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function isUsablePhone(value: string | null | undefined): boolean {
  return normalizePhone(value).replace(/\D/g, "").length >= 7;
}

export function formatPhoneWithExt(phone: string, ext = ""): string {
  const number = normalizePhone(phone);
  const extra = normalizePhone(ext);
  if (number && extra) return `${number} x${extra}`;
  return number;
}

export function resolveCustomerMainPhone(customerId: number): string {
  const customer = getCustomer(customerId);
  const fromContact = customer?.contacts.map((row) => normalizePhone(row.phone)).find((phone) => isUsablePhone(phone));
  return fromContact ?? "";
}

export function resolveLoadPerLoadPhone(load: { contact_phone?: string | null }): string {
  const phone = normalizePhone(load.contact_phone);
  return isUsablePhone(phone) ? phone : "";
}

export function resolveLoadPerLoadExt(load: { contact_ext?: string | null }): string {
  return normalizePhone(load.contact_ext);
}

/** Driver confirmation / call-before / load comms: per-load broker phone, else customer main. */
export function resolveLoadCustomerPhone(load: { contact_phone?: string | null; customer_id: number }): string {
  return resolveLoadPerLoadPhone(load) || resolveCustomerMainPhone(load.customer_id);
}

/** Extension only rides with the per-load phone. Do not invent one on the customer card. */
export function resolveLoadCustomerExt(load: {
  contact_phone?: string | null;
  contact_ext?: string | null;
  customer_id: number;
}): string {
  return resolveLoadPerLoadPhone(load) ? resolveLoadPerLoadExt(load) : "";
}

export function resolveLoadCustomerPhoneLine(load: {
  contact_phone?: string | null;
  contact_ext?: string | null;
  customer_id: number;
}): string {
  return formatPhoneWithExt(resolveLoadCustomerPhone(load), resolveLoadCustomerExt(load));
}
