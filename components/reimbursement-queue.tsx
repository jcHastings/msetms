import Link from "next/link";
import { ReimbursementReviewActions } from "@/components/reimbursement-review-actions";
import { formatMdYDisplay } from "@/lib/format";
import { labelForReimbursementCategory, labelForReimbursementStatus, listReimbursementQueue } from "@/lib/reimbursements";
import { formatStatementMoney } from "@/lib/settlement-statement";

export function ReimbursementQueue({ canEdit }: { canEdit: boolean }) {
  const rows = listReimbursementQueue();
  const waiting = rows.filter((row) => row.status === "submitted");
  const reviewed = rows.filter((row) => row.status !== "submitted");
  return (
    <div className="space-y-4" data-reimbursement-queue="">
      <p className="text-sm text-slate-600">
        Pending items are first. Approving adds the amount to that driver’s settlement. Rejecting needs a reason. Neither
        sends a text or email, and neither moves money.
      </p>
      {rows.length === 0 ? (
        <div className="pay-empty-state">
          <p className="font-semibold text-slate-800">No reimbursements yet</p>
          <p className="mt-1 text-sm text-slate-600">Drivers submit a receipt from My reimbursements.</p>
        </div>
      ) : null}
      <QueueGroup title="Waiting for review" rows={waiting} canEdit={canEdit} empty="Nothing waiting." />
      <QueueGroup title="Already reviewed" rows={reviewed} canEdit={false} empty="Nothing reviewed yet." />
    </div>
  );
}

function QueueGroup({
  title,
  rows,
  canEdit,
  empty,
}: {
  title: string;
  rows: ReturnType<typeof listReimbursementQueue>;
  canEdit: boolean;
  empty: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby={`queue-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <h2 id={`queue-${title.replace(/\s+/g, "-").toLowerCase()}`} className="text-sm font-semibold text-slate-900">
        {title}
      </h2>
      {rows.length === 0 ? <p className="text-sm text-slate-600">{empty}</p> : null}
      {rows.map((row) => {
        const image = row.mime_type.startsWith("image/");
        const href = `/api/reimbursements/${row.id}/receipt`;
        return (
          <article key={row.id} className="card grid gap-4 p-4 md:grid-cols-[220px_1fr]" data-reimbursement-card={row.status}>
            <div>
              {image ? (
                <img src={href} alt={`Receipt for ${labelForReimbursementCategory(row.category)} from ${row.driver_name}`} className="max-h-52 w-full rounded border border-slate-200 object-contain" />
              ) : (
                <a className="btn btn-secondary hit-target" href={href}>
                  Open receipt
                </a>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelForReimbursementStatus(row.status)}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                {row.driver_name} · {formatStatementMoney(row.amount)}
              </h3>
              <dl className="mt-2 grid gap-1 text-sm text-slate-700">
                <div>
                  <dt className="inline font-medium">Category: </dt>
                  <dd className="inline">{labelForReimbursementCategory(row.category)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Load: </dt>
                  <dd className="inline">
                    {row.load_id && row.load_number ? (
                      <Link href={`/loads/${row.load_id}`} className="underline">
                        {row.load_number}
                        {row.origin ? ` · ${row.origin} → ${row.destination}` : ""}
                      </Link>
                    ) : (
                      "No load"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Note: </dt>
                  <dd className="inline">{row.note || "—"}</dd>
                </div>
                {row.status === "rejected" ? (
                  <div>
                    <dt className="inline font-medium">Reason: </dt>
                    <dd className="inline">{row.reject_reason}</dd>
                  </div>
                ) : null}
                {row.settlement_week_start ? (
                  <div>
                    <dt className="inline font-medium">Settlement week: </dt>
                    <dd className="inline">{formatMdYDisplay(row.settlement_week_start)}</dd>
                  </div>
                ) : null}
                {row.paid_at ? (
                  <div>
                    <dt className="inline font-medium">Paid date: </dt>
                    <dd className="inline">{formatMdYDisplay(row.paid_at)}</dd>
                  </div>
                ) : null}
              </dl>
              {row.status === "submitted" ? <ReimbursementReviewActions id={row.id} canEdit={canEdit} /> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
