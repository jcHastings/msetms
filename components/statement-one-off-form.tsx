"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { addStatementOneOffAction, deleteStatementOneOffAction } from "@/lib/settlement-actions";

export function StatementOneOffForm({
  driverId,
  weekStart,
  canEdit,
}: {
  driverId: number;
  weekStart: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(addStatementOneOffAction, null);
  return (
    <form action={action} className="no-print mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <FormBanner result={state} />
      <input type="hidden" name="driver_id" value={driverId} />
      <input type="hidden" name="week_start" value={weekStart} />
      <div className="field sm:col-span-1">
        <label htmlFor="one-off-name">One-time deduction</label>
        <input id="one-off-name" name="name" required disabled={!canEdit} aria-disabled={!canEdit || undefined} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="one-off-amount">Amount</label>
        <input
          id="one-off-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          required
          disabled={!canEdit}
          aria-disabled={!canEdit || undefined}
        />
      </div>
      <button
        type="submit"
        className="btn btn-secondary hit-target"
        disabled={!canEdit || pending}
        aria-disabled={!canEdit || undefined}
        title={canEdit ? undefined : "View-only access"}
      >
        {pending ? "Adding…" : "Add to this statement"}
      </button>
    </form>
  );
}

export function RemoveOneOffButton({ id, canEdit }: { id: number; canEdit: boolean }) {
  const [state, action, pending] = useActionState(deleteStatementOneOffAction, null);
  return (
    <form action={action} className="no-print inline">
      <FormBanner result={state} hideOk />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn btn-secondary hit-target"
        disabled={!canEdit || pending}
        aria-disabled={!canEdit || undefined}
        title={canEdit ? "Remove this one-time deduction" : "View-only access"}
      >
        Remove
      </button>
    </form>
  );
}
