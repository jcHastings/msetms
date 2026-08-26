import { formatMoney } from "@/lib/format";
import { customerInvoicePayItems, driverPayItems } from "@/lib/pay-items";
import { driverFacingPay } from "@/lib/settlement";
import type { LoadView } from "@/lib/types";

export function LoadMoneyBox({ load }: { load: LoadView }) {
  const income = customerInvoicePayItems(load.id);
  const accessorials = income
    .filter((item) => item.category !== "flat_rate")
    .reduce((sum, item) => sum + (item.total ?? 0), 0);
  const driverItems = driverPayItems(load.id).reduce((sum, item) => sum + (item.total ?? 0), 0);
  const driverPay = driverFacingPay(load) ?? (driverItems > 0 ? driverItems : null);

  return (
    <section className="card mb-4 p-5" data-money-box="">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Money</p>
          <h2 className="text-sm font-semibold text-slate-900">
            {load.non_revenue ? "Empty move — pay and miles only" : "Customer rate, accessorials, driver pay"}
          </h2>
        </div>
        {load.ready_to_invoice ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
            Released to invoicing
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <MoneyStat label="Customer rate" value={formatMoney(load.rate)} />
        <MoneyStat label="Accessorials" value={formatMoney(accessorials)} />
        <MoneyStat label="Driver pay" value={driverPay != null ? formatMoney(driverPay) : "—"} />
      </div>
    </section>
  );
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
