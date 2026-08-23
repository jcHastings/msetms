import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listReceivables } from "@/lib/accounting";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuickbooksAccountingPage() {
  const qbo = await getQuickbooksStatus();
  const ready = listReceivables().filter((row) => !row.qbo_invoice_id);
  const sent = listReceivables().filter((row) => row.qbo_invoice_id);
  return (
    <>
      <PageHeader
        title="QuickBooks"
        subtitle="Customer invoices only. Credentials stay in gitignored .env. Failed live calls are errors, not fake invoices."
      />
      <section className="card mb-4 p-5">
        <div className="text-sm font-semibold">Connection</div>
        <p className="mt-1 text-sm text-slate-600">
          Status: <span className="font-semibold">{qbo.status}</span>
          {qbo.configured ? " · credentials set (hidden)" : " · demo mode, no secrets"}
        </p>
        {qbo.error ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {qbo.error}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-slate-500">
          Send from a delivered load. Owner-operator pay is never invoiced.
        </p>
      </section>
      <section className="card overflow-hidden">
        <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
          Ready to invoice ({ready.length})
        </header>
        <ul className="divide-y divide-slate-100">
          {ready.map((row) => (
            <li key={row.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <Link href={`/loads/${row.id}`} className="font-mono font-semibold underline">
                  {row.load_number}
                </Link>
                <span className="ml-2 text-slate-600">{row.customer_name}</span>
              </div>
              <div className="text-slate-700">{formatMoney(row.rate)}</div>
            </li>
          ))}
        </ul>
        <header className="border-y border-slate-100 px-5 py-3 text-sm font-semibold">
          Already sent ({sent.length})
        </header>
        <ul className="divide-y divide-slate-100">
          {sent.map((row) => (
            <li key={row.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <Link href={`/loads/${row.id}`} className="font-mono font-semibold underline">
                {row.load_number}
              </Link>
              <span className="text-slate-600">{row.invoiceLabel}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
