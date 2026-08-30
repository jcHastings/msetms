"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { resetDispatcherPasswordAction } from "@/lib/dispatcher-password-actions";
import { DISPATCHER_PASSWORD_HINT } from "@/lib/dispatcher-password-shared";

export function DispatcherResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetDispatcherPasswordAction, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <FormBanner result={state} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-slate-600">{DISPATCHER_PASSWORD_HINT}</p>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
