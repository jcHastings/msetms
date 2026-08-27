import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listCommissions } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function CommissionsPage() {
  const rows = listCommissions();
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <>
      <PageHeader
        title="Commissions"
      />
      <p className="mb-3 text-sm text-slate-600">
        Total this book: <span className="font-semibold">{formatMoney(total)}</span>
      </p>
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>Rate</th>
              <th>%</th>
              <th>Commission</th>
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
                <td>{row.load.customer_name}</td>
                <td>{formatMoney(row.load.rate)}</td>
                <td>{row.percent}%</td>
                <td>{formatMoney(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
