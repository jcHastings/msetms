import Link from "next/link";
import { formatMdYDisplay } from "@/lib/format";
import { adjacentWeeks, formatStatementMoney, listSettlementWeek } from "@/lib/settlement-statement";

export function SettlementWeekList({ week }: { week: string }) {
  const { week: bounds, rows } = listSettlementWeek(week);
  const neighbors = adjacentWeeks(bounds.from);
  return (
    <div>
      <div className="card mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3" method="get" action="/accounting/settlements">
          <div className="field">
            <label htmlFor="week">Week of</label>
            <input id="week" name="week" type="date" defaultValue={bounds.from} />
          </div>
          <button className="btn btn-secondary hit-target" type="submit">
            Show week
          </button>
          <Link className="btn btn-secondary hit-target" href={`/accounting/settlements?week=${neighbors.previous}`}>
            Previous week
          </Link>
          <Link className="btn btn-secondary hit-target" href={`/accounting/settlements?week=${neighbors.next}`}>
            Next week
          </Link>
          <Link className="btn btn-secondary hit-target" href="/accounting/deductions">
            Deduction items
          </Link>
        </form>
        <p className="mt-2 text-sm text-slate-600">
          {formatMdYDisplay(bounds.from)} – {formatMdYDisplay(bounds.to)}. Statements are a record of pay already stored.
          Nothing on this page pays a driver or sends a message.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="pay-empty-state" data-settlement-empty="">
          <p className="font-semibold text-slate-800">No settlements this week</p>
          <p className="mt-1 text-sm text-slate-600">
            No assigned loads, reimbursements, or active deductions landed in this week.
          </p>
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-grid table-grid-acct">
              <caption className="sr-only">Settlement statements for the selected week</caption>
              <thead>
                <tr>
                  <th scope="col">Driver</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Loads</th>
                  <th scope="col">Gross</th>
                  <th scope="col">Reimbursements</th>
                  <th scope="col">Deductions</th>
                  <th scope="col">Net</th>
                  <th scope="col">Statement</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.driverId}>
                    <td>
                      <Link
                        href={`/accounting/settlements/${row.driverId}?week=${bounds.from}`}
                        className="font-semibold underline"
                      >
                        {row.driverName}
                      </Link>
                      {row.ownerOperatorCompany ? (
                        <div className="text-xs text-slate-500">{row.ownerOperatorCompany}</div>
                      ) : null}
                    </td>
                    <td>{row.driverKindLabel}</td>
                    <td>{row.loadCount}</td>
                    <td>{formatStatementMoney(row.gross)}</td>
                    <td>{formatStatementMoney(row.reimbursementTotal)}</td>
                    <td>{formatStatementMoney(row.deductionTotal)}</td>
                    <td className="font-semibold">{formatStatementMoney(row.net)}</td>
                    <td className="font-mono text-xs">
                      {row.statementNumber}
                      {row.paidAt ? <div className="text-slate-500">Paid record</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
