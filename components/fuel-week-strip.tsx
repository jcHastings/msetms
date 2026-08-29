import { formatFuelMoney, formatMdYDisplay } from "@/lib/format";
import type { FuelWeekPaidStats } from "@/lib/fuel";

function formatPpg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function WeekStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function FuelWeekStrip({ stats }: { stats: FuelWeekPaidStats }) {
  const range = `${formatMdYDisplay(stats.weekStartYmd)} – ${formatMdYDisplay(stats.weekEndYmd)}`;
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-week-strip="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">This week</h2>
        <p className="mt-1 text-xs text-slate-500">{range}</p>
      </header>
      {stats.count === 0 ? (
        <p className="p-5 text-sm text-slate-600">No diesel this week.</p>
      ) : (
        <>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <WeekStat label="Lowest paid" value={formatFuelMoney(stats.minAmount)} />
            <WeekStat label="Highest paid" value={formatFuelMoney(stats.maxAmount)} />
            <WeekStat label="Average paid" value={formatFuelMoney(stats.avgAmount)} />
          </div>
          {stats.ppgCount > 0 ? (
            <div className="grid gap-4 border-t border-slate-100 px-5 py-3 sm:grid-cols-3">
              <WeekStat label="Lowest PPG" value={formatPpg(stats.minPpg)} />
              <WeekStat label="Highest PPG" value={formatPpg(stats.maxPpg)} />
              <WeekStat label="Average PPG" value={formatPpg(stats.avgPpg)} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
