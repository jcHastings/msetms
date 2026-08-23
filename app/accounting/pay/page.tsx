import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listDriverPay } from "@/lib/accounting";
import { paySettlementAction } from "@/lib/dispatcher-actions";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function DriverPayPage() {
  const rows = listDriverPay();
  return (
    <>
      <PageHeader
        title="Driver pay"
        subtitle="Owner-operator settlements from the load (rate × %). Company drivers stay N/A. Not a QBO bill."
      />
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No delivered owner-operator loads yet.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                <th>Load</th>
                <th>Driver</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.load.id}>
                  <td>
                    <Link href={`/loads/${row.load.id}`} className="font-mono font-semibold underline">
                      {row.load.load_number}
                    </Link>
                  </td>
                  <td>{row.driverName}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{row.settlement?.status === "paid" ? "Paid" : "Open"}</td>
                  <td className="text-right">
                    {row.settlement?.status === "paid" ? null : (
                      <form action={paySettlementAction}>
                        <input type="hidden" name="load_id" value={row.load.id} />
                        <button className="btn btn-secondary" type="submit">
                          Mark paid
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
