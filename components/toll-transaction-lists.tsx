import Link from "next/link";
import { TollAssignForm } from "@/components/toll-assign-form";
import { formatDateTime, formatFuelMoney } from "@/lib/format";
import {
  TOLL_TX_LISTS,
  groupTollTxByList,
  isCurrentTollWeek,
  type TollPeriod,
  type TollTransactionView,
  type TollTxListKind,
} from "@/lib/tolls";

type Option = { id: number; label: string };

function TollRowsTable({
  rows,
  drivers,
  loads,
  empty,
  week,
  period,
}: {
  rows: TollTransactionView[];
  drivers: Option[];
  loads: Option[];
  empty: string;
  week?: string | null;
  period: TollPeriod;
}) {
  if (rows.length === 0) return <p className="p-5 text-sm text-slate-600">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table-grid">
        <thead>
          <tr>
            <th>When</th>
            <th>Driver</th>
            <th>Truck</th>
            <th>Transponder</th>
            <th>Plaza</th>
            <th>State</th>
            <th>Amount</th>
            <th>Invoice</th>
            <th>Load</th>
            <th>Assign</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.occurred_at)}</td>
              <td>
                {row.driver_name ? (
                  <Link href={tollPageHref({ driverId: row.driver_id, week, period })} className="hover:underline">
                    {row.driver_name}
                  </Link>
                ) : (
                  row.driver_name_raw || "—"
                )}
              </td>
              <td>
                {row.truck_id ? (
                  <Link href={tollPageHref({ truckId: row.truck_id, week, period })} className="hover:underline">
                    {row.truck_unit || row.unit_number}
                  </Link>
                ) : (
                  row.unit_number || "—"
                )}
              </td>
              <td>{row.transponder_id || "—"}</td>
              <td>{row.plaza || "—"}</td>
              <td>{row.state || "—"}</td>
              <td>{formatFuelMoney(row.amount)}</td>
              <td className="text-xs">{row.invoice_number || "—"}</td>
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
                <TollAssignForm tollId={row.id} drivers={drivers} loads={loads} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type TollPageQuery = {
  tx?: TollTxListKind;
  period?: TollPeriod;
  driverId?: number | null;
  truckId?: number | null;
  week?: string | null;
};

export function tollPageHref(input: TollPageQuery): string {
  const query = new URLSearchParams();
  if (input.tx && input.tx !== "toll") query.set("tx", input.tx);
  if (input.period === "month") query.set("period", "month");
  if (input.driverId) query.set("driver", String(input.driverId));
  if (input.truckId) query.set("truck", String(input.truckId));
  if (input.week && !isCurrentTollWeek(input.week)) query.set("week", input.week);
  const text = query.toString();
  return text ? `/tolls?${text}` : "/tolls";
}

export function TollUnassignedLists({
  rows,
  drivers,
  loads,
  week,
  period,
}: {
  rows: TollTransactionView[];
  drivers: Option[];
  loads: Option[];
  week?: string | null;
  period: TollPeriod;
}) {
  const groups = groupTollTxByList(rows);
  const visible = TOLL_TX_LISTS.filter((item) => groups[item.value].length > 0);
  if (visible.length === 0) return null;
  const total = visible.reduce((sum, item) => sum + groups[item.value].length, 0);
  return (
    <section className="card mb-6 overflow-hidden" data-toll-unassigned="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Unassigned ({total})</h2>
      </header>
      {visible.map((item) => (
        <div key={item.value} className="border-t border-slate-100 first:border-t-0">
          {visible.length > 1 ? (
            <h3 className="px-5 pt-3 text-xs font-semibold uppercase text-slate-500">{item.label}</h3>
          ) : null}
          <TollRowsTable
            rows={groups[item.value]}
            drivers={drivers}
            loads={loads}
            empty={`No ${item.label.toLowerCase()} rows.`}
            week={week}
            period={period}
          />
        </div>
      ))}
    </section>
  );
}

export function TollTransactionLists({
  rows,
  active,
  title,
  showAllLink,
  period,
  selectedDriverId,
  selectedTruckId,
  drivers,
  loads,
  week,
}: {
  rows: TollTransactionView[];
  active: TollTxListKind;
  title: string;
  showAllLink: boolean;
  period: TollPeriod;
  selectedDriverId: number | null;
  selectedTruckId: number | null;
  drivers: Option[];
  loads: Option[];
  week?: string | null;
}) {
  const groups = groupTollTxByList(rows);
  const current = groups[active];
  const label = TOLL_TX_LISTS.find((item) => item.value === active)?.label ?? "Tolls";
  return (
    <section className="card overflow-hidden" data-toll-transactions="">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {showAllLink ? (
          <Link href={tollPageHref({ period, week })} className="text-sm font-medium text-navy hover:underline">
            All tolls
          </Link>
        ) : null}
      </header>
      <nav className="flex flex-wrap gap-3 border-b border-slate-200 px-5 py-2 text-sm" data-toll-tx-tabs="">
        {TOLL_TX_LISTS.map((item) => {
          const selected = item.value === active;
          return (
            <Link
              key={item.value}
              href={tollPageHref({
                tx: item.value,
                period,
                driverId: selectedDriverId,
                truckId: selectedTruckId,
                week,
              })}
              className={selected ? "font-semibold text-navy" : "text-slate-500 hover:underline"}
            >
              {item.label} ({groups[item.value].length})
            </Link>
          );
        })}
      </nav>
      <TollRowsTable
        rows={current}
        drivers={drivers}
        loads={loads}
        empty={`No ${label.toLowerCase()} rows.`}
        week={week}
        period={period}
      />
    </section>
  );
}
