import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listBills, listCommissions, listDriverPay, listReceivables } from "@/lib/accounting";
import { canViewReports, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountingHomePage() {
  const dispatcher = await getSignedInDispatcher();
  const showReports = dispatcher ? canViewReports(dispatcher.role) : false;
  const ar = listReceivables();
  const unpaid = ar.filter((row) => !row.paid);
  const bills = listBills();
  const openBills = bills.filter((bill) => bill.status === "open");
  const pay = listDriverPay();
  const openPay = pay.filter((row) => row.status !== "paid");
  const commissions = listCommissions();
  const commissionTotal = commissions.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <PageHeader
        title="Accounting"
        subtitle="AR, AP, owner-operator pay, and a 3% dispatcher commission worksheet. QuickBooks invoices the customer rate only. Demo rows are labeled."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card href="/accounting/invoices" label="Open AR" value={formatMoney(unpaid.reduce((sum, row) => sum + (row.rate ?? 0), 0))} hint={`${unpaid.length} delivered unbilled or unpaid`} />
        <Card href="/accounting/bills" label="Open AP" value={formatMoney(openBills.reduce((sum, bill) => sum + bill.amount, 0))} hint={`${openBills.length} vendor bills`} />
        <Card href="/accounting/pay" label="OO pay due" value={formatMoney(openPay.reduce((sum, row) => sum + row.amount, 0))} hint={`${openPay.length} settlements`} />
        <Card href="/accounting/commissions" label="Commissions" value={formatMoney(commissionTotal)} hint="3% of delivered customer rate" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/accounting/quickbooks" className="card p-5 hover:border-slate-300">
          <div className="text-sm font-semibold">QuickBooks Online</div>
          <p className="mt-1 text-sm text-slate-600">
            Send customer invoices from a delivered load. OO pay is never a QBO bill.
          </p>
        </Link>
        {showReports ? (
        <Link href="/reports" className="card p-5 hover:border-slate-300">
          <div className="text-sm font-semibold">Revenue report</div>
          <p className="mt-1 text-sm text-slate-600">By customer, plus on-time and a loads CSV.</p>
        </Link>
        ) : null}
      </div>
    </>
  );
}

function Card({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link href={href} className="card block p-5 hover:border-slate-300">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </Link>
  );
}
