import { buildTmsInvoice, renderTmsInvoicePdf } from "./invoice";
import { generateBolPdf } from "./bol";
import { replaceAttachment } from "./files";
import { buildConfirmationForLoad, renderConfirmationPdf } from "./load-confirmation";
import { getLoad } from "./queries";
import type { Attachment } from "./types";

export function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "ENOENT");
}

export async function regenerateMissingAttachment(attachment: Attachment): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
} | null> {
  try {
    if (attachment.kind === "invoice") {
      const load = getLoad(attachment.load_id);
      if (!load) return null;
      const model = buildTmsInvoice(load);
      const filename = `${model.invoiceNumber}.pdf`;
      const buffer = await renderTmsInvoicePdf(model);
      replaceAttachment(attachment.id, {
        originalName: filename,
        buffer,
        mimeType: "application/pdf",
        uploadedBy: "dispatcher",
      });
      return { buffer, filename, mimeType: "application/pdf" };
    }
    if (attachment.kind === "bol") {
      const made = await generateBolPdf(attachment.load_id);
      replaceAttachment(attachment.id, {
        originalName: made.filename,
        buffer: made.buffer,
        mimeType: "application/pdf",
        uploadedBy: "dispatcher",
      });
      return { buffer: made.buffer, filename: made.filename, mimeType: "application/pdf" };
    }
    if (/confirm|driver-packet/i.test(attachment.original_name)) {
      const load = getLoad(attachment.load_id);
      if (!load) return null;
      const packet = /driver|internal/i.test(attachment.original_name) ? "internal" : "customer";
      const buffer = await renderConfirmationPdf(buildConfirmationForLoad(load.id, { packet }));
      const filename = attachment.original_name || `${load.load_number}-customer-confirmation.pdf`;
      replaceAttachment(attachment.id, {
        originalName: filename,
        buffer,
        mimeType: "application/pdf",
        uploadedBy: "dispatcher",
      });
      return { buffer, filename, mimeType: "application/pdf" };
    }
    return null;
  } catch {
    return null;
  }
}
