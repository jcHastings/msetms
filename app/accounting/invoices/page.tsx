import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { markReceivablePaidAction } from "@/lib/dispatcher-actions";
import { listReceivables } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";
import { getCompanySettings, taxOnAmount } from "@/lib/settings";
import { LoadStatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  const rows = listReceivables();
  const settings = getCompanySettings();
  return (
    <>
      <PageHeader
        title="Invoices (AR)"
        subtitle="Delivered and completed loads. Bill the customer rate. Mark paid locally, or send from QuickBooks on the load."
        actions={
          <Link href="/accounting/quickbooks" className="btn btn-secondary">
            QuickBooks
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>Amount</th>
              {settings.tax_enabled ? <th>Tax</th> : null}
              <th>Invoice</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tax = taxOnAmount(row.rate);
              return (
              <tr key={row.id}>
                <td>
                  <Link href={`/loads/${row.id}`} className="font-mono font-semibold underline">
                    {row.load_number}
                  </Link>
                  <div className="mt-1">
                    <LoadStatusBadge status={row.status} />
                  </div>
                </td>
                <td>{row.customer_name}</td>
                <td>{formatMoney(row.rate, settings.currency)}</td>
                {settings.tax_enabled ? (
                  <td>
                    {formatMoney(tax.tax, settings.currency)}
                    <div className="text-xs text-slate-500">
                      {tax.label} {tax.rate}%
                    </div>
                  </td>
                ) : null}
                <td className="text-slate-600">{row.invoiceLabel}</td>
                <td>{row.paid ? "Paid" : "Open"}</td>
                <td className="text-right">
                  {row.paid ? null : (
                    <form action={markReceivablePaidAction}>
                      <input type="hidden" name="load_id" value={row.id} />
                      <button className="btn btn-secondary" type="submit">
                        Mark paid
                      </button>
                    </form>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
