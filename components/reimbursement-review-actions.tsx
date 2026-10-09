"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { approveReimbursementAction, rejectReimbursementAction } from "@/lib/settlement-actions";

export function ReimbursementReviewActions({ id, canEdit }: { id: number; canEdit: boolean }) {
  const [approveState, approveAction, approvePending] = useActionState(approveReimbursementAction, null);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectReimbursementAction, null);
  const reasonId = `reject-reason-${id}`;
  return (
    <div className="mt-3 grid gap-3">
      {!canEdit ? <p className="text-sm font-medium text-slate-700">View-only. Approve and reject stay off.</p> : null}
      <form action={approveAction}>
        <FormBanner result={approveState} />
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="btn btn-secondary hit-target"
          disabled={!canEdit || approvePending}
          aria-disabled={!canEdit || undefined}
          title={canEdit ? undefined : "View-only access"}
        >
          {approvePending ? "Saving…" : "Approve"}
        </button>
      </form>
      <form action={rejectAction} className="grid gap-2">
        <FormBanner result={rejectState} />
        <input type="hidden" name="id" value={id} />
        <label htmlFor={reasonId}>Rejection reason</label>
        <textarea id={reasonId} name="reason" required minLength={3} maxLength={500} disabled={!canEdit} aria-disabled={!canEdit || undefined} />
        <button
          type="submit"
          className="btn btn-secondary hit-target"
          disabled={!canEdit || rejectPending}
          aria-disabled={!canEdit || undefined}
          title={canEdit ? undefined : "View-only access"}
        >
          {rejectPending ? "Saving…" : "Reject"}
        </button>
      </form>
    </div>
  );
}
