/** MS Express is the asset carrier on this TMS. M&S Loads is only a bill-to customer. */

export const MS_EXPRESS_CARRIER = {
  name: "MS Express",
  usdot: "3062879",
  mc: "056299",
  city: "Hastings",
  state: "NE",
  phone: "402-302-0097",
} as const;

export function looksLikeMsLoadsName(name: string): boolean {
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return false;
  return compact.includes("msloads") || compact.includes("mandsloads");
}

/** Invoice From address. A blank address is not usable. ar@msloads.com is MS Express's AR email. */
export function usableArEmail(value: string | null | undefined): string {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

/** Printed carrier on invoices. Never M&S Loads LLC. */
export function invoiceIssuerLegalName(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || looksLikeMsLoadsName(trimmed)) return MS_EXPRESS_CARRIER.name;
  return trimmed;
}

export function invoiceIssuerDocket(usdot?: string | null, mc?: string | null): string {
  const dot = String(usdot ?? "").trim() || MS_EXPRESS_CARRIER.usdot;
  const authority = String(mc ?? "").trim() || MS_EXPRESS_CARRIER.mc;
  return `USDOT ${dot} · MC ${authority}`;
}

export type InvoiceIssuerGap = "company_name" | "remit_street" | "ar_email";

export function invoiceIssuerProblems(input: {
  company_name?: string | null;
  street?: string | null;
  ar_email?: string | null;
}): InvoiceIssuerGap[] {
  const problems: InvoiceIssuerGap[] = [];
  if (looksLikeMsLoadsName(String(input.company_name ?? ""))) problems.push("company_name");
  if (!String(input.street ?? "").trim()) problems.push("remit_street");
  if (!usableArEmail(input.ar_email)) problems.push("ar_email");
  return problems;
}

/** Office-facing reason invoices cannot be emailed. Empty when the profile can send. */
export function invoiceIssuerWarning(problems: InvoiceIssuerGap[]): string {
  if (!problems.length) return "";
  const lines = ["Invoices cannot be emailed until the company profile is fixed."];
  if (problems.includes("company_name")) {
    lines.push(
      "Company name looks like M&S Loads. Set it to MS Express (USDOT 3062879, MC 056299). M&S Loads is a bill-to customer.",
    );
  }
  if (problems.includes("remit_street")) {
    lines.push("Remit street address is blank. Set it under Settings → Company contact.");
  }
  if (problems.includes("ar_email")) {
    lines.push("AR email is blank. Set it under Settings → Company contact.");
  }
  return lines.join(" ");
}

export function assertInvoiceIssuerReady(input: {
  company_name?: string | null;
  street?: string | null;
  ar_email?: string | null;
}): void {
  const warning = invoiceIssuerWarning(invoiceIssuerProblems(input));
  if (warning) throw new Error(warning);
}
