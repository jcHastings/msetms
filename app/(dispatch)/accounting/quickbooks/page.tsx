import Link from "next/link";
import { QuickbooksSendRow } from "@/components/quickbooks-send-row";
import { QuickbooksSettingsCard } from "@/components/quickbooks-settings-card";
import { PageHeader } from "@/components/page-header";
import { formatMoneyCents } from "@/lib/format";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";
import { listLoads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function QuickbooksAccountingPage() {
  const qbo = await getQuickbooksStatus();
  const delivered = listLoads({ status: "delivered" });

  return (
    <>
      <PageHeader
        title="QuickBooks"
        subtitle="Same send-to-QuickBooks flow as the load page, plus credential status. Secrets stay in local env and are never printed."
      />

      <div className="mb-6">
        <QuickbooksSettingsCard qbo={qbo} />
      </div>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Send a delivered load</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bills the customer rate. You can also send from the load.{" "}
            <Link href="/settings" className="text-sky-800 underline">
              Integrations settings
            </Link>
          </p>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>QuickBooks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {delivered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-slate-500">
                  No delivered loads.
                </td>
              </tr>
            ) : (
              delivered.map((load) => (
                <tr key={load.id}>
                  <td>
                    <Link href={`/loads/${load.id}`} className="font-semibold text-sky-800 underline">
                      {load.load_number}
                    </Link>
                  </td>
                  <td>{load.customer_name}</td>
                  <td>{formatMoneyCents(load.rate)}</td>
                  <td>
                    {load.qbo_invoice_id
                      ? `${load.qbo_source === "demo" ? "Demo" : "QBO"} ${load.qbo_invoice_number || load.qbo_invoice_id}`
                      : "Not sent"}
                  </td>
                  <td className="text-right">
                    <QuickbooksSendRow
                      loadId={load.id}
                      alreadySent={Boolean(load.qbo_invoice_id)}
                      invoiceLabel={load.qbo_invoice_number || load.qbo_invoice_id}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
