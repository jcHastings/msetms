/** Seeded invoice blurbs. Never print these on customer paperwork. */
export const INVOICE_LECTURE_FOOTER = "Payment due per customer terms.";
export const INVOICE_LECTURE_TERMS =
  "Linehaul is the customer rate. Accessorials are billed separately when recorded.";

export function printablePaperworkCopy(text: string): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("linehaul is the customer rate")) return "";
  if (lower.includes("accessorials are billed separately")) return "";
  if (lower.includes("payment due per customer terms")) return "";
  if (lower.includes("customer portal")) return "";
  return text.trim();
}
