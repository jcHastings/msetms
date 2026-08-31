export const DOCUMENT_TAG_HINTS = [
  "[org_name]",
  "[user_name]",
  "[user_email]",
  "[user_phone]",
  "[load_id]",
  "[customer_name]",
  "[customer_phone]",
] as const;

export type DocumentTagContext = {
  orgName?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  loadId?: string;
  customerName?: string;
  customerPhone?: string;
  invoiceNumber?: string;
  invoiceTotal?: string;
};

export function expandDocumentTags(text: string, ctx: DocumentTagContext = {}): string {
  const values: Record<string, string> = {
    org_name: ctx.orgName ?? "",
    user_name: ctx.userName ?? "",
    user_email: ctx.userEmail ?? "",
    user_phone: ctx.userPhone ?? "",
    load_id: ctx.loadId ?? "",
    customer_name: ctx.customerName ?? "",
    customer_phone: ctx.customerPhone ?? "",
    invoice_number: ctx.invoiceNumber ?? "",
    invoice_total: ctx.invoiceTotal ?? "",
  };
  return String(text ?? "").replace(/\[([a-z0-9_]+)\]/gi, (full, key: string) => {
    const mapped = values[key.toLowerCase()];
    return mapped == null || mapped === "" ? full : mapped;
  });
}

export const DOCUMENT_FONTS = [
  { value: "helvetica", label: "Arial", pdf: "Helvetica" },
  { value: "times", label: "Times", pdf: "Times-Roman" },
  { value: "courier", label: "Courier", pdf: "Courier" },
] as const;

export type DocumentFontFamily = (typeof DOCUMENT_FONTS)[number]["value"];

export function pdfFontName(family: string): string {
  return DOCUMENT_FONTS.find((item) => item.value === family)?.pdf ?? "Helvetica";
}

export function scaledFontSize(base: number, scalePercent: number): number {
  const size = Number(base) || 10;
  const scale = Number(scalePercent) || 100;
  const next = Math.round(size * (scale / 100) * 10) / 10;
  return Math.min(16, Math.max(7, next));
}
