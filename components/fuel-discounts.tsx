import Link from "next/link";
import { fuelPageHref } from "@/components/fuel-transaction-lists";
import { formatFuelMoney, formatMdYDisplay } from "@/lib/format";
import {
  fuelDiscountDriverTotals,
  labelForFuelBucket,
  sumKnownFuelDiscounts,
  type FuelTransactionView,
} from "@/lib/fuel";

function formatPumpPpg(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatQty(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function MoneyCell({ value, emphasize = false }: { value: number | null; emphasize?: boolean }) {
  return (
    <td className={`tabular-nums text-right ${emphasize ? "font-semibold" : ""}`}>{formatFuelMoney(value)}</td>
  );
}

export function FuelDiscountsPanel({
  rows,
  weekStartYmd,
  weekEndYmd,
}: {
  rows: FuelTransactionView[];
  weekStartYmd: string;
  weekEndYmd: string;
}) {
  const weekDiscount = sumKnownFuelDiscounts(rows);
  const drivers = fuelDiscountDriverTotals(rows);
  const known = rows.filter((row) => row.discount_amount != null).length;
  const range = `${formatMdYDisplay(weekStartYmd)} - ${formatMdYDisplay(weekEndYmd)}`;

  return (
    <section className="card mb-6 overflow-hidden" data-fuel-discounts="">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Discounts</h2>
          <p className="mt-1 text-xs text-slate-500">{range}, Mon-Sun</p>
        </div>
        <div data-fuel-discount-week="">
          <div className="text-xs font-semibold uppercase text-slate-500">Week discounts</div>
          <div className="mt-1 text-right text-xl font-semibold tabular-nums">{formatFuelMoney(weekDiscount)}</div>
        </div>
      </header>
      <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-600">
        {rows.length === 0
          ? "No fuel in this week."
          : known === 0
            ? "No discount on file. Totals skip rows the import did not price."
            : `${known} of ${rows.length} rows have a discount. Totals add those rows only. A dash means that file had no discount.`}
      </p>
      {rows.length === 0 ? null : (
        <>
          <div className="border-b border-slate-100" data-fuel-discount-drivers="">
            <h3 className="px-5 pt-3 text-sm font-semibold">Per-driver</h3>
            <div className="overflow-x-auto">
              <table className="table-grid">
                <caption className="sr-only">Discount and paid totals by driver for {range}</caption>
                <thead>
                  <tr>
                    <th scope="col">Driver</th>
                    <th scope="col" className="text-right">
                      Discount
                    </th>
                    <th scope="col" className="text-right">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => (
                    <tr key={driver.key}>
                      <td>{driver.driverName}</td>
                      <MoneyCell value={driver.discount} emphasize />
                      <MoneyCell value={driver.paid} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-x-auto" data-fuel-discount-rows="">
            <table className="table-grid">
              <caption className="sr-only">Fuel transactions with gross, discount, fees, and paid amount</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Location</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="text-right">
                    Gal
                  </th>
                  <th scope="col" className="text-right">
                    PPG
                  </th>
                  <th scope="col" className="text-right">
                    Gross
                  </th>
                  <th scope="col" className="text-right">
                    Discount
                  </th>
                  <th scope="col" className="text-right">
                    Fees
                  </th>
                  <th scope="col" className="text-right">
                    Paid
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const driverLabel = row.driver_name || row.driver_name_raw || "—";
                  const unitLabel = row.truck_unit || row.unit_number || "—";
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{formatMdYDisplay(row.occurred_at)}</td>
                      <td>
                        {row.driver_id ? (
                          <Link
                            href={fuelPageHref({ driverId: row.driver_id, view: "discounts", week: weekStartYmd })}
                            className="hover:underline"
                          >
                            {driverLabel}
                          </Link>
                        ) : (
                          driverLabel
                        )}
                      </td>
                      <td>
                        {row.truck_id ? (
                          <Link
                            href={fuelPageHref({ truckId: row.truck_id, view: "discounts", week: weekStartYmd })}
                            className="hover:underline"
                          >
                            {unitLabel}
                          </Link>
                        ) : (
                          unitLabel
                        )}
                      </td>
                      <td>{row.location || "—"}</td>
                      <td>{labelForFuelBucket(row.category)}</td>
                      <td className="tabular-nums text-right">{formatQty(row.gallons)}</td>
                      <td className="tabular-nums text-right">{formatPumpPpg(row.price_per_gallon)}</td>
                      <MoneyCell value={row.gross_amount} />
                      <MoneyCell value={row.discount_amount} emphasize />
                      <MoneyCell value={row.fees_amount} />
                      <MoneyCell value={row.amount} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
