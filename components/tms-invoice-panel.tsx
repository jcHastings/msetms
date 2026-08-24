"use client";

import { useActionState } from "react";
import { createTmsInvoiceAction } from "@/lib/actions";
import { formatMoney } from "@/lib/format";
import type { TmsInvoiceModel } from "@/lib/invoice";

export function TmsInvoicePanel({
  loadId,
  status,
  invoice,
  saved = false,
}: {
  loadId: number;
  status: string;
  invoice: TmsInvoiceModel | null;
  saved?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createTmsInvoiceAction, null);
  const canInvoice = status === "delivered" || status === "completed";
  return (
    <section className="card mb-4 p-5" data-invoice-panel="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Invoice</h2>
          <p className="mt-1 text-sm text-slate-600">
            Customer Income / Budget lines only. Driver pay, owner-operator pay, lumper expenses, and
            relays stay off this invoice. QuickBooks connect is not required.
          </p>
        </div>
      </div>
      {invoice ? (
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Invoice #</dt>
            <dd className="font-semibold">{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Customer</dt>
            <dd className="font-semibold">{invoice.customerName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Load</dt>
            <dd className="font-semibold">{invoice.loadNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total</dt>
            <dd className="font-semibold">{formatMoney(invoice.total)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {canInvoice ? "No TMS invoice yet." : "Mark the load Delivered before invoicing."}
        </p>
      )}
      {invoice ? (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {invoice.lines.map((line) => (
            <li key={`${line.name}-${line.description}`} className="flex justify-between gap-3">
              <span>
                {line.name}
                {line.description ? <span className="text-slate-500"> · {line.description}</span> : null}
              </span>
              <span className="font-semibold">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {state && !state.ok ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      ) : null}
      <form action={formAction} className="mt-4">
        <input type="hidden" name="load_id" value={loadId} />
        <button className="btn btn-primary" type="submit" disabled={pending || !canInvoice}>
          {pending ? "Creating…" : saved ? "Rebuild invoice" : "Create invoice"}
        </button>
      </form>
    </section>
  );
}
