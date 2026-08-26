import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { closeDriverPayPeriodAction, paySettlementAction } from "@/lib/dispatcher-actions";
import { defaultPayPeriod, groupDriverPay, listDriverPay } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DriverPayPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const fallback = defaultPayPeriod();
  const from = params.from ?? fallback.from;
  const to = params.to ?? fallback.to;
  const lines = listDriverPay(from, to);
  const groups = groupDriverPay(lines);
  const exportHref = `/api/accounting/pay/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <>
      <PageHeader
        title="Driver pay"
        subtitle="Owner-operator settlements."
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div className="field">
            <label htmlFor="from">Period start</label>
            <input id="from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="field">
            <label htmlFor="to">Period end</label>
            <input id="to" name="to" type="date" defaultValue={to} />
          </div>
          <button className="btn btn-secondary" type="submit">
            Apply period
          </button>
        </form>
        <a className="btn btn-secondary" href={exportHref}>
          Download Excel
        </a>
        <form action={closeDriverPayPeriodAction}>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <button className="btn btn-primary" type="submit">
            Close period
          </button>
        </form>
      </div>
      {groups.length === 0 ? (
        <div className="card p-6 text-sm text-slate-600">No delivered driver pay items in this period.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.driverName} className="card overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold">{group.driverName}</h2>
                <p className="text-sm text-slate-600">
                  Open {formatMoney(group.openTotal)} · Paid {formatMoney(group.paidTotal)}
                </p>
              </header>
              <table className="table-grid">
                <thead>
                  <tr>
                    <th>Load</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <Link href={`/loads/${row.load.id}`} className="font-mono font-semibold underline">
                          {row.load.load_number}
                        </Link>
                      </td>
                      <td>{row.description}</td>
                      <td>{formatMoney(row.amount)}</td>
                      <td>{row.status === "paid" ? "Paid" : "Open"}</td>
                      <td className="text-right">
                        {row.status === "paid" ? null : (
                          <form action={paySettlementAction}>
                            <input type="hidden" name="load_id" value={row.load.id} />
                            {row.payItem ? <input type="hidden" name="pay_item_id" value={row.payItem.id} /> : null}
                            <button className="btn btn-secondary" type="submit">
                              Mark paid
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
