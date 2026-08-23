"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { resetDispatcherTotpAction } from "@/lib/settings-actions";

export function ResetTotpForm({ userId, enrolled, userName }: { userId: number; enrolled: boolean; userName: string }) {
  const [state, action, pending] = useActionState(resetDispatcherTotpAction, null);
  return (
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">2-step verification</h2>
      <p className="mt-1 text-sm text-slate-600">
        {enrolled
          ? `${userName} has 2-step on. Reset so they can sign in with PIN again (and re-enroll).`
          : `${userName} has not enrolled. Reset clears any unfinished setup.`}
      </p>
      <form action={action} className="mt-4 space-y-3">
        <FormBanner result={state} />
        <input type="hidden" name="user_id" value={userId} />
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Resetting…" : "Reset 2-step"}
        </button>
      </form>
    </section>
  );
}
