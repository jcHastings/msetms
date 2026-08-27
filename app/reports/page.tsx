import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { dailyRecap, onTimeReport, revenueByCustomer } from "@/lib/desk";
import { canExportCsv, canViewReports, getPageAccess } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";
import { listLoads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const dispatcher = await getPageAccess(canViewReports);
  if (!dispatcher) {
    return <AccessDenied message="Reports are for Administrator." />;
  }
  const recap = dailyRecap();
  const onTime = onTimeReport();
  const revenue = revenueByCustomer();
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/reports/manage" className="btn btn-secondary">
              Manage reports
            </Link>
            <Link href="/reports/statistics" className="btn btn-secondary">
              Statistics
            </Link>
            {canExportCsv(dispatcher.role) ? (
              <a href={csvHref} download="mse-loads.csv" className="btn btn-secondary">
                Download loads CSV
              </a>
            ) : null}
          </div>
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
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Accountability</header>
          <p className="p-5 text-sm text-slate-600">
            Load changes are on the{" "}
            <Link href="/audit" className="font-medium text-navy hover:underline">
              Audit
            </Link>{" "}
            page (filter by load #, user, and date). Each load also has a History section.
          </p>
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
