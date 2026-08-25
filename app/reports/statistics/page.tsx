import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatsFilters } from "@/components/stats-filters";
import { canViewReports, getPageAccess, listDispatchers } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";
import {
  buildStatistics,
  groupStatisticsDrill,
  listStatisticsDrill,
  statsPct,
  type StatsMetrics,
} from "@/lib/reports-stats";
import {
  REPORT_CATEGORIES,
  STATS_METRIC_ROWS,
  formatStatsCompact,
  reportMonthLabel,
  type ReportCategory,
  type ReportDateBasis,
  type StatsMetricKey,
} from "@/lib/reports-shared";

export const dynamic = "force-dynamic";

function formatMetric(key: StatsMetricKey, metrics: StatsMetrics): string {
  if (key === "loads") return metrics.loads ? String(metrics.loads) : "—";
  if (key === "miles" || key === "emptyMiles") {
    const value = key === "miles" ? metrics.miles : metrics.emptyMiles;
    return value ? formatStatsCompact(value) : "—";
  }
  if (key === "pct") {
    const pct = statsPct(metrics);
    return pct == null ? "—" : `${pct}%`;
  }
  const amount = key === "gross" ? metrics.gross : key === "fees" ? metrics.fees : metrics.net;
  return amount ? formatStatsCompact(amount) : "—";
}

function formatShare(share: number | null): string {
  if (share == null) return "—";
  return `${(share * 100).toFixed(2)}%`;
}

