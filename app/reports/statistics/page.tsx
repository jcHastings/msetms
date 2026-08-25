import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { canViewReports, getPageAccess, listDispatchers } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";
import { buildStatistics, listStatisticsDrill, statsPct, type StatsMetrics } from "@/lib/reports-stats";
import {
  REPORT_CATEGORIES,
  REPORT_DATE_BASES,
  STATS_METRIC_ROWS,
  reportMonthLabel,
  type ReportCategory,
  type ReportDateBasis,
  type StatsMetricKey,
} from "@/lib/reports-shared";

export const dynamic = "force-dynamic";

function formatMetric(key: StatsMetricKey, metrics: StatsMetrics): string {
  if (key === "loads") return String(metrics.loads);
  if (key === "miles" || key === "emptyMiles") {
    const value = key === "miles" ? metrics.miles : metrics.emptyMiles;
    return value ? value.toLocaleString("en-US") : "0";
  }
  if (key === "pct") {
    const pct = statsPct(metrics);
    return pct == null ? "—" : `${pct}%`;
  }
  const amount = key === "gross" ? metrics.gross : key === "fees" ? metrics.fees : metrics.net;
  return formatMoney(amount);
}

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
  const maxGross = Math.max(1, ...stats.months.map((key) => stats.cells[key].gross));
  const dimension = REPORT_CATEGORIES.find((item) => item.value === category)?.label ?? "Driver";
  const selectedName =
    selectedEntity == null
      ? `All ${dimension.toLowerCase()}s`
      : stats.rows[0]?.name || `${dimension} ${selectedEntity}`;
  const queryBase = `/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}`;

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle="13-month Advanced Statistics. Metrics are rows, months are columns. Driver revenue splits by that driver's miles on relay loads. The customer invoice stays one amount."
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
            <option value="">Show All</option>
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
        <h2 className="text-sm font-semibold">13-month Gross Rev — {selectedName}</h2>
        <div className="mt-3 flex h-40 items-end gap-1">
          {stats.months.map((key) => {
            const total = stats.cells[key].gross;
            const height = Math.max(4, Math.round((total / maxGross) * 140));
            return (
              <Link
                key={key}
                href={`${queryBase}&month=${key}`}
                className={`flex flex-1 flex-col items-center justify-end ${month === key ? "opacity-100" : "opacity-80"}`}
                title={`${reportMonthLabel(key)}: ${formatMoney(total)}`}
              >
                <span className={`w-full rounded-t ${month === key ? "bg-gold" : "bg-navy"}`} style={{ height }} />
                <span className="mt-1 text-[10px] text-slate-500">{reportMonthLabel(key)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
          {selectedName} — click a month for the per-load breakdown
        </header>
        <table className="table-grid stats-matrix" data-stats-matrix="">
          <thead>
            <tr>
              <th>Metric</th>
              {stats.months.map((key) => (
                <th key={key} className={month === key ? "bg-amber-50" : undefined}>
                  <Link href={`${queryBase}&month=${key}`} className="underline">
                    {reportMonthLabel(key)}
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
              STATS_METRIC_ROWS.map((metric) => (
                <tr key={metric.key}>
                  <td className="font-semibold">{metric.label}</td>
                  {stats.months.map((key) => (
                    <td key={key} className={month === key ? "bg-amber-50/70" : undefined}>
                      {formatMetric(metric.key, stats.cells[key])}
                    </td>
                  ))}
                  <td className="font-semibold">{formatMetric(metric.key, stats.totals)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {selectedEntity == null && stats.rows.length > 0 ? (
        <section className="card mt-4 overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
            {dimension}s in this window — open one to see that matrix
          </header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>{dimension}</th>
                <th>Loads</th>
                <th>Miles</th>
                <th>Empty</th>
                <th>Gross Rev</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((row) => (
                <tr key={`${row.id}-${row.name}`}>
                  <td>
                    <Link
                      href={`/reports/statistics?category=${category}&entityId=${row.id ?? ""}&dateBasis=${dateBasis}`}
                      className="underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td>{row.totals.loads}</td>
                  <td>{row.totals.miles ? row.totals.miles.toLocaleString("en-US") : "0"}</td>
                  <td>{row.totals.emptyMiles ? row.totals.emptyMiles.toLocaleString("en-US") : "0"}</td>
                  <td>{formatMoney(row.totals.gross)}</td>
                  <td>{formatMoney(row.totals.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {month ? (
        <section className="card mt-4 overflow-hidden" data-stats-drill="">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
            {reportMonthLabel(month)} breakdown — {selectedName}. Relay legs split by miles; load # opens the load.
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
              {drill.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-sm text-slate-500">
                    No loads in {reportMonthLabel(month)}.
                  </td>
                </tr>
              ) : (
                drill.map((row, index) => (
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
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
