import Link from "next/link";
import { formatFuelMoney } from "@/lib/format";
import type { TollRollup } from "@/lib/tolls-store";

export function TollRollupTable({
  title,
  rows,
  hrefFor,
}: {
  title: string;
  rows: TollRollup[];
  hrefFor: (row: TollRollup) => string;
}) {
  return (
    <section className="card mb-6 overflow-hidden" data-toll-rollup="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">No matched tolls yet. Import a report or assign unmatched rows.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tolls</th>
                <th>Scale bypass</th>
                <th>Total</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={hrefFor(row)} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="tabular-nums">{formatFuelMoney(row.totals.toll)}</td>
                  <td className="tabular-nums">{formatFuelMoney(row.totals.scale_bypass)}</td>
                  <td className="tabular-nums">{formatFuelMoney(row.totals.total)}</td>
                  <td className="tabular-nums">{row.totals.txCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
