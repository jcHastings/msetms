import { formatFuelMoney, formatMdYDisplay } from "@/lib/format";
import type { FuelPageView, FuelTxListKind, FuelWeekOption, FuelWeekPaidStats } from "@/lib/fuel";

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

function hiddenIf(name: string, value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return <input type="hidden" name={name} value={String(value)} />;
}

export function FuelWeekStrip({
  stats,
  weeks,
  selectedWeek,
  current,
  query,
}: {
  stats: FuelWeekPaidStats;
  weeks: FuelWeekOption[];
  selectedWeek: string;
  current: boolean;
  query?: {
    view?: FuelPageView;
    tx?: FuelTxListKind;
    mpg?: "week" | "month";
    driverId?: number | null;
    truckId?: number | null;
  };
}) {
  const range = `${formatMdYDisplay(stats.weekStartYmd)} – ${formatMdYDisplay(stats.weekEndYmd)}`;
  return (
    <section
      className="card mb-6 overflow-hidden"
      data-fuel-week-strip=""
      data-fuel-week={selectedWeek}
      data-fuel-week-reports={weeks.map((week) => week.startYmd).join(",")}
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{current ? "This week" : "Saved week"}</h2>
          <p className="mt-1 text-xs text-slate-500">{range}</p>
        </div>
        <form action="/fuel" method="get" className="flex flex-wrap items-end gap-2" data-fuel-week-picker="">
          {hiddenIf("view", query?.view && query.view !== "tx" ? query.view : null)}
          {hiddenIf("tx", query?.tx && query.tx !== "truck_diesel" ? query.tx : null)}
          {hiddenIf("mpg", query?.mpg === "month" ? "month" : null)}
          {hiddenIf("driver", query?.driverId)}
          {hiddenIf("truck", query?.truckId)}
          <div className="field min-w-[14rem]">
            <label htmlFor="fuel-week">Saved weeks</label>
            <select id="fuel-week" name="week" defaultValue={selectedWeek}>
              {weeks.map((week) => (
                <option key={week.startYmd} value={week.startYmd}>
                  {week.current
                    ? `This week · ${formatMdYDisplay(week.startYmd)} – ${formatMdYDisplay(week.endYmd)}`
                    : `${formatMdYDisplay(week.startYmd)} – ${formatMdYDisplay(week.endYmd)}`}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Open
          </button>
        </form>
      </header>
      {stats.count === 0 ? (
        <p className="p-5 text-sm text-slate-600">{current ? "No diesel this week." : "No diesel in this week."}</p>
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
