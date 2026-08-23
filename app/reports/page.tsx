import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { dailyRecap, listAudit, onTimeReport, revenueByCustomer } from "@/lib/desk";
import { formatMoney } from "@/lib/format";
import { listLoads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const recap = dailyRecap();
  const onTime = onTimeReport();
  const revenue = revenueByCustomer();
  const audit = listAudit(20);
  const csv = listLoads({ status: "all" })
    .map((load) =>
      [
        load.load_number,
        load.status,
        load.customer_name,
        load.origin,
        load.destination,
        load.driver_name ?? "",
        load.truck_unit ?? "",
        load.rate ?? "",
      ].join(","),
    )
    .join("\n");
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    `load,status,customer,origin,destination,driver,truck,rate\n${csv}`,
  )}`;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="On-time, revenue by customer, daily recap, audit, and a loads CSV. Local numbers only."
        actions={
          <a href={csvHref} download="mse-loads.csv" className="btn btn-secondary">
            Download loads CSV
          </a>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <Stat label="Delivered today" value={String(recap.delivered)} />
        <Stat label="Late today" value={String(recap.late)} />
        <Stat label="On-time %" value={`${recap.onTimePct}%`} />
        <Stat label="Claims opened today" value={String(recap.claims)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Revenue by customer</header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Loads</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((row) => (
                <tr key={row.customer}>
                  <td>{row.customer}</td>
                  <td>{row.loads}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">On-time (delivered)</header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Load</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {onTime.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/loads/${row.id}`} className="font-mono underline">
                      {row.load_number}
                    </Link>
                  </td>
                  <td>{row.onTime ? "On time" : "Late"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-hidden xl:col-span-2">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Audit log</header>
          {audit.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No audited actions yet (clone, etc.).</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {audit.map((row) => (
                <li key={row.id} className="px-5 py-2">
                  <span className="font-medium">{row.action}</span> {row.entity} {row.entity_id}{" "}
                  <span className="text-slate-500">{row.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
