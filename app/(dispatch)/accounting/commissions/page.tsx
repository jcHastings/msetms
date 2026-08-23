import Link from "next/link";
import { PaidToggle } from "@/components/accounting-forms";
import { PageHeader } from "@/components/page-header";
import { formatMoneyCents } from "@/lib/format";
import { listCommissions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function CommissionsPage() {
  const rows = listCommissions();
  const owed = rows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <PageHeader
        title="Commissions Mgt"
        subtitle="Optional agent/dispatcher % on the customer (default) or the load (override). Seeded example: Heartland Foods 5% default, MSE-1048 at 3% on the load."
      />

      <section className="card mb-6 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commission owed</div>
        <div className="mt-1 text-lg font-semibold">{formatMoneyCents(owed)}</div>
      </section>

      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>Rate</th>
              <th>%</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-slate-500">
                  No commissions. Set a % on a customer or a load.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.load_id}>
                  <td>
                    <Link href={`/loads/${row.load_id}`} className="font-semibold text-sky-800 underline">
                      {row.load_number}
                    </Link>
                  </td>
                  <td>{row.customer_name}</td>
                  <td>{formatMoneyCents(row.rate)}</td>
                  <td>{row.percent}%</td>
                  <td>{row.source === "load" ? "Load override" : "Customer default"}</td>
                  <td className="font-semibold">{formatMoneyCents(row.amount)}</td>
                  <td>{row.paid ? "Paid" : "Owed"}</td>
                  <td className="text-right">
                    <PaidToggle loadId={row.load_id} paid={row.paid} kind="commission" />
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
