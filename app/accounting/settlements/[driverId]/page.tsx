import Link from "next/link";
import { MarkStatementPaidButton } from "@/components/mark-statement-paid-button";
import { PrintStatementButton } from "@/components/print-statement-button";
import { RemoveOneOffButton, StatementOneOffForm } from "@/components/statement-one-off-form";
import { SettlementDocument } from "@/components/settlement-document";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { normalizePayWeek } from "@/lib/pay-week";
import { canWrite } from "@/lib/settings-shared";
import { buildSettlement } from "@/lib/settlement-statement";

export const metadata = deskMetadata("Settlement statement");
export const dynamic = "force-dynamic";

export default async function SettlementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { driverId: driverParam } = await params;
  const query = await searchParams;
  const driverId = Number.parseInt(driverParam, 10);
  const week = normalizePayWeek(query.week);
  const statement = Number.isFinite(driverId) ? buildSettlement(driverId, week.from) : null;
  const dispatcher = await getSignedInDispatcher();
  const canEdit = dispatcher ? canWrite(dispatcher.role) : false;
  if (!statement) {
    return (
      <>
        <PageHeader dense title="Settlement statement" />
        <p className="text-sm text-slate-600">That driver was not found.</p>
        <Link className="acct-link mt-3 inline-block" href="/accounting/settlements">
          Back to settlements
        </Link>
      </>
    );
  }
  const pdfHref = `/api/accounting/settlements/pdf?driver=${statement.driverId}&week=${statement.weekStart}`;
  return (
    <>
      <PageHeader
        dense
        title={`${statement.driverName}`}
        actions={
          <div className="no-print flex flex-wrap gap-2" data-view-only-allow="">
            <PrintStatementButton />
            <a className="btn btn-secondary hit-target" href={pdfHref}>
              Save as PDF
            </a>
          </div>
        }
      />
      <p className="no-print mb-3">
        <Link className="acct-link" href={`/accounting/settlements?week=${statement.weekStart}`}>
          All drivers this week
        </Link>
      </p>
      <SettlementDocument
        statement={statement}
        variant="office"
        deductionEditor={<StatementOneOffForm driverId={statement.driverId} weekStart={statement.weekStart} canEdit={canEdit} />}
        removeOneOff={(id) => <RemoveOneOffButton id={id} canEdit={canEdit} />}
      />
      <div className="mt-4">
        <MarkStatementPaidButton
          driverId={statement.driverId}
          weekStart={statement.weekStart}
          canEdit={canEdit}
          alreadyPaid={Boolean(statement.paidAt)}
        />
      </div>
    </>
  );
}
