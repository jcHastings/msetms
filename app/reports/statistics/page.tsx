import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { canViewReports, getPageAccess, listDispatchers } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";
import { buildStatistics, listStatisticsDrill } from "@/lib/reports-stats";
import { REPORT_CATEGORIES, REPORT_DATE_BASES, type ReportCategory, type ReportDateBasis } from "@/lib/reports-shared";

export const dynamic = "force-dynamic";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; entityId?: string; dateBasis?: string; month?: string }>;
}) {
  const dispatcher = await getPageAccess(canViewReports);
  if (!dispatcher) return <AccessDenied message="Reports are for Administrator." />;
  const params = await searchParams;
  const category = (REPORT_CATEGORIES.some((item) => item.value === params.category) ? params.category : "driver") as ReportCategory;
  const dateBasis = (REPORT_DATE_BASES.some((item) => item.value === params.dateBasis) ? params.dateBasis : "pickup") as ReportDateBasis;
  const entityId = Number.parseInt(params.entityId ?? "", 10);
  const selectedEntity = Number.isFinite(entityId) ? entityId : null;
  const stats = buildStatistics({ category, entityId: selectedEntity, dateBasis });
  const month = params.month && stats.months.includes(params.month) ? params.month : "";
  const drill = month ? listStatisticsDrill({ category, entityId: selectedEntity, month, dateBasis }) : [];
  const maxGross = Math.max(1, ...stats.months.map((key) => stats.rows.reduce((sum, row) => sum + row.months[key].gross, 0)));

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle="13-month matrix. Driver revenue splits by that driver's miles on relay loads. The customer invoice stays one amount."
      />
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-4" method="get">
        <div className="field">
          <label htmlFor="stats-category">Dimension</label>
          <select id="stats-category" name="category" defaultValue={category}>
            {REPORT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="stats-entity">Show</label>
          <select id="stats-entity" name="entityId" defaultValue={selectedEntity ?? ""}>
            <option value="">All</option>
            {category === "customer"
              ? listCustomers().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              : null}
            {category === "driver"
              ? listDrivers().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              : null}
            {category === "truck"
              ? listTrucks().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.unit_number}
                  </option>
                ))
              : null}
            {category === "dispatcher"
              ? listDispatchers().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              : null}
          </select>
        </div>
        <div className="field">
          <label htmlFor="stats-basis">Filter by</label>
          <select id="stats-basis" name="dateBasis" defaultValue={dateBasis}>
            {REPORT_DATE_BASES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-primary" type="submit">
            Apply
          </button>
        </div>
      </form>

      <section className="card mb-4 p-4">
        <h2 className="text-sm font-semibold">13-month gross</h2>
        <div className="mt-3 flex h-40 items-end gap-1">
          {stats.months.map((key) => {
            const total = stats.rows.reduce((sum, row) => sum + row.months[key].gross, 0);
            const height = Math.max(4, Math.round((total / maxGross) * 140));
            return (
              <Link
                key={key}
                href={`/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}&month=${key}`}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${key}: ${formatMoney(total)}`}
              >
                <span className="w-full rounded-t bg-navy" style={{ height }} />
                <span className="mt-1 text-[10px] text-slate-500">{key.slice(5)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="table-grid">
          <thead>
            <tr>
              <th>{REPORT_CATEGORIES.find((item) => item.value === category)?.label}</th>
              {stats.months.map((key) => (
                <th key={key}>
                  <Link
                    href={`/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}&month=${key}`}
                    className="underline"
                  >
                    {key}
                  </Link>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {stats.rows.length === 0 ? (
              <tr>
                <td colSpan={stats.months.length + 2} className="text-sm text-slate-500">
                  No loads in this 13-month window.
                </td>
              </tr>
            ) : (
              stats.rows.map((row) => (
                <tr key={`${row.id}-${row.name}`}>
                  <td className="font-semibold">{row.name}</td>
                  {stats.months.map((key) => (
                    <td key={key}>
                      <div>{row.months[key].loads} ld</div>
                      <div>{row.months[key].miles || "—"} mi</div>
                      <div>{formatMoney(row.months[key].gross)}</div>
                    </td>
                  ))}
                  <td>
                    <div>{row.totals.loads} ld</div>
                    <div>{row.totals.miles || "—"} mi</div>
                    <div>{formatMoney(row.totals.gross)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {month ? (
        <section className="card mt-4 overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
            {month} breakdown — relay legs split by miles
          </header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Load</th>
                <th>Lane</th>
                <th>Miles</th>
                <th>Empty</th>
                <th>Load rate</th>
                <th>Allocated</th>
              </tr>
            </thead>
            <tbody>
              {drill.map((row, index) => (
                <tr key={`${row.loadId}-${index}`}>
                  <td>
                    <Link href={`/loads/${row.loadId}`} className="font-mono underline">
                      {row.loadNumber}
                    </Link>
                  </td>
                  <td>
                    {row.origin} → {row.destination}
                  </td>
                  <td>{row.miles ?? "—"}</td>
                  <td>{row.emptyMiles ?? "—"}</td>
                  <td>{formatMoney(row.revenue)}</td>
                  <td>{row.allocatedRevenue != null ? formatMoney(row.allocatedRevenue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
