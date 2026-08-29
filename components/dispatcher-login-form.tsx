"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import type { PublicDispatcher } from "@/lib/settings-shared";
import { roleLabel } from "@/lib/settings-shared";
import type { ActionResult } from "@/lib/types";

export function DispatcherLoginForm({
  dispatchers,
  action,
}: {
  dispatchers: PublicDispatcher[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const needsTotp = Boolean(state?.ok && state.needsTotp);
  return (
    <form action={formAction} className="card space-y-4 p-6">
      <FormBanner result={state} hideOk={needsTotp} />
      {needsTotp ? (
        <>
          <p className="text-sm text-slate-600">
            {state && state.ok ? state.message : "Enter the 6-digit code from your authenticator app."}
          </p>
          <div className="field">
            <label htmlFor="totp">Authenticator code</label>
            <input
              id="totp"
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
            />
          </div>
          <div className="field">
            <label htmlFor="recovery_code">Or recovery code</label>
            <input id="recovery_code" name="recovery_code" autoComplete="off" />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="dispatcher_id">Dispatcher</label>
            <select id="dispatcher_id" name="dispatcher_id" required defaultValue="">
              <option value="">Select name</option>
              {dispatchers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {roleLabel(person.role)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pin">PIN</label>
            <input id="pin" name="pin" inputMode="numeric" required autoComplete="off" />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </>
      )}
    </form>
  );
}
