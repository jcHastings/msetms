/**
 * QuickBooks invoice and bill sends stay off until billing moves off the old TMS.
 * Payment reads are not sends and do not use this flag.
 */

export const QBO_INVOICE_SEND_DISABLED_MESSAGE =
  "QuickBooks sending is off; billing runs from the old system";

export const QBO_SEND_IN_PROGRESS_MESSAGE =
  "Another QuickBooks send is already running for this load. Wait a moment and try again.";

/** A claim older than this can be taken by a new send. */
export const QBO_SEND_CLAIM_STALE_MS = 2 * 60 * 1000;

/** Off unless the value is 1, true, yes, or on. Unset and every other value stay off. */
export function qboInvoiceSendEnabledFrom(value: string | undefined): boolean {
  const flag = String(value ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}
