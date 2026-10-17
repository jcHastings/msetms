"use client";

import { useActionState } from "react";
import { detentionNoticeAction, type DetentionNoticeActionResult } from "@/lib/detention-actions";

/** Approve sends the short notice to the broker. Dismiss sends nothing. Never automatic. */
export function DetentionNoticeActions({
  loadId,
  stopId,
  to,
  preview,
  readOnly = false,
}: {
  loadId: number;
  stopId: number;
  to: string;
  preview: string;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DetentionNoticeActionResult, FormData>(detentionNoticeAction, null);
  if (state?.ok) {
    return (
      <p className="mt-2 text-xs font-medium text-emerald-700" role="status" data-detention-notice-done="">
        {state.message}
      </p>
    );
  }
  const disabled = pending || readOnly;
  return (
    <form action={formAction} className="detention-notice mt-2" data-detention-notice="">
      <input type="hidden" name="load_id" value={loadId} />
      <input type="hidden" name="stop_id" value={stopId} />
      <p className="detention-notice-preview">
        <span className="detention-notice-to">{to || "No broker email on this load"}</span>
        <span className="detention-notice-body">{preview}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="btn btn-primary text-xs"
          disabled={disabled || !to}
          aria-disabled={disabled || !to || undefined}
          data-detention-notice-approve=""
        >
          {pending ? "Sending…" : "Approve and email"}
        </button>
        <button
          type="submit"
          name="decision"
          value="dismiss"
          className="btn btn-ghost text-xs"
          disabled={disabled}
          aria-disabled={disabled || undefined}
          data-detention-notice-dismiss=""
        >
          Dismiss
        </button>
      </div>
      {state && !state.ok ? (
        <p className="mt-1 text-xs text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
