import Link from "next/link";
import { CreateInvoiceForm, InvoiceStatusButtons } from "@/components/accounting-forms";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoneyCents } from "@/lib/format";
import { listDeliveredLoadsWithoutInvoice, listInvoices } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  const invoices = listInvoices();
  const createFrom = listDeliveredLoadsWithoutInvoice();

  return (
    <>
      <PageHeader
        title="Invoices/Bills"
        subtitle="Customer invoices from delivered loads at the customer rate. Create a local draft, mark it sent or paid, or send it from QuickBooks."
      />

      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Create invoice from a delivered load</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Amount is the customer rate. Owner-operator pay stays on Driver Pay / AP.
        </p>
        <CreateInvoiceForm loads={createFrom} />
      </section>

      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer / load</th>
              <th>Amount</th>
              <th>Issued / due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-slate-500">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <div className="font-semibold">{invoice.number}</div>
                    <div className="text-xs text-slate-500">
                      {invoice.source === "local"
                        ? "Local"
                        : invoice.source === "demo"
                          ? "Demo QuickBooks"
                          : "QuickBooks"}
                      {invoice.qbo_invoice_number ? ` · ${invoice.qbo_invoice_number}` : ""}
                    </div>
                  </td>
                  <td>
                    <div>{invoice.customer_name}</div>
                    <Link href={`/loads/${invoice.load_id}`} className="text-xs text-sky-800 underline">
                      {invoice.load_number}
                    </Link>
                  </td>
                  <td className="font-semibold">{formatMoneyCents(invoice.amount)}</td>
                  <td>
                    <div>{formatDate(invoice.issued_at)}</div>
                    <div className="text-xs text-slate-500">
                      Due {invoice.due_at ? formatDate(invoice.due_at) : "—"}
                    </div>
                  </td>
                  <td>
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="text-right">
                    <InvoiceStatusButtons invoiceId={invoice.id} status={invoice.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
