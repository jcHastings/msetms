import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedInDriver } from "@/lib/driver-session";
import { formatMdYDisplay } from "@/lib/format";
import { normalizePayWeek } from "@/lib/pay-week";
import {
  labelForReimbursementCategory,
  labelForReimbursementStatus,
  listDriverReimbursements,
  type ReimbursementStatus,
} from "@/lib/reimbursements";
import { formatStatementMoney } from "@/lib/settlement-statement";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<ReimbursementStatus, string> = {
  submitted: "bg-amber-100 text-amber-950",
  approved: "bg-sky-100 text-sky-950",
  rejected: "bg-rose-100 text-rose-950",
  paid: "bg-emerald-100 text-emerald-950",
};

export default async function DriverReimbursementsPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const rows = listDriverReimbursements(driver.id);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6" data-driver-reimbursements="">
      <Link href="/driver" className="text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">My reimbursements</h1>
          <p className="mt-1 text-sm text-slate-400">Status stays in the app. No text or email is sent.</p>
        </div>
        <Link href="/driver/pay" className="btn btn-secondary hit-target">
          My pay this week
        </Link>
      </div>
      <Link href="/driver/reimbursements/new" className="btn btn-primary hit-target mt-4 w-full">
        Submit reimbursement
      </Link>
      {rows.length === 0 ? (
        <section className="driver-sheet mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Nothing submitted yet</h2>
          <p className="mt-1 text-sm text-slate-600">A receipt photo is required when you submit.</p>
        </section>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((row) => {
            const week = row.settlement_week_start ? normalizePayWeek(row.settlement_week_start) : null;
            return (
              <li key={row.id} className="driver-sheet rounded-2xl bg-white p-4 shadow-sm" data-reimbursement-status={row.status}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{formatStatementMoney(row.amount)}</p>
                    <p className="text-sm">{labelForReimbursementCategory(row.category)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_CLASS[row.status]}`}>
                    {labelForReimbursementStatus(row.status)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-1 text-sm">
                  <div>
                    <dt className="inline font-medium">Load: </dt>
                    <dd className="inline">{row.load_number ? `${row.load_number}${row.origin ? ` · ${row.origin} → ${row.destination}` : ""}` : "No load"}</dd>
                  </div>
                  {row.note ? (
                    <div>
                      <dt className="inline font-medium">Note: </dt>
                      <dd className="inline">{row.note}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline font-medium">Settlement week: </dt>
                    <dd className="inline">
                      {week ? `${formatMdYDisplay(week.from)} – ${formatMdYDisplay(week.to)}` : "Not on a statement yet"}
                    </dd>
                  </div>
                  {row.status === "paid" ? (
                    <div>
                      <dt className="inline font-medium">Paid date: </dt>
                      <dd className="inline">{formatMdYDisplay(row.paid_at)}</dd>
                    </div>
                  ) : null}
                  {row.status === "rejected" ? (
                    <div>
                      <dt className="font-medium">Reason</dt>
                      <dd>{row.reject_reason || "No reason stored."}</dd>
                    </div>
                  ) : null}
                </dl>
                <a className="btn btn-secondary hit-target mt-3" href={`/api/reimbursements/${row.id}/receipt`}>
                  View receipt
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