function barHeight(value: number, max: number): number {
  if (!max || !value) return 4;
  return Math.max(6, Math.round((value / max) * 150));
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; entityId?: string; dateBasis?: string; month?: string; shift?: string }>;
}) {
  const dispatcher = await getPageAccess(canViewReports);
  if (!dispatcher) return <AccessDenied message="Reports are for Administrator." />;
  const params = await searchParams;
  const category = (REPORT_CATEGORIES.some((item) => item.value === params.category) ? params.category : "driver") as ReportCategory;
  const dateBasis = (["pickup", "delivery", "invoice"].includes(params.dateBasis ?? "") ? params.dateBasis : "pickup") as ReportDateBasis;
  const entityId = Number.parseInt(params.entityId ?? "", 10);
  const selectedEntity = Number.isFinite(entityId) ? entityId : null;
  const shift = Math.max(0, Number.parseInt(params.shift ?? "", 10) || 0);
  const end = new Date();
  end.setMonth(end.getMonth() - shift);
  const stats = buildStatistics({ category, entityId: selectedEntity, dateBasis, end });
  const month = params.month && stats.months.includes(params.month) ? params.month : "";
  const drill = month ? listStatisticsDrill({ category, entityId: selectedEntity, month, dateBasis }) : [];
  const groups = groupStatisticsDrill(drill);
  const maxMoney = Math.max(1, ...stats.months.map((key) => Math.max(stats.cells[key].gross, stats.cells[key].net)));
  const maxMiles = Math.max(1, ...stats.months.map((key) => stats.cells[key].miles));
  const dimension = REPORT_CATEGORIES.find((item) => item.value === category)?.label ?? "Driver";
  const selectedName =
    selectedEntity == null ? `All ${dimension.toLowerCase()}s` : stats.rows[0]?.name || `${dimension} ${selectedEntity}`;
  const queryBase = `/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}&shift=${shift}`;

  return (
    <>
      <PageHeader
        title="Advanced Statistics"
        subtitle="13-month matrix. Driver revenue splits by that driver's miles on relay loads. The customer invoice stays one amount."
      />
      <StatsFilters
        category={category}
        entityId={selectedEntity}
        dateBasis={dateBasis}
        shift={shift}
        customers={listCustomers().map((item) => ({ id: item.id, label: item.name }))}
        drivers={listDrivers().map((item) => ({ id: item.id, label: item.name }))}
        trucks={listTrucks().map((item) => ({ id: item.id, label: item.unit_number }))}
        dispatchers={listDispatchers().map((item) => ({ id: item.id, label: item.name }))}
      />

      <section className="card mb-0 overflow-hidden rounded-b-none border-b-0 p-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}&shift=${shift + 1}`}
            className="stats-nav-arrow"
            aria-label="Older months"
          >
            ‹
          </Link>
          <div className="stats-chart" data-stats-chart="">
            {stats.months.map((key) => {
              const cell = stats.cells[key];
              return (
                <Link
                  key={key}
                  href={`${queryBase}&month=${key}`}
                  className={`stats-cluster ${month === key ? "is-active" : ""}`}
                  title={`${reportMonthLabel(key)} · Gross ${formatMoney(cell.gross)} · Net ${formatMoney(cell.net)} · ${cell.miles || 0} mi`}
                >
                  <span className="stats-cluster-bars">
                    <span className="stats-bar stats-bar-miles" style={{ height: barHeight(cell.miles, maxMiles) }} />
                    <span className="stats-bar stats-bar-gross" style={{ height: barHeight(cell.gross, maxMoney) }} />
                    <span className="stats-bar stats-bar-net" style={{ height: barHeight(cell.net, maxMoney) }} />
                  </span>
                  <span className="stats-cluster-label">{reportMonthLabel(key)}</span>
                </Link>
              );
            })}
          </div>
          {shift > 0 ? (
            <Link
              href={`/reports/statistics?category=${category}&entityId=${selectedEntity ?? ""}&dateBasis=${dateBasis}&shift=${shift - 1}`}
              className="stats-nav-arrow"
              aria-label="Newer months"
            >
              ›
            </Link>
          ) : (
            <span className="stats-nav-arrow is-disabled" aria-hidden>
              ›
            </span>
          )}
        </div>
      </section>

      <section className="card overflow-x-auto rounded-t-none">
        <table className="table-grid stats-matrix" data-stats-matrix="">
          <thead>
            <tr>
              <th>{selectedName}</th>
              {stats.months.map((key) => (
                <th key={key} className={month === key ? "bg-amber-50" : undefined}>
                  {reportMonthLabel(key)}
                </th>
              ))}
              <th>Totals</th>
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
              <>
                <tr>
                  <td className="font-semibold">Breakdown</td>
                  {stats.months.map((key) => (
                    <td key={key} className={month === key ? "bg-amber-50/70" : undefined}>
                      <Link href={`${queryBase}&month=${key}`} className="stats-breakdown-icon" title={`Open ${reportMonthLabel(key)} loads`}>
                        ▦
                      </Link>
                    </td>
                  ))}
                  <td>—</td>
                </tr>
                {STATS_METRIC_ROWS.map((metric) => (
                  <tr key={metric.key}>
                    <td className="font-semibold">
                      <span className="stats-swatch" style={{ background: metric.color }} />
                      {metric.label}
                    </td>
                    {stats.months.map((key) => (
                      <td key={key} className={month === key ? "bg-amber-50/70" : undefined}>
                        {formatMetric(metric.key, stats.cells[key])}
                      </td>
                    ))}
                    <td className="font-semibold">{formatMetric(metric.key, stats.totals)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </section>

      {month ? (
        <section className="card mt-4 overflow-hidden" data-stats-drill="">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold">
              {reportMonthLabel(month)} load breakdown — {selectedName}. Relay legs split by miles.
            </h2>
            <Link href={queryBase} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Close
            </Link>
          </header>
          <div className="overflow-x-auto">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>{dimension}</th>
                  <th>Load #</th>
                  <th>Customer</th>
                  <th>Lane</th>
                  <th>Miles</th>
                  <th>Empty M</th>
                  <th>Gross Rev.</th>
                  <th>Fees</th>
                  <th>Net Rev.</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-sm text-slate-500">
                      No loads in {reportMonthLabel(month)}.
                    </td>
                  </tr>
                ) : (
                  groups.flatMap((group) => [
                    ...group.rows.map((row, index) => (
                      <tr key={`${row.loadId}-${row.entityId}-${index}`}>
                        <td className={index === 0 ? "font-semibold" : "text-slate-400"}>
                          {index === 0 ? group.entityName : ""}
                        </td>
                        <td>
                          <Link href={`/loads/${row.loadId}`} className="font-mono text-navy underline">
                            {row.loadNumber}
                          </Link>
                        </td>
                        <td>{row.customer || "—"}</td>
                        <td>
                          {row.origin} → {row.destination}
                        </td>
                        <td>{row.miles ?? "—"}</td>
                        <td>{row.emptyMiles ?? "—"}</td>
                        <td>{row.allocatedRevenue != null ? formatMoney(row.allocatedRevenue) : "—"}</td>
                        <td>{row.fees != null && row.fees ? formatMoney(row.fees) : "—"}</td>
                        <td>
                          {row.allocatedRevenue != null
                            ? formatMoney(row.allocatedRevenue - (row.fees ?? 0))
                            : "—"}
                        </td>
                        <td>{formatShare(row.share)}</td>
                      </tr>
                    )),
                    <tr key={`${group.entityId}-${group.entityName}-total`} className="stats-total-row">
                      <td className="font-semibold">Totals</td>
                      <td />
                      <td />
                      <td />
                      <td className="font-semibold">{group.miles || "—"}</td>
                      <td className="font-semibold">{group.emptyMiles || "—"}</td>
                      <td className="font-semibold">{formatMoney(group.gross)}</td>
                      <td className="font-semibold">{group.fees ? formatMoney(group.fees) : "—"}</td>
                      <td className="font-semibold">{formatMoney(group.net)}</td>
                      <td />
                    </tr>,
                  ])
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
