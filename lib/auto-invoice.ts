import { listAttachments } from "./files";
import { sendMail } from "./integrations/mail";
import { createTmsInvoice } from "./invoice";
import { resolveInvoiceCustomerEmail, sendCustomerInvoiceMail } from "./load-mail";
import { isUsableEmail } from "./mail-shared";
import { lastSentMail } from "./mail-store";
import { getLoad } from "./queries";
import { getInvoiceSendMode } from "./settings";
import { isBillableStatus } from "./types";

export type AutoInvoiceResult = {
  created: boolean;
  sent: boolean;
  skipped: string;
};

function loadHasPod(loadId: number): boolean {
  return listAttachments(loadId).some((file) => file.kind === "pod");
}

function loadHasInvoicePdf(loadId: number): boolean {
  return listAttachments(loadId).some((file) => file.kind === "invoice");
}

export function loadNeedsInvoiceEmail(loadId: number): boolean {
  const load = getLoad(loadId);
  if (!load || !isBillableStatus(load.status) || !loadHasPod(loadId)) return false;
  if (!load.tms_invoice_number && !loadHasInvoicePdf(loadId)) return false;
  if (isUsableEmail(resolveInvoiceCustomerEmail(load))) return false;
  return lastSentMail(loadId, "customer_invoice") == null;
}

/** Same checks as a send: billable, POD, usable email, and no invoice email yet. */
export function invoicePromptForLoad(loadId: number): { email: string } | null {
  const load = getLoad(loadId);
  if (!load || !isBillableStatus(load.status) || !loadHasPod(loadId)) return null;
  if (lastSentMail(loadId, "customer_invoice")) return null;
  const email = resolveInvoiceCustomerEmail(load);
  if (!isUsableEmail(email)) return null;
  return { email };
}

/** Create and email when eligible. Does not look at the ask/auto setting. */
export async function deliverAutoInvoice(
  loadId: number,
  send: typeof sendMail = sendMail,
): Promise<AutoInvoiceResult> {
  const load = getLoad(loadId);
  if (!load) return { created: false, sent: false, skipped: "missing" };
  if (!isBillableStatus(load.status)) return { created: false, sent: false, skipped: "not_delivered" };
  if (!loadHasPod(loadId)) return { created: false, sent: false, skipped: "no_pod" };

  let created = false;
  if (!load.tms_invoice_number || !loadHasInvoicePdf(loadId)) {
    try {
      await createTmsInvoice(loadId);
      created = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "invoice failed";
      return { created: false, sent: false, skipped: message };
    }
  }

  if (lastSentMail(loadId, "customer_invoice")) {
    return { created, sent: false, skipped: "already_sent" };
  }

  const fresh = getLoad(loadId) ?? load;
  const email = resolveInvoiceCustomerEmail(fresh);
  if (!isUsableEmail(email)) {
    return { created, sent: false, skipped: "no_email" };
  }

  await sendCustomerInvoiceMail(loadId, send);
  return { created, sent: true, skipped: "" };
}

export async function maybeAutoInvoiceLoad(
  loadId: number,
  send: typeof sendMail = sendMail,
): Promise<AutoInvoiceResult> {
  if (getInvoiceSendMode() !== "auto") {
    return { created: false, sent: false, skipped: "ask_first" };
  }
  return deliverAutoInvoice(loadId, send);
}
