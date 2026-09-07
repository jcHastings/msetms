import Link from "next/link";
import { formatFuelMoney, formatGallons } from "@/lib/format";
import { FUEL_BUCKETS, type FuelBucket, type FuelRollup } from "@/lib/fuel";

function bucketCell(row: FuelRollup, bucket: FuelBucket, period: "week" | "month"): string {
  const cell = row[period][bucket];
  if (bucket === "scale") return formatFuelMoney(cell.amount);
  return `${formatGallons(cell.gallons)} · ${formatFuelMoney(cell.amount)}`;
}

export function FuelRollupTable({
  title,
  rows,
  hrefFor,
}: {
  title: string;
  rows: FuelRollup[];
  hrefFor: (row: FuelRollup) => string;
}) {
  return (
    <section className="card mb-6 overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">No matched fuel yet. Import a report or assign unmatched rows.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Name</th>
                {FUEL_BUCKETS.map((bucket) => (
                  <th key={bucket.value}>{bucket.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={hrefFor(row)} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      Week {formatGallons(row.weekGallons)} · {formatFuelMoney(row.weekAmount)}
                    </div>
                  </td>
                  {FUEL_BUCKETS.map((bucket) => (
                    <td key={bucket.value}>
                      <div>{bucketCell(row, bucket.value, "month")}</div>
                      <div className="text-xs text-slate-500">wk {bucketCell(row, bucket.value, "week")}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
