/**
 * Pure customer name and MC comparison.
 * Importers and the customer lookup use the same alias normalization.
 */

export function normalizeCustomerAlias(name: string): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|incorporated|co|corp|ltd|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Digits only, without leading zeros. Blank when the value has no digits. */
export function normalizeMcNumber(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}

export type CustomerAliasRef = {
  customerId: number;
  name: string;
  normalized: string;
};

export function aliasCustomerId(name: string, aliases: CustomerAliasRef[]): number | null {
  const normalized = normalizeCustomerAlias(name);
  if (!normalized) return null;
  const hits = aliases.filter((alias) => alias.normalized === normalized);
  const ids = [...new Set(hits.map((alias) => alias.customerId))];
  if (ids.length !== 1) return null;
  return ids[0] ?? null;
}

export function customerMatchesLookup(
  customer: {
    name: string;
    mc_number?: string | null;
    dot_number?: string | null;
    alias_names?: string[] | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (customer.name.toLowerCase().includes(q)) return true;
  const mc = String(customer.mc_number ?? "");
  const dot = String(customer.dot_number ?? "");
  if (mc.toLowerCase().includes(q) || dot.toLowerCase().includes(q)) return true;
  const digits = normalizeMcNumber(q);
  if (digits && (normalizeMcNumber(mc).includes(digits) || normalizeMcNumber(dot).includes(digits))) return true;
  const aliases = customer.alias_names ?? [];
  if (aliases.some((alias) => alias.toLowerCase().includes(q))) return true;
  const normalizedQuery = normalizeCustomerAlias(query);
  if (!normalizedQuery) return false;
  return aliases.some((alias) => {
    const normalized = normalizeCustomerAlias(alias);
    return normalized === normalizedQuery || normalized.includes(normalizedQuery);
  });
}

export function duplicateMcMessage(names: string[], mc: string): string {
  const label = names.filter(Boolean).join(" and ") || "Another customer";
  const shown = mc.trim() || normalizeMcNumber(mc);
  return `${label} already uses MC ${shown}. Save again to keep this MC on both customers.`;
}
