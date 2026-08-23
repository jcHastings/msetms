"use client";

import { useActionState } from "react";
import { sendToQuickbooksAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/types";

export function QuickbooksSendRow({
  loadId,
  alreadySent,
  invoiceLabel,
}: {
  loadId: number;
  alreadySent: boolean;
  invoiceLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    sendToQuickbooksAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="load_id" value={loadId} />
      {alreadySent ? <input type="hidden" name="confirm_resend" value="1" /> : null}
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Sending…" : alreadySent ? "Send again" : "Send invoice"}
      </button>
      {alreadySent && invoiceLabel ? (
        <span className="text-xs text-slate-500">{invoiceLabel}</span>
      ) : null}
      {state && !state.ok ? <span className="text-xs text-rose-700">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-emerald-700">Recorded</span> : null}
    </form>
  );
}
