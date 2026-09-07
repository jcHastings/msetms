import { expandDocumentTags, type DocumentTagContext } from "./document-tags";

export const DEFAULT_INVOICE_EMAIL_BODY = [
  "Dear [customer_name],",
  "",
  "Attached is your invoice [invoice_number] for load [load_id]. Total: [invoice_total].",
  "",
  "Thank you for your business.",
].join("\n");

/** Expand invoice-email tags, then strip any leftover `[brackets]`. */
export function fillInvoiceEmailBody(template: string, ctx: DocumentTagContext = {}): string {
  return expandDocumentTags(template, ctx)
    .replace(/\[[^\]\n]+\]/g, "")
    .replace(/[ \t]{2,}/g, " ");
}
