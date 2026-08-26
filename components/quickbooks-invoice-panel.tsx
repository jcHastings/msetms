"use client";

import { useActionState, useState } from "react";
import { sendToQuickbooksAction } from "@/lib/actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { QboInvoicePreview } from "@/lib/integrations/quickbooks";
import type { ActionResult } from "@/lib/types";

export function QuickbooksInvoicePanel({
  loadId,
  preview,
}: {
  loadId: number;
  preview: QboInvoicePreview;
}) {
  const [state, formAction, pending] = useActionState(
    sendToQuickbooksAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );
  const [confirmResend, setConfirmResend] = useState(false);
  const sendBlocked = preview.alreadySent && !confirmResend;
  const buttonLabel = preview.alreadySent
    ? "Send again to QuickBooks"
    : preview.mode === "demo"
      ? "Record demo invoice"
      : "Send to QuickBooks";

  return (
    <section className="card mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">QuickBooks invoice</h2>
          <p className="mt-1 text-sm text-slate-600">Customer invoice.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {preview.mode === "demo" ? "Demo" : "QuickBooks"}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-slate-500">Customer</dt>
          <dd className="font-semibold">{preview.customerName}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Load</dt>
          <dd className="font-semibold">{preview.loadNumber}</dd>
        </div>
        <div>
          <dt className="text-slate-500">PU → DEL</dt>
          <dd className="font-semibold">{preview.lane}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Amount</dt>
          <dd className="font-semibold">{formatMoney(preview.amount)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Invoice date</dt>
          <dd className="font-semibold">{preview.txnDate}</dd>
        </div>
        {preview.alreadySent ? (
          <div>
            <dt className="text-slate-500">QBO doc #</dt>
            <dd className="font-semibold">
              {preview.existingInvoiceNumber || preview.existingInvoiceId}
              {preview.existingSentAt ? ` · ${formatDateTime(preview.existingSentAt)}` : ""}
              {preview.existingSource ? ` · ${preview.existingSource}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      {preview.customerNeedsQbo ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Needs QBO customer: {preview.customerName}. Match or create this customer in QuickBooks, then send again.
        </p>
      ) : null}
      <ul className="mt-3 space-y-1 text-sm text-slate-700">
        {preview.lines.map((line) => (
          <li key={`${line.name}-${line.description}`} className="flex justify-between gap-3">
            <span>
              {line.name}
              <span className="text-slate-500"> · {line.description}</span>
            </span>
            <span className="font-semibold">{formatMoney(line.amount)}</span>
          </li>
        ))}
      </ul>

      <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        {preview.memo}
      </pre>
      {preview.ownerOperatorNote ? (
        <p className="mt-2 text-sm text-slate-600">{preview.ownerOperatorNote}</p>
      ) : null}

      <form action={formAction} className="mt-4 space-y-3">
        {state?.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Invoice recorded{preview.mode === "demo" ? " as a local demo invoice" : " in QuickBooks"}.
          </p>
        ) : null}
        {state && !state.ok ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {state.error}
          </p>
        ) : null}
        <input type="hidden" name="load_id" value={loadId} />
        {preview.alreadySent ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="confirm_resend"
              value="1"
              checked={confirmResend}
              onChange={(event) => setConfirmResend(event.target.checked)}
            />
            <span>This load already has invoice {preview.existingInvoiceId}. Send again anyway.</span>
          </label>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={pending || sendBlocked}>
          {pending ? "Sending…" : buttonLabel}
        </button>
      </form>
    </section>
  );
}
