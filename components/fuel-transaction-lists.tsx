import Link from "next/link";
import { FuelAssignForm } from "@/components/fuel-assign-form";
import { FuelDeleteButton } from "@/components/fuel-delete-button";
import { formatDateTime, formatFuelMoney, formatGallons } from "@/lib/format";
import {
  FUEL_TX_LISTS,
  fuelTxListKind,
  groupFuelTxByList,
  type FuelPageView,
  type FuelTransactionView,
  type FuelTxListKind,
} from "@/lib/fuel";

type Option = { id: number; label: string };

function qtyCell(row: FuelTransactionView): string | number {
  if (row.category === "money_code" || fuelTxListKind(row.category) === "money_code") return "—";
  if (row.category === "scale" || fuelTxListKind(row.category) === "scale") return row.gallons ?? "—";
  return formatGallons(row.gallons);
}

function FuelRowsTable({
  rows,
  drivers,
  loads,
  empty,
}: {
  rows: FuelTransactionView[];
  drivers: Option[];
  loads: Option[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="p-5 text-sm text-slate-600">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-grid">
        <thead>
          <tr>
            <th>When</th>
            <th>Driver</th>
            <th>Truck</th>
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
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.occurred_at)}</td>
              <td>
                {row.driver_name ? (
                  <Link href={`/fuel?driver=${row.driver_id}`} className="hover:underline">
                    {row.driver_name}
                  </Link>
                ) : (
                  row.driver_name_raw || "—"
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
              <td>{row.location || "—"}</td>
              <td>{qtyCell(row)}</td>
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
                <FuelAssignForm fuelId={row.id} drivers={drivers} loads={loads} />
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
  );
}

export function fuelPageHref(input: {
  view?: FuelPageView;
  tx?: FuelTxListKind;
  mpg?: "week" | "month";
  driverId?: number | null;
  truckId?: number | null;
}): string {
  const query = new URLSearchParams();
  if (input.view && input.view !== "tx") query.set("view", input.view);
  if (input.tx && input.tx !== "truck_diesel") query.set("tx", input.tx);
  if (input.mpg === "month") query.set("mpg", "month");
  if (input.driverId) query.set("driver", String(input.driverId));
  if (input.truckId) query.set("truck", String(input.truckId));
  const text = query.toString();
  return text ? `/fuel?${text}` : "/fuel";
}

export function FuelViewTabs({
  view,
  mpgPeriod,
  selectedDriverId,
  selectedTruckId,
  txList,
}: {
  view: FuelPageView;
  mpgPeriod: "week" | "month";
  selectedDriverId: number | null;
  selectedTruckId: number | null;
  txList?: FuelTxListKind;
}) {
  const items: Array<{ value: FuelPageView; label: string }> = [
    { value: "trucks", label: "Per-truck totals" },
    { value: "tx", label: "Transactions" },
  ];
  return (
    <nav className="mb-4 flex flex-wrap gap-4 text-sm" data-fuel-view-tabs="">
      {items.map((item) => (
        <Link
          key={item.value}
          href={fuelPageHref({
            view: item.value,
            tx: item.value === "tx" ? txList : undefined,
            mpg: mpgPeriod,
            driverId: selectedDriverId,
            truckId: selectedTruckId,
          })}
          className={view === item.value ? "font-semibold text-navy" : "text-slate-500 hover:underline"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function FuelUnassignedLists({
  rows,
  drivers,
  loads,
}: {
  rows: FuelTransactionView[];
  drivers: Option[];
  loads: Option[];
}) {
  const groups = groupFuelTxByList(rows);
  const visible = FUEL_TX_LISTS.filter((item) => groups[item.value].length > 0);
  if (visible.length === 0) return null;
  const total = visible.reduce((sum, item) => sum + groups[item.value].length, 0);
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-unassigned="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Unassigned ({total})</h2>
      </header>
      {visible.map((item) => (
        <div key={item.value} className="border-t border-slate-100 first:border-t-0">
          {visible.length > 1 ? (
            <h3 className="px-5 pt-3 text-xs font-semibold uppercase text-slate-500">{item.label}</h3>
          ) : null}
          <FuelRowsTable
            rows={groups[item.value]}
            drivers={drivers}
            loads={loads}
            empty={`No ${item.label.toLowerCase()} rows.`}
          />
        </div>
      ))}
    </section>
  );
}

export function FuelTransactionLists({
  rows,
  active,
  title,
  showAllLink,
  mpgPeriod,
  selectedDriverId,
  selectedTruckId,
  drivers,
  loads,
}: {
  rows: FuelTransactionView[];
  active: FuelTxListKind;
  title: string;
  showAllLink: boolean;
  mpgPeriod: "week" | "month";
  selectedDriverId: number | null;
  selectedTruckId: number | null;
  drivers: Option[];
  loads: Option[];
}) {
  const groups = groupFuelTxByList(rows);
  const tabs = FUEL_TX_LISTS.filter((item) => item.value !== "def" || groups.def.length > 0 || active === "def");
  const current = groups[active];
  const label = FUEL_TX_LISTS.find((item) => item.value === active)?.label ?? "Truck diesel";
  return (
    <section className="card overflow-hidden" data-fuel-transactions="">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {showAllLink ? (
          <Link href={fuelPageHref({ mpg: mpgPeriod })} className="text-sm font-medium text-navy hover:underline">
            All fuel
          </Link>
        ) : null}
      </header>
      <nav className="flex flex-wrap gap-3 border-b border-slate-200 px-5 py-2 text-sm" data-fuel-tx-tabs="">
        {tabs.map((item) => {
          const href = fuelPageHref({
            tx: item.value,
            mpg: mpgPeriod,
            driverId: selectedDriverId,
            truckId: selectedTruckId,
          });
          const selected = item.value === active;
          return (
            <Link
              key={item.value}
              href={href}
              className={selected ? "font-semibold text-navy" : "text-slate-500 hover:underline"}
            >
              {item.label} ({groups[item.value].length})
            </Link>
          );
        })}
      </nav>
      <FuelRowsTable rows={current} drivers={drivers} loads={loads} empty={`No ${label.toLowerCase()} rows.`} />
    </section>
  );
}
