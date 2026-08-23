import Link from "next/link";
import { PaidToggle } from "@/components/accounting-forms";
import { DriverKindBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { formatMoneyCents } from "@/lib/format";
import { listDriverPay } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function DriverPayPage() {
  const rows = listDriverPay();
  const ownerOps = rows.filter((row) => row.driver_type === "owner_operator");
  const company = rows.filter((row) => row.driver_type !== "owner_operator");
  const ooOwed = ownerOps.filter((row) => !row.paid).reduce((sum, row) => sum + (row.oo_pay ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Driver Pay Mgt"
        subtitle="Owner-operators: rate, %, computed pay, paid/unpaid. Company drivers: a simple per-load paid flag — no payroll formula in this first version."
      />

      <section className="card mb-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Owner-operators</h2>
            <p className="text-sm text-slate-600">
              Unpaid OO pay {formatMoneyCents(ooOwed)}
            </p>
          </div>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Driver</th>
              <th>Customer rate</th>
              <th>%</th>
              <th>Computed pay</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ownerOps.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-slate-500">
                  No delivered owner-operator loads.
                </td>
              </tr>
            ) : (
              ownerOps.map((row) => (
                <tr key={row.load_id}>
                  <td>
                    <Link href={`/loads/${row.load_id}`} className="font-semibold text-sky-800 underline">
                      {row.load_number}
                    </Link>
                  </td>
                  <td>
                    <div>{row.driver_name}</div>
                    {row.driver_type ? <DriverKindBadge type={row.driver_type} /> : null}
                  </td>
                  <td>{formatMoneyCents(row.rate)}</td>
                  <td>{row.oo_percent != null ? `${row.oo_percent}%` : "—"}</td>
                  <td className="font-semibold">{formatMoneyCents(row.oo_pay)}</td>
                  <td>{row.paid ? "Paid" : "Unpaid"}</td>
                  <td className="text-right">
                    <PaidToggle loadId={row.load_id} paid={row.paid} kind="driver" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Company drivers</h2>
          <p className="mt-1 text-sm text-slate-600">
            Placeholder. Mark the load paid when you settle company pay outside this app.
          </p>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load</th>
              <th>Driver</th>
              <th>Customer</th>
              <th>Rate</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {company.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-slate-500">
                  No delivered company-driver loads.
                </td>
              </tr>
            ) : (
              company.map((row) => (
                <tr key={row.load_id}>
                  <td>
                    <Link href={`/loads/${row.load_id}`} className="font-semibold text-sky-800 underline">
                      {row.load_number}
                    </Link>
                  </td>
                  <td>
                    <div>{row.driver_name}</div>
                    {row.driver_type ? <DriverKindBadge type={row.driver_type} /> : null}
                  </td>
                  <td>{row.customer_name}</td>
                  <td>{formatMoneyCents(row.rate)}</td>
                  <td>{row.paid ? "Paid" : "Unpaid"}</td>
                  <td className="text-right">
                    <PaidToggle loadId={row.load_id} paid={row.paid} kind="driver" />
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
