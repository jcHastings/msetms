"use client";

import Link from "next/link";
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
  const needsEmailCode = Boolean(state?.ok && state.needsEmailCode);
  return (
    <form action={formAction} className="card space-y-4 p-6">
      <FormBanner result={state} hideOk={needsEmailCode} />
      {needsEmailCode ? (
        <>
          <p className="text-sm text-slate-600">
            {state && state.ok
              ? state.message
              : "Enter the sign-in code we emailed you."}
          </p>
          <div className="field">
            <label htmlFor="email_code">Sign-in code</label>
            <input
              id="email_code"
              name="email_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </button>
          <button
            className="btn btn-ghost w-full"
            type="submit"
            name="resend"
            value="1"
            formNoValidate
            disabled={pending}
          >
            {pending ? "Sending…" : "Resend code"}
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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-sm">
            <Link href="/login/forgot" className="font-semibold underline">
              Forgot password
            </Link>
          </p>
        </>
      )}
    </form>
  );
}
