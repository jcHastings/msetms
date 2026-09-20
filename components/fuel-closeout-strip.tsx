import { fuelPageHref } from "@/components/fuel-transaction-lists";
import { closeoutExportHref } from "@/lib/fuel-closeout-store";
import type { FuelCloseoutReport } from "@/lib/fuel-closeout";
import { formatFuelMoney, formatGallons, formatMdYDisplay } from "@/lib/format";
import Link from "next/link";

function n(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function FuelCloseoutStrip({ report }: { report: FuelCloseoutReport }) {
  const week = report.week.startYmd;
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-closeout="">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Weekly fuel closeout</h2>
          <p className="mt-1 text-xs text-slate-500">
            {report.week.closed ? "End of week" : "In progress"} · {formatMdYDisplay(report.week.startYmd)} –{" "}
            {formatMdYDisplay(report.week.endYmd)} · {report.milesSource.label} ({report.milesSource.status})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={closeoutExportHref(week, "md")} className="btn btn-secondary" data-fuel-closeout-export="md">
            Markdown
          </a>
          <a href={closeoutExportHref(week, "html")} className="btn btn-secondary" data-fuel-closeout-export="html">
            HTML
          </a>
        </div>
      </header>
      <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{report.note}</p>
      <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{report.milesSource.note}</p>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-5" data-fuel-closeout-fleet="">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Miles</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{n(report.fleet.miles, 0)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Diesel</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatGallons(report.fleet.dieselGallons)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Diesel $</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatFuelMoney(report.fleet.dieselAmount)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Fleet MPG</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{n(report.fleet.mpg)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">vs prior week</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{n(report.fleet.mpgVsPrior)}</div>
        </div>
      </div>
      <div className="grid gap-4 border-t border-slate-100 px-5 py-3 sm:grid-cols-5" data-fuel-closeout-spend="">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Fuel</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatFuelMoney(report.fleet.spend.fuel)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Reefer</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatFuelMoney(report.fleet.spend.reefer)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Scale</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatFuelMoney(report.fleet.spend.scale)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">DEF</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatFuelMoney(report.fleet.spend.def)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Money code</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatFuelMoney(report.fleet.spend.money)}</div>
        </div>
      </div>
      <div className="grid gap-4 border-t border-slate-100 px-5 py-3 md:grid-cols-2">
        <div data-fuel-closeout-worst="">
          <div className="text-xs font-semibold uppercase text-slate-500">Worst 3 MPG</div>
          <p className="mt-1 text-sm">
            {report.fleet.worst3.length
              ? report.fleet.worst3.map((row) => `${row.driverName} ${n(row.mpg)}`).join(" · ")
              : "None with MPG"}
          </p>
        </div>
        <div data-fuel-closeout-best="">
          <div className="text-xs font-semibold uppercase text-slate-500">Best 3 MPG</div>
          <p className="mt-1 text-sm">
            {report.fleet.best3.length
              ? report.fleet.best3.map((row) => `${row.driverName} ${n(row.mpg)}`).join(" · ")
              : "None with MPG"}
          </p>
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-sm" data-fuel-closeout-lights="">
        <span className="text-xs font-semibold uppercase text-slate-500">Green lights </span>
        {report.greenLights.length
          ? report.greenLights.map((row) => `${row.driverName} ${n(row.mpg)}`).join(" · ")
          : "None"}
        <span className="text-slate-400"> · </span>
        <span className="text-xs font-semibold uppercase text-slate-500">Flags </span>
        {report.flags.length ? `${report.flags.length}` : "None"}
        <span className="text-slate-400"> · </span>
        Unassigned {formatFuelMoney(report.fleet.unassignedAmount)}
      </div>
      {report.drivers.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">No fuel or Samsara miles in this week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid" data-fuel-closeout-drivers="">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Unit</th>
                <th>Miles</th>
                <th>Diesel</th>
                <th>MPG</th>
                <th>Fills</th>
                <th>DEF $</th>
                <th>Scale $</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.drivers.map((row) => {
                const href = row.driverId ? fuelPageHref({ driverId: row.driverId, week }) : null;
                const tone = row.flags.some((flag) => flag.severity === "high")
                  ? "red"
                  : row.flags.length
                    ? "yellow"
                    : row.greenLight
                      ? "green"
                      : "";
                return (
                  <tr key={row.subjectKey} data-fuel-closeout-row={tone || "plain"}>
                    <td>
                      {href ? (
                        <Link href={href} className="font-semibold text-navy hover:underline">
                          {row.driverName}
                        </Link>
                      ) : (
                        <span className="font-semibold">{row.driverName}</span>
                      )}
                    </td>
                    <td>{row.unit || "—"}</td>
                    <td className="tabular-nums">{n(row.miles, 0)}</td>
                    <td className="tabular-nums">{row.dieselGallons > 0 ? formatGallons(row.dieselGallons) : "—"}</td>
                    <td className="tabular-nums font-semibold">{n(row.mpg)}</td>
                    <td className="tabular-nums">{row.fillCount || "—"}</td>
                    <td className="tabular-nums">{row.defAmount ? formatFuelMoney(row.defAmount) : "—"}</td>
                    <td className="tabular-nums">{row.scaleAmount ? formatFuelMoney(row.scaleAmount) : "—"}</td>
                    <td className="text-xs uppercase text-slate-500">
                      {tone === "red"
                        ? "Red flag"
                        : tone === "yellow"
                          ? "Yellow flag"
                          : row.greenLight
                            ? "Green light"
                            : row.idleIsh
                              ? "Idle-ish"
                              : row.fuelNoMiles
                                ? "Fuel, no miles"
                                : row.milesNoFuel
                                  ? "Miles, no fuel"
                                  : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
