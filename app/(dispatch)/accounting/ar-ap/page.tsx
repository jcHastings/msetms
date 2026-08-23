import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { AGING_BUCKETS, agingBucket, agingTotals, invoiceAgeDays } from "@/lib/accounting";
import { formatDate, formatMoneyCents } from "@/lib/format";
import { listPayables, listUnpaidInvoices } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function ArApPage() {
  const unpaid = listUnpaidInvoices();
  const totals = agingTotals(unpaid);
  const payables = listPayables();
  const apOpen = payables.filter((row) => !row.paid);
  const apTotal = apOpen.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <PageHeader
        title="AR/AP Report"
        subtitle="AR is unpaid customer invoices (draft or sent) aged from the issue date. AP is a stub of owner-operator bills from load OO pay."
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AR {bucket}</div>
            <div className="mt-1 text-lg font-semibold">{formatMoneyCents(totals[bucket])}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open AP</div>
          <div className="mt-1 text-lg font-semibold">{formatMoneyCents(apTotal)}</div>
        </div>
      </section>

      <section className="card mb-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Accounts receivable — unpaid customer invoices</h2>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer / load</th>
              <th>Amount</th>
              <th>Issued</th>
              <th>Age</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {unpaid.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-slate-500">
                  No unpaid customer invoices.
                </td>
              </tr>
            ) : (
              unpaid.map((invoice) => {
                const days = invoiceAgeDays(invoice.issued_at);
                return (
                  <tr key={invoice.id}>
                    <td className="font-semibold">{invoice.number}</td>
                    <td>
                      <div>{invoice.customer_name}</div>
                      <Link href={`/loads/${invoice.load_id}`} className="text-xs text-sky-800 underline">
                        {invoice.load_number}
                      </Link>
                    </td>
                    <td>{formatMoneyCents(invoice.amount)}</td>
                    <td>{formatDate(invoice.issued_at)}</td>
                    <td>
                      {days}d
                      <span className="ml-1 text-xs text-slate-500">{agingBucket(days)}</span>
                    </td>
                    <td>
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Accounts payable — owner-operator bills (stub)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Built from OO pay stored on loads. Not a full carrier bill book.
          </p>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Driver</th>
              <th>Customer</th>
              <th>Bill amount</th>
              <th>Delivered</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payables.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-slate-500">
                  No owner-operator bills yet. Assign an OO on a load with a rate to see one here.
                </td>
              </tr>
            ) : (
              payables.map((row) => (
                <tr key={row.load_id}>
                  <td>
                    <Link href={`/loads/${row.load_id}`} className="font-semibold text-sky-800 underline">
                      {row.load_number}
                    </Link>
                  </td>
                  <td>{row.driver_name || "—"}</td>
                  <td>{row.customer_name}</td>
                  <td>{formatMoneyCents(row.amount)}</td>
                  <td>{formatDate(row.delivered_at)}</td>
                  <td>{row.paid ? "Paid" : "Unpaid"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
