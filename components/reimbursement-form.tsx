"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { submitReimbursementAction } from "@/lib/driver-actions";
import { REIMBURSEMENT_CATEGORIES } from "@/lib/reimbursements";

export function ReimbursementForm({
  loads,
}: {
  loads: Array<{ id: number; label: string }>;
}) {
  const [state, action, pending] = useActionState(submitReimbursementAction, null);
  const errorId = "reimbursement-error";
  return (
    <form action={action} className="driver-reimburse driver-sheet mt-4 rounded-2xl bg-white p-4 shadow-sm" aria-describedby={state && !state.ok ? errorId : undefined}>
      <FormBanner result={state} />
      {state && !state.ok ? <span id={errorId} className="sr-only">{state.error}</span> : null}
      <div className="field">
        <label htmlFor="receipt">Receipt photo</label>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          required
          className="hit-target"
        />
        <p className="mt-1 text-sm text-slate-600">Required. Photo or PDF.</p>
      </div>
      <div className="field">
        <label htmlFor="amount">Amount</label>
        <input id="amount" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required className="hit-target" />
      </div>
      <fieldset className="field">
        <legend>Category</legend>
        <div className="mt-2 grid gap-2">
          {REIMBURSEMENT_CATEGORIES.map((item) => (
            <label key={item.value} className="reimburse-choice">
              <input type="radio" name="category" value={item.value} required />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="load_id">Load</label>
        <select id="load_id" name="load_id" className="hit-target" defaultValue="">
          <option value="">No load</option>
          {loads.map((load) => (
            <option key={load.id} value={load.id}>
              {load.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="note">Note</label>
        <textarea id="note" name="note" rows={3} maxLength={500} placeholder="Optional" />
      </div>
      <button type="submit" className="btn btn-primary hit-target w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit reimbursement"}
      </button>
      <p className="mt-3 text-sm text-slate-600">
        Dispatch reviews this in the office. You will not get a text or email. The status shows under My reimbursements.
      </p>
    </form>
  );
}
