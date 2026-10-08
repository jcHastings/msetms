/** MS Express is the asset carrier on this TMS. M&S Loads without the DBA is only a bill-to customer. */

export const MS_EXPRESS_LEGAL_NAME = "M&S Loads DBA MS Express";

export const MS_EXPRESS_CARRIER = {
  name: "MS Express",
  legalName: MS_EXPRESS_LEGAL_NAME,
  usdot: "3062879",
  mc: "056299",
  city: "Hastings",
  state: "NE",
  phone: "402-302-0097",
  arEmail: "ar@msloads.com",
} as const;

const LEGAL_NAME_NORMALIZED = "m and s loads dba ms express";

export type CompanyIdentityInput = {
  company_name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  ar_email?: string | null;
  dispatcher_email?: string | null;
  dispatcher_phone?: string | null;
  phone?: string | null;
  usdot?: string | null;
  mc?: string | null;
};

/** Case, extra whitespace, and & / and / spacing variants of one name. */
export function normalizeCarrierName(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True only for "M&S Loads DBA MS Express" and the tolerated variants of that same name. */
export function isMsExpressLegalName(name: string | null | undefined): boolean {
  return normalizeCarrierName(name) === LEGAL_NAME_NORMALIZED;
}

/**
 * Brokerage trade name. The legal DBA name is the carrier, not the brokerage.
 * Bare "M&S Loads" and any M&S Loads name without "DBA MS Express" still match.
 */
export function looksLikeMsLoadsName(name: string | null | undefined): boolean {
  if (isMsExpressLegalName(name)) return false;
  const compact = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!compact) return false;
  return compact.includes("msloads") || compact.includes("mandsloads");
}

/** Brokerage authority MC-970613. MS Express MC 056299 does not match. */
export function isBrokerageMc(value: string | null | undefined): boolean {
  return /(?:^|\D)970613(?:\D|$)/.test(String(value ?? ""));
}

/** Brokerage mailbox. ar@msloads.com does not match. */
export function isBrokerageEmail(value: string | null | undefined): boolean {
  return /\bjc@msloads\.com\b/i.test(String(value ?? ""));
}

function foldPlace(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Brokerage offices: Nanuet, NY and Deerfield Beach, FL. Hastings, NE does not match. */
export function isBrokerageAddress(input: CompanyIdentityInput): boolean {
  const street = foldPlace(input.street);
  const city = foldPlace(input.city);
  const state = foldPlace(input.state);
  const zip = String(input.zip ?? "").replace(/\D/g, "");
  const blob = `${street} ${city} ${state} ${zip}`.trim();
  const stateNy = state === "ny" || state === "new york" || /\bny\b/.test(blob);
  const stateFl = state === "fl" || state === "florida" || /\bfl\b/.test(blob);
  if (city === "nanuet") return true;
  if (/\bnanuet\b/.test(blob) && (stateNy || zip.startsWith("10954"))) return true;
  if (city === "deerfield beach") return true;
  if (/\bdeerfield beach\b/.test(blob) && stateFl) return true;
  if (/\b228\b/.test(street) && /\broute 59\b/.test(street)) return true;
  return false;
}

/** Invoice From address. A blank address is not usable. ar@msloads.com is MS Express's AR email. */
export function usableArEmail(value: string | null | undefined): string {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  if (isBrokerageEmail(email)) return "";
  return email;
}

/** Printed carrier on invoices. An accepted DBA name stays as stored. A brokerage name becomes MS Express. */
export function invoiceIssuerLegalName(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  if (isMsExpressLegalName(trimmed)) return trimmed;
  if (!trimmed || looksLikeMsLoadsName(trimmed)) return MS_EXPRESS_CARRIER.name;
  return trimmed;
}

export function invoiceIssuerDocket(usdot?: string | null, mc?: string | null): string {
  const dot = String(usdot ?? "").trim() || MS_EXPRESS_CARRIER.usdot;
  const rawMc = String(mc ?? "").trim();
  const authority = !rawMc || isBrokerageMc(rawMc) ? MS_EXPRESS_CARRIER.mc : rawMc;
  return `USDOT ${dot} · MC ${authority}`;
}

export type PaperworkIssuer = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  usdot: string;
  mc: string;
  docket: string;
};

