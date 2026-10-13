import { formatFuelMoney } from "@/lib/format";
import type { IdleFuelCostBoard, IdleFuelDriverCell } from "@/lib/idle-fuel-cost";

function formatHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

function IdleCell({ cell }: { cell: IdleFuelDriverCell }) {
  return (
    <td className="tabular-nums">
      <div>{formatHours(cell.idleHours)}</div>
      <div>{formatFuelMoney(cell.cost)}</div>
    </td>
  );
}

export function IdleFuelEstimate({ board }: { board: IdleFuelCostBoard }) {
  const [day, week, month] = board.windows;
  return (
    <section className="card mb-6 overflow-hidden" data-idle-fuel-estimate="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Idle fuel estimate</h2>
      </header>
      <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500" data-idle-fuel-assumption="">
        {board.note}
      </p>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3" data-idle-fuel-fleet="">
        {board.windows.map((window) => (
          <div key={window.period} data-idle-fuel-window={window.period}>
            <div className="text-xs font-semibold uppercase text-slate-500">{window.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatFuelMoney(window.fleetCost)}</div>
            <p className="mt-1 text-xs text-slate-500">
              {formatHours(window.fleetIdleHours)} · {window.priceCite}
            </p>
          </div>
        ))}
      </div>
      {board.drivers.length === 0 || !day || !week || !month ? (
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">No idle hours in these windows.</p>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="table-grid" data-idle-fuel-drivers="">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Unit</th>
                <th>{day.label}</th>
                <th>{week.label}</th>
                <th>{month.label}</th>
              </tr>
            </thead>
            <tbody>
              {board.drivers.map((row) => (
                <tr key={row.driverId ?? row.driverName}>
                  <td className="font-semibold">{row.driverName}</td>
                  <td>{row.unit || "—"}</td>
                  <IdleCell cell={row.day} />
                  <IdleCell cell={row.week} />
                  <IdleCell cell={row.month} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
