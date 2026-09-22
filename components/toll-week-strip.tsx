import { formatFuelMoney, formatMdYDisplay } from "@/lib/format";
import type { TollTotals } from "@/lib/tolls-store";
import type { TollPeriod, TollTxListKind, TollWeekOption } from "@/lib/tolls";

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

export function TollFleetCards({
  totals,
  period,
}: {
  totals: TollTotals;
  period: TollPeriod;
}) {
  return (
    <section className="card mb-6 overflow-hidden" data-toll-week-spend="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{period === "month" ? "Fleet spend (month)" : "Fleet spend (week)"}</h2>
      </header>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-4">
        <WeekStat label="Tolls" value={formatFuelMoney(totals.toll)} />
        <WeekStat label="Scale bypass" value={formatFuelMoney(totals.scale_bypass)} />
        <WeekStat label="Total" value={formatFuelMoney(totals.total)} />
        <WeekStat label="Transactions" value={String(totals.txCount)} />
      </div>
    </section>
  );
}

export function TollWeekStrip({
  weeks,
  selectedWeek,
  currentWeek,
  period,
  periodStartYmd,
  periodEndYmd,
  query,
}: {
  weeks: TollWeekOption[];
  selectedWeek: string;
  currentWeek: boolean;
  period: TollPeriod;
  periodStartYmd: string;
  periodEndYmd: string;
  query?: {
    driverId?: number | null;
    truckId?: number | null;
    tx?: TollTxListKind;
  };
}) {
  const range = `${formatMdYDisplay(periodStartYmd)} – ${formatMdYDisplay(periodEndYmd)}`;
  return (
    <section className="card mb-6 overflow-hidden" data-toll-week-strip="" data-toll-week={selectedWeek}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {period === "month" ? "Monthly rollup" : currentWeek ? "This week" : "Saved week"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{range}</p>
        </div>
        <form action="/tolls" method="get" className="flex flex-wrap items-end gap-2" data-toll-week-picker="">
          {hiddenIf("driver", query?.driverId)}
          {hiddenIf("truck", query?.truckId)}
          {hiddenIf("tx", query?.tx && query.tx !== "toll" ? query.tx : null)}
          <div className="field min-w-[14rem]">
            <label htmlFor="toll-week">Saved weeks</label>
            <select id="toll-week" name="week" defaultValue={selectedWeek}>
              {weeks.map((week) => (
                <option key={week.startYmd} value={week.startYmd}>
                  {week.current
                    ? `This week · ${formatMdYDisplay(week.startYmd)} – ${formatMdYDisplay(week.endYmd)}`
                    : `${formatMdYDisplay(week.startYmd)} – ${formatMdYDisplay(week.endYmd)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field min-w-[11rem]">
            <label htmlFor="toll-period">Rollup</label>
            <select id="toll-period" name="period" defaultValue={period}>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Open
          </button>
        </form>
      </header>
    </section>
  );
}
