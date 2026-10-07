import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedInDriver } from "@/lib/driver-session";
import { listDriverPaystubs } from "@/lib/paystubs";
import {
  GUSTO_EMPLOYEE_LOGIN_URL,
  OWNER_OPERATOR_PAY_NOTE,
  formatPayDate,
  formatPayMoney,
  formatPayPeriod,
} from "@/lib/paystub-shared";
import { isOwnerOperator } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverPaystubsPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const owner = isOwnerOperator(driver.driver_type);
  const lines = listDriverPaystubs(driver.id);
  const latest = lines[0] ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="inline-flex min-h-11 items-center text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Paystubs</h1>
      <p className="mt-1 text-sm text-slate-400">Paystubs the office uploaded for you. Newest first.</p>

      {owner ? (
        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950" role="note">
          {OWNER_OPERATOR_PAY_NOTE}
        </p>
      ) : null}

      {lines.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-300 ring-1 ring-white/10" role="status">
          No paystubs yet. The office adds them after payday.
        </p>
      ) : (
        <div className="mt-4 space-y-3" data-paystubs="">
          {latest ? (
            <section className="rounded-2xl bg-white px-4 py-4 text-slate-900" aria-labelledby="latest-net">
              <h2 id="latest-net" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Latest net pay
              </h2>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{formatPayMoney(latest.net)}</p>
              <p className="mt-1 text-sm text-slate-600">Pay date {formatPayDate(latest.pay_date)}</p>
            </section>
          ) : null}
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.id} className="rounded-2xl bg-slate-900 px-4 py-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold text-white">{formatPayDate(line.pay_date)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Pay period</dt>
                    <dd className="text-slate-100">{formatPayPeriod(line.period_start, line.period_end)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Gross</dt>
                    <dd className="text-slate-100">{formatPayMoney(line.gross)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Net</dt>
                    <dd className="text-slate-100">{formatPayMoney(line.net)}</dd>
                  </div>
                </dl>
                <a
                  className="btn btn-primary mt-3 min-h-11 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                  href={`/api/driver/paystubs/${line.id}/pdf`}
                  aria-label={`Download PDF for pay date ${formatPayDate(line.pay_date)}`}
                >
                  Download PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        className="btn btn-secondary mt-4 min-h-11 w-full"
        href={GUSTO_EMPLOYEE_LOGIN_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Gusto
      </a>
      <p className="mt-2 text-center text-xs text-slate-500">Opens Gusto’s employee login in a new tab. No payroll data is pulled from Gusto.</p>
    </div>
  );
}
