import Link from "next/link";
import { redirect } from "next/navigation";
import { SettlementDocument } from "@/components/settlement-document";
import { getSignedInDriver } from "@/lib/driver-session";
import { formatMdYDisplay } from "@/lib/format";
import { normalizePayWeek } from "@/lib/pay-week";
import { buildSettlement, listDriverStatementWeeks } from "@/lib/settlement-statement";

export const dynamic = "force-dynamic";

export default async function DriverPayPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const query = await searchParams;
  const week = normalizePayWeek(query.week);
  const statement = buildSettlement(driver.id, week.from);
  if (!statement) redirect("/driver/login");
  const weeks = listDriverStatementWeeks(driver.id);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">My pay this week</h1>
          <p className="mt-1 text-sm text-slate-400">
            {formatMdYDisplay(statement.weekStart)} – {formatMdYDisplay(statement.weekEnd)}. Same numbers as the office statement.
          </p>
        </div>
        <Link href="/driver/reimbursements" className="btn btn-secondary hit-target">
          My reimbursements
        </Link>
      </div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Pay weeks">
        {weeks.map((item) => {
          const current = item.from === statement.weekStart;
          return (
            <Link
              key={item.from}
              href={`/driver/pay?week=${item.from}`}
              className="pay-week-chip"
              aria-current={current ? "page" : undefined}
            >
              {formatMdYDisplay(item.from)}
            </Link>
          );
        })}
      </nav>
      {statement.identityBlock ? null : (
        <div className="mt-4">
          <a className="btn btn-secondary hit-target" href={`/api/driver/pay/pdf?week=${statement.weekStart}`}>
            Save as PDF
          </a>
        </div>
      )}
      <div className="mt-4">
        <SettlementDocument statement={statement} variant="driver" />
      </div>
    </div>
  );
}
