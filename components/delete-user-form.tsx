"use client";

import { useActionState } from "react";
import { deleteDispatcherUserAction } from "@/lib/settings-actions";

export function DeleteUserForm({
  userId,
  userName,
  disabled = false,
  disabledReason,
}: {
  userId: number;
  userName: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(deleteDispatcherUserAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(`Delete ${userName}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        className="btn btn-ghost text-rose-700"
        type="submit"
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        data-delete-user=""
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {disabled && disabledReason ? <p className="mt-1 text-xs text-slate-500">{disabledReason}</p> : null}
      {state && !state.ok && state.error ? <p className="mt-1 text-xs text-rose-700">{state.error}</p> : null}
    </form>
  );
}
