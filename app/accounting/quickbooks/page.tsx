import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listReceivables } from "@/lib/accounting";
import { canConnectQuickbooks, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";
import { listCustomersNeedingQbo } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function QuickbooksAccountingPage() {
  const dispatcher = await getSignedInDispatcher();
  const canConnect = dispatcher ? canConnectQuickbooks(dispatcher.role) : false;
  const qbo = await getQuickbooksStatus();
  const ready = listReceivables().filter((row) => !row.qbo_invoice_id);
  const sent = listReceivables().filter((row) => row.qbo_invoice_id);
  const needsCustomer = listCustomersNeedingQbo();
  return (
    <>
      <PageHeader
        title="QuickBooks"
        subtitle="Customer invoices in QuickBooks."
      />
      <section className="card mb-4 p-5">
        <div className="text-sm font-semibold">Connection</div>
        <p className="mt-1 text-sm text-slate-600">
          Status: <span className="font-semibold">{qbo.status}</span>
          {qbo.companyName ? ` · ${qbo.companyName}` : ""}
          {qbo.configured ? " · live Online company" : qbo.oauthReady ? " · app keys set, not connected" : " · demo mode, no secrets"}
        </p>
        {qbo.error ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {qbo.error}
          </p>
        ) : null}
        {canConnect ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/settings/quickbooks" className="btn btn-secondary">
            Settings → QuickBooks
          </Link>
          {qbo.oauthReady && !qbo.configured ? (
            <a className="btn btn-primary" href="/api/integrations/quickbooks/connect">
              Connect QuickBooks
            </a>
          ) : null}
        </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Ask an Administrator to connect QuickBooks.</p>
        )}
      </section>

      {needsCustomer.length > 0 ? (
        <section className="card mb-4 overflow-hidden">
          <header className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-950">
            Needs QBO customer ({needsCustomer.length})
          </header>
          <ul className="divide-y divide-slate-100">
            {needsCustomer.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href={`/customers/${customer.id}`} className="font-semibold underline">
                  {customer.name}
                </Link>
                <span className="text-amber-800">No matching QuickBooks customer</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
          Ready to invoice ({ready.length})
        </header>
        <ul className="divide-y divide-slate-100">
          {ready.length === 0 ? (
            <li className="px-5 py-3 text-sm text-slate-500">No delivered loads waiting on an invoice.</li>
          ) : (
            ready.map((row) => (
              <li key={row.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <Link href={`/loads/${row.id}?tab=financials`} className="font-mono font-semibold underline">
                    {row.load_number}
                  </Link>
                  <span className="ml-2 text-slate-600">{row.customer_name}</span>
                </div>
                <div className="text-slate-700">{formatMoney(row.rate)}</div>
              </li>
            ))
          )}
        </ul>
        <header className="border-y border-slate-100 px-5 py-3 text-sm font-semibold">
          Already sent ({sent.length})
        </header>
        <ul className="divide-y divide-slate-100">
          {sent.length === 0 ? (
            <li className="px-5 py-3 text-sm text-slate-500">No QuickBooks invoices recorded yet.</li>
          ) : (
            sent.map((row) => (
              <li key={row.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href={`/loads/${row.id}?tab=financials`} className="font-mono font-semibold underline">
                  {row.load_number}
                </Link>
                <span className="text-slate-600">
                  QBO {row.qbo_invoice_number || row.invoiceLabel}
                  {row.qbo_source ? ` · ${row.qbo_source}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </>
  );
}
