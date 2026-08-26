import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { FuelCsvImport } from "@/components/fuel-csv-import";
import { FuelRollupTable } from "@/components/fuel-rollup-table";
import { PageHeader } from "@/components/page-header";
import { FuelAssignForm } from "@/components/fuel-assign-form";
import { FuelDeleteButton } from "@/components/fuel-delete-button";
import { linkFuelReceiptFormAction } from "@/lib/actions";
import { listFuelMatchQueue, listFuelReceipts } from "@/lib/fuel-receipts";
import { canExportCsv, canUploadFuel, getPageAccess } from "@/lib/dispatcher-session";
import { formatDateTime, formatFuelMoney, formatGallons } from "@/lib/format";
import { labelForFuelBucket } from "@/lib/fuel";
import { listFuelRollups, listFuelTransactions, listTruckFuelRollups } from "@/lib/fuel-store";
import { listDrivers, listLoads, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string; truck?: string }>;
}) {
  const dispatcher = await getPageAccess(canUploadFuel);
  if (!dispatcher) {
    return <AccessDenied message="Fuel is for Administrator and Standard." />;
  }
  const params = await searchParams;
  const driverId = Number.parseInt(params.driver ?? "", 10);
  const truckId = Number.parseInt(params.truck ?? "", 10);
  const selectedDriverId = Number.isFinite(driverId) ? driverId : null;
  const selectedTruckId = Number.isFinite(truckId) ? truckId : null;
  const drivers = listDrivers();
  const trucks = listTrucks();
  const loadOptions = listLoads({ status: "all" })
    .filter((load) => load.status !== "cancelled")
    .slice(0, 80)
    .map((load) => ({ id: load.id, label: `${load.load_number} · ${load.destination}` }));
  const driverOptions = drivers.map((driver) => ({ id: driver.id, label: driver.name }));
  const selectedDriver = selectedDriverId ? drivers.find((driver) => driver.id === selectedDriverId) : null;
  const selectedTruck = selectedTruckId ? trucks.find((truck) => truck.id === selectedTruckId) : null;
  const transactions = listFuelTransactions(
    selectedDriverId ? { driverId: selectedDriverId } : selectedTruckId ? { truckId: selectedTruckId } : undefined,
  );
  const unmatched = listFuelTransactions({ unmatchedOnly: true });
  const driverRollups = listFuelRollups();
  const truckRollups = listTruckFuelRollups();
  const filterLabel = selectedDriver
    ? `Transactions — ${selectedDriver.name}`
    : selectedTruck
      ? `Transactions — Unit ${selectedTruck.unit_number}`
      : "Transactions";

  return (
    <>
      <PageHeader
        title="Fuel"
        subtitle="Fuel card file and driver receipt photos."
        actions={
          <>
            {canExportCsv(dispatcher.role) ? (
              <a href="/api/fuel/export" className="btn btn-secondary">
                Download all fuel
              </a>
            ) : null}
            <Link href="/fleet/drivers" className="btn btn-secondary">
              Drivers
            </Link>
          </>
        }
      />
      <FuelCsvImport />
      <FuelMatchQueue />

      {unmatched.length > 0 ? (
        <section className="card mb-6 overflow-hidden">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Unassigned ({unmatched.length})</h2>
            <p className="mt-1 text-xs text-slate-500">No driver matched. Pick one so the row counts in totals.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Name on file</th>
                  <th>Unit</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Assign</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.occurred_at)}</td>
                    <td>{row.driver_name_raw || "—"}</td>
                    <td>{row.truck_unit || row.unit_number || "—"}</td>
                    <td>{labelForFuelBucket(row.category)}</td>
                    <td>{row.location || "—"}</td>
                    <td>{row.category === "scale" ? row.gallons ?? "—" : formatGallons(row.gallons)}</td>
                    <td>{formatFuelMoney(row.amount)}</td>
                    <td>
                      <FuelAssignForm fuelId={row.id} drivers={driverOptions} loads={loadOptions} />
                    </td>
                    <td>
                      <FuelDeleteButton fuelId={row.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <FuelRollupTable title="Per-driver totals" rows={driverRollups} hrefFor={(row) => `/fuel?driver=${row.id}`} />
      <FuelRollupTable title="Per-truck totals" rows={truckRollups} hrefFor={(row) => `/fuel?truck=${row.id}`} />

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">{filterLabel}</h2>
          {selectedDriver || selectedTruck ? (
            <Link href="/fuel" className="text-sm font-medium text-navy hover:underline">
              All fuel
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
                  <th>Category</th>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>PPG</th>
                  <th>Amount</th>
                  <th>Invoice</th>
                  <th>Card</th>
                  <th>Load</th>
                  <th>Assign</th>
                  <th></th>
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
                    <td>
                      {row.truck_id ? (
                        <Link href={`/fuel?truck=${row.truck_id}`} className="hover:underline">
                          {row.truck_unit || row.unit_number}
                        </Link>
                      ) : (
                        row.unit_number || "—"
                      )}
                    </td>
                    <td>{labelForFuelBucket(row.category)}</td>
                    <td>{row.location || "—"}</td>
                    <td>
                      {row.category === "money_code"
                        ? "—"
                        : row.category === "scale"
                          ? row.gallons ?? "—"
                          : formatGallons(row.gallons)}
                    </td>
                    <td>{row.price_per_gallon == null ? "—" : formatFuelMoney(row.price_per_gallon)}</td>
                    <td>{formatFuelMoney(row.amount)}</td>
                    <td className="text-xs">{row.invoice_number || "—"}</td>
                    <td>{row.card_last4 ? `••••${row.card_last4}` : "—"}</td>
                    <td>
                      {row.load_id ? (
                        <Link href={`/loads/${row.load_id}`} className="underline">
                          {row.load_number || row.load_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <FuelAssignForm fuelId={row.id} drivers={driverOptions} loads={loadOptions} />
                    </td>
                    <td>
                      <FuelDeleteButton fuelId={row.id} />
                    </td>
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

const FUEL_STATUS_META = {
  matched: { icon: "✓", label: "Matched" },
  no_photo: { icon: "–", label: "No photo" },
  wrong_state: { icon: "!", label: "Wrong state" },
  gallons_off: { icon: "↕", label: "Gallons off" },
} as const;

function FuelStatusIcon({
  status,
}: {
  status: "matched" | "no_photo" | "wrong_state" | "gallons_off";
}) {
  const meta = FUEL_STATUS_META[status];
  return (
    <span className={`fuel-status fuel-status-${status}`} data-fuel-status={status} title={meta.label}>
      {meta.icon}
    </span>
  );
}

function FuelMatchQueue() {
  const queue = listFuelMatchQueue();
  const linked = new Set(queue.map((row) => row.receipt?.id).filter((id): id is number => id != null));
  const looseReceipts = listFuelReceipts().filter((receipt) => !linked.has(receipt.id));
  const unmatchedCards = queue.filter((row) => row.status === "no_photo");
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-match-queue="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Receipt match</h2>
        <p className="mt-1 text-xs text-slate-500">Match a driver photo to the card-file stop.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Verification</th>
              <th>When</th>
              <th>Unit</th>
              <th>Gallons</th>
              <th>Amount</th>
              <th>Station</th>
              <th>Load</th>
              <th>Fix</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.transaction.id}>
                <td>
                  <FuelStatusIcon status={row.status} />
                </td>
                <td>{formatDateTime(row.transaction.occurred_at)}</td>
                <td>{row.transaction.truck_unit || row.transaction.unit_number || "—"}</td>
                <td>{formatGallons(row.transaction.gallons)}</td>
                <td>{formatFuelMoney(row.transaction.amount)}</td>
                <td>{row.transaction.location || "—"}</td>
                <td>
                  {row.loadId ? (
                    <Link href={`/loads/${row.loadId}`} className="underline">
                      {row.loadNumber || row.loadId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {row.status === "matched" ? (
                    <span className="text-xs text-slate-500">matched</span>
                  ) : row.receipt ? (
                    <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="receipt_id" value={row.receipt.id} />
                      <input type="hidden" name="fuel_id" value={row.transaction.id} />
                      <button className="btn btn-ghost" type="submit">
                        Match
                      </button>
                    </form>
                  ) : looseReceipts.length ? (
                    <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="fuel_id" value={row.transaction.id} />
                      <select name="receipt_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm" required>
                        <option value="">Photo…</option>
                        {looseReceipts.map((receipt) => (
                          <option key={receipt.id} value={receipt.id}>
                            Load {receipt.load_id}
                            {receipt.gallons != null ? ` · ${receipt.gallons} gal` : ""}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost" type="submit">
                        Match
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-500">no photo</span>
                  )}
                </td>
                <td>
                  <FuelDeleteButton fuelId={row.transaction.id} />
                </td>
              </tr>
            ))}
            {looseReceipts.map((receipt) => (
              <tr key={`r-${receipt.id}`}>
                <td>
                  <FuelStatusIcon status="no_photo" />
                </td>
                <td>{formatDateTime(receipt.occurred_at || receipt.created_at)}</td>
                <td>—</td>
                <td>{receipt.gallons ?? "—"}</td>
                <td>—</td>
                <td>{receipt.station || receipt.state || "—"}</td>
                <td>
                  <Link href={`/loads/${receipt.load_id}`} className="underline">
                    {receipt.load_id}
                  </Link>
                </td>
                <td>
                  {unmatchedCards.length ? (
                    <form action={linkFuelReceiptFormAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="receipt_id" value={receipt.id} />
                      <select name="fuel_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm" required>
                        <option value="">Card row…</option>
                        {unmatchedCards.map((row) => (
                          <option key={row.transaction.id} value={row.transaction.id}>
                            {row.transaction.truck_unit || row.transaction.unit_number || "card"} ·{" "}
                            {formatDateTime(row.transaction.occurred_at)}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost" type="submit">
                        Match
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-500">no card row</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="fuel-status-legend">
        {(Object.keys(FUEL_STATUS_META) as Array<keyof typeof FUEL_STATUS_META>).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <FuelStatusIcon status={status} />
            {FUEL_STATUS_META[status].label}
          </span>
        ))}
      </footer>
    </section>
  );
}
