import Link from "next/link";
import { formatGallons, formatMdYDisplay } from "@/lib/format";
import type { DriverMpgBoard, DriverMpgPeriod } from "@/lib/fuel-mpg";

function formatMiles(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} mi`;
}

function formatMpg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function mpgHref(
  period: DriverMpgPeriod,
  selectedDriverId: number | null,
  selectedTruckId: number | null,
): string {
  const query = new URLSearchParams();
  if (period === "month") query.set("mpg", "month");
  if (selectedDriverId) query.set("driver", String(selectedDriverId));
  if (selectedTruckId) query.set("truck", String(selectedTruckId));
  const text = query.toString();
  return text ? `/fuel?${text}` : "/fuel";
}

export function FuelMpgTable({
  board,
  selectedDriverId,
  selectedTruckId,
}: {
  board: DriverMpgBoard;
  selectedDriverId: number | null;
  selectedTruckId: number | null;
}) {
  const range = `${formatMdYDisplay(board.startYmd)} – ${formatMdYDisplay(board.endYmd)}`;
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-mpg="">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Drivers MPG</h2>
          <p className="mt-1 text-xs text-slate-500">{range}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            href={mpgHref("week", selectedDriverId, selectedTruckId)}
            className={board.period === "week" ? "font-semibold text-navy" : "text-slate-500 hover:underline"}
          >
            This week
          </Link>
          <Link
            href={mpgHref("month", selectedDriverId, selectedTruckId)}
            className={board.period === "month" ? "font-semibold text-navy" : "text-slate-500 hover:underline"}
          >
            This month
          </Link>
        </div>
      </header>
      {board.rows.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">No active drivers.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Unit</th>
                <th>Miles</th>
                <th>Gallons</th>
                <th>MPG</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.driverId}>
                  <td>
                    <Link href={`/fuel?driver=${row.driverId}`} className="font-semibold hover:underline">
                      {row.driverName}
                    </Link>
                  </td>
                  <td>{row.truckUnit || "—"}</td>
                  <td className="tabular-nums">{formatMiles(row.miles)}</td>
                  <td className="tabular-nums">{row.gallons > 0 ? formatGallons(row.gallons) : "—"}</td>
                  <td className="tabular-nums font-semibold">{formatMpg(row.mpg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
