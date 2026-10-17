"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { markSettlementPaidAction } from "@/lib/settlement-actions";

export function MarkStatementPaidButton({
  driverId,
  weekStart,
  canEdit,
  alreadyPaid,
}: {
  driverId: number;
  weekStart: string;
  canEdit: boolean;
  alreadyPaid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markSettlementPaidAction, null);
  const locked = !canEdit || alreadyPaid;
  return (
    <div className="no-print">
      <FormBanner result={state} />
      {alreadyPaid ? (
        <p className="text-sm text-slate-600">This statement is already marked paid. That record does not move money.</p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary hit-target"
          disabled={locked}
          aria-disabled={locked || undefined}
          title={canEdit ? undefined : "View-only access"}
          onClick={() => setOpen(true)}
        >
          Mark statement paid…
        </button>
      )}
      {open && canEdit && !alreadyPaid ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3" role="dialog" aria-labelledby="mark-paid-title">
          <h2 id="mark-paid-title" className="text-sm font-semibold text-slate-900">
            Mark this statement paid?
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            This only records the status. It does not send money, and it marks this week’s approved reimbursements paid.
          </p>
          <form action={action} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="driver_id" value={driverId} />
            <input type="hidden" name="week_start" value={weekStart} />
            <button type="submit" className="btn btn-secondary hit-target" disabled={pending}>
              {pending ? "Saving…" : "Mark statement paid"}
            </button>
            <button type="button" className="btn btn-secondary hit-target" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