/** What statements, invoices, and PDFs may print. Brokerage identity is left off the page. */
export function paperworkIssuer(input: CompanyIdentityInput): PaperworkIssuer {
  const brokerageAddress = isBrokerageAddress(input);
  const street = brokerageAddress ? "" : String(input.street ?? "").trim();
  const city = brokerageAddress ? MS_EXPRESS_CARRIER.city : String(input.city ?? "").trim() || MS_EXPRESS_CARRIER.city;
  const state = brokerageAddress ? MS_EXPRESS_CARRIER.state : String(input.state ?? "").trim() || MS_EXPRESS_CARRIER.state;
  const zip = brokerageAddress ? "" : String(input.zip ?? "").trim();
  const rawMc = String(input.mc ?? "").trim();
  const mc = !rawMc || isBrokerageMc(rawMc) ? MS_EXPRESS_CARRIER.mc : rawMc;
  const usdot = String(input.usdot ?? "").trim() || MS_EXPRESS_CARRIER.usdot;
  const phone = String(input.dispatcher_phone ?? input.phone ?? "").trim() || MS_EXPRESS_CARRIER.phone;
  return {
    name: invoiceIssuerLegalName(input.company_name),
    street,
    city,
    state,
    zip,
    phone,
    email: usableArEmail(input.ar_email),
    usdot,
    mc,
    docket: `USDOT ${usdot} · MC ${mc}`,
  };
}

export function paperworkOfficeEmail(value: string | null | undefined): string {
  const email = String(value ?? "").trim();
  if (!email || isBrokerageEmail(email)) return "";
  return email;
}

export type InvoiceIssuerGap =
  | "company_name"
  | "remit_street"
  | "ar_email"
  | "brokerage_mc"
  | "brokerage_email"
  | "brokerage_address";

/** Shared company-identity guard for settings, invoices, PDFs, and the QuickBooks send. */
export function invoiceIssuerProblems(input: CompanyIdentityInput): InvoiceIssuerGap[] {
  const problems: InvoiceIssuerGap[] = [];
  if (looksLikeMsLoadsName(input.company_name)) problems.push("company_name");
  if (!String(input.street ?? "").trim()) problems.push("remit_street");
  if (
    isBrokerageEmail(input.ar_email) ||
    isBrokerageEmail(input.dispatcher_email) ||
    isBrokerageEmail(input.company_name)
  ) {
    problems.push("brokerage_email");
  }
  if (!isBrokerageEmail(input.ar_email) && !usableArEmail(input.ar_email)) problems.push("ar_email");
  if (isBrokerageMc(input.mc) || isBrokerageMc(input.company_name)) problems.push("brokerage_mc");
  if (isBrokerageAddress(input)) problems.push("brokerage_address");
  return problems;
}

/** Office-facing reason invoices cannot be emailed. Empty when the profile can send. */
export function invoiceIssuerWarning(problems: InvoiceIssuerGap[]): string {
  if (!problems.length) return "";
  const lines = ["Invoices cannot be emailed until the company profile is fixed."];
  if (problems.includes("company_name")) {
    lines.push(
      "Company name looks like M&S Loads without DBA MS Express. Set it to MS Express or M&S Loads DBA MS Express (USDOT 3062879, MC 056299). A bare M&S Loads name is the brokerage.",
    );
  }
  if (problems.includes("remit_street")) {
    lines.push("Remit street address is blank. Set it under Settings → Company contact.");
  }
  if (problems.includes("ar_email")) {
    lines.push("AR email is blank. Set it under Settings → Company contact.");
  }
  if (problems.includes("brokerage_mc")) {
    lines.push("MC number is the brokerage MC-970613. MS Express is MC 056299.");
  }
  if (problems.includes("brokerage_email")) {
    lines.push("jc@msloads.com is the brokerage email. Use ar@msloads.com for accounts receivable.");
  }
  if (problems.includes("brokerage_address")) {
    lines.push(
      "Company address is a brokerage office in Nanuet, NY or Deerfield Beach, FL. MS Express is in Hastings, NE.",
    );
  }
  return lines.join(" ");
}

export function assertInvoiceIssuerReady(input: CompanyIdentityInput): void {
  const warning = invoiceIssuerWarning(invoiceIssuerProblems(input));
  if (warning) throw new Error(warning);
}
