"use client";

import { useActionState } from "react";
import { deleteCustomerAction } from "@/lib/actions";

export function DeleteCustomerForm({
  customerId,
  customerName,
  disabled = false,
  disabledReason,
}: {
  customerId: number;
  customerName: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(deleteCustomerAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(`Delete ${customerName}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="customer_id" value={customerId} />
      <button
        className="btn btn-ghost text-rose-700"
        type="submit"
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        data-delete-customer=""
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {disabled && disabledReason ? <p className="mt-1 text-xs text-slate-500">{disabledReason}</p> : null}
      {state && !state.ok && state.error ? <p className="mt-1 text-xs text-rose-700">{state.error}</p> : null}
    </form>
  );
}
