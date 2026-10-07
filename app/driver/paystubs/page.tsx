import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedInDriver } from "@/lib/driver-session";
import { driverHasGustoLink, getGustoPublicStatus, listGustoPayLinesForDriver } from "@/lib/integrations/gusto";
import {
  OWNER_OPERATOR_PAY_NOTE,
  formatGustoDate,
  formatPayMoney,
  formatPayPeriod,
} from "@/lib/integrations/gusto-read";
import { isOwnerOperator } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverPaystubsPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const owner = isOwnerOperator(driver.driver_type);
  const status = getGustoPublicStatus();
  const linked = driverHasGustoLink(driver.id);
  const lines = listGustoPayLinesForDriver(driver.id);
  const latest = lines[0] ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="inline-flex min-h-11 items-center text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Paystubs</h1>
      <p className="mt-1 text-sm text-slate-400">Weekly pay from Gusto. Only your rows are shown.</p>

      {owner ? (
        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950" role="note">
          {OWNER_OPERATOR_PAY_NOTE}
          {lines.length > 0
            ? " Contractor payments from Gusto are listed below. There is no paystub PDF for a 1099."
            : ""}
        </p>
      ) : null}

      {!status.connected ? (
        <p className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-300 ring-1 ring-white/10" role="status">
          Gusto is not connected, so paystubs are not available yet.
        </p>
      ) : !linked ? (
        <p className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-300 ring-1 ring-white/10" role="status">
          Your profile is not linked to Gusto yet. Ask the office to match you on the Gusto mapping screen.
        </p>
      ) : lines.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-300 ring-1 ring-white/10" role="status">
          {owner ? "No contractor payments are in yet." : "No processed payrolls are in yet."}
        </p>
      ) : (
        <div className="mt-4 space-y-3" data-paystubs="">
          {latest ? (
            <section className="rounded-2xl bg-white px-4 py-4 text-slate-900" aria-labelledby="latest-net">
              <h2 id="latest-net" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Latest net pay
              </h2>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{formatPayMoney(latest.net_pay)}</p>
              <p className="mt-1 text-sm text-slate-600">Check date {formatGustoDate(latest.check_date)}</p>
            </section>
          ) : null}
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.id} className="rounded-2xl bg-slate-900 px-4 py-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold text-white">{formatGustoDate(line.check_date)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Pay period</dt>
                    <dd className="text-slate-100">{formatPayPeriod(line.pay_period_start, line.pay_period_end)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Gross</dt>
                    <dd className="text-slate-100">{formatPayMoney(line.gross_pay)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Net</dt>
                    <dd className="text-slate-100">{formatPayMoney(line.net_pay)}</dd>
                  </div>
                </dl>
                {line.source === "employee_payroll" ? (
                  <a
                    className="btn btn-primary mt-3 min-h-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                    href={`/api/driver/paystubs/${line.id}/pdf`}
                    aria-label={`Download PDF for check date ${formatGustoDate(line.check_date)}`}
                  >
                    Download PDF
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
