import Link from "next/link";
import { FuelCsvImport } from "@/components/fuel-csv-import";
import { PageHeader } from "@/components/page-header";
import { assignFuelDriverAction } from "@/lib/actions";
import { formatDateTime, formatFuelMoney, formatGallons } from "@/lib/format";
import { listFuelRollups, listFuelTransactions } from "@/lib/fuel-store";
import { listDrivers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string }>;
}) {
  const driverId = Number.parseInt((await searchParams).driver ?? "", 10);
  const selectedDriverId = Number.isFinite(driverId) ? driverId : null;
  const drivers = listDrivers();
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const transactions = listFuelTransactions(selectedDriverId ? { driverId: selectedDriverId } : undefined);
  const unmatched = listFuelTransactions({ unmatchedOnly: true });
  const rollups = listFuelRollups();

  return (
    <>
      <PageHeader
        title="Fuel"
        subtitle="Daily fuel-card CSV import. Match by driver name or unit number. Re-uploads of the same file are skipped."
        actions={
          <>
            <a href="/api/fuel/export" className="btn btn-secondary">
              Download all fuel
            </a>
            <Link href="/fleet/drivers" className="btn btn-secondary">
              Drivers
            </Link>
          </>
        }
      />
      <FuelCsvImport />

      {unmatched.length > 0 ? (
        <section className="card mb-6 overflow-hidden">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Unassigned ({unmatched.length})</h2>
            <p className="mt-1 text-xs text-slate-500">No driver matched. Pick one so the row counts in rollups.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Name on file</th>
                  <th>Unit</th>
                  <th>Location</th>
                  <th>Gallons</th>
                  <th>Amount</th>
                  <th>Assign</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.occurred_at)}</td>
                    <td>{row.driver_name_raw || "—"}</td>
                    <td>{row.truck_unit || row.unit_number || "—"}</td>
                    <td>{row.location || "—"}</td>
                    <td>{formatGallons(row.gallons)}</td>
                    <td>{formatFuelMoney(row.amount)}</td>
                    <td>
                      <form action={assignFuelDriverAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="fuel_id" value={row.id} />
                        <select name="driver_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm" required>
                          <option value="">Driver…</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-secondary" type="submit">
                          Assign
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card mb-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Per-driver this week / this month</h2>
        </header>
        {rollups.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">No matched fuel yet. Import a CSV or assign unmatched rows.</p>
        ) : (
          <table className="table-grid">
            <thead>
              <tr>
                <th>Driver</th>
                <th>This week</th>
                <th>This month</th>
              </tr>
            </thead>
            <tbody>
              {rollups.map((row) => (
                <tr key={row.driverId}>
                  <td>
                    <Link href={`/fuel?driver=${row.driverId}`} className="font-semibold hover:underline">
                      {row.driverName}
                    </Link>
                  </td>
                  <td>
                    {formatGallons(row.weekGallons)} · {formatFuelMoney(row.weekAmount)}
                  </td>
                  <td>
                    {formatGallons(row.monthGallons)} · {formatFuelMoney(row.monthAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            {selectedDriver ? `Transactions — ${selectedDriver.name}` : "Transactions"}
          </h2>
          {selectedDriver ? (
            <Link href="/fuel" className="text-sm font-medium text-navy hover:underline">
              All drivers
            </Link>
          ) : null}
        </header>
        {transactions.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">No fuel rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Driver</th>
                  <th>Truck</th>
                  <th>Location</th>
                  <th>Gallons</th>
                  <th>PPG</th>
                  <th>Amount</th>
                  <th>Card</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.occurred_at)}</td>
                    <td>
                      {row.driver_name ? (
                        <Link href={`/fuel?driver=${row.driver_id}`} className="hover:underline">
                          {row.driver_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.truck_unit || row.unit_number || "—"}</td>
                    <td>{row.location || "—"}</td>
                    <td>{formatGallons(row.gallons)}</td>
                    <td>{row.price_per_gallon == null ? "—" : formatFuelMoney(row.price_per_gallon)}</td>
                    <td>{formatFuelMoney(row.amount)}</td>
                    <td>{row.card_last4 ? `••••${row.card_last4}` : "—"}</td>
                    <td className="text-xs text-slate-500">{row.source_file || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
