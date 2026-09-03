"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { forgotDispatcherPasswordAction } from "@/lib/dispatcher-password-actions";

export function DispatcherForgotForm() {
  const [state, action, pending] = useActionState(forgotDispatcherPasswordAction, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <FormBanner result={state} />
      <p className="text-sm text-slate-600">
        Enter the email on your user record. If it matches, we send a reset link there — not by text.
        If this user has no email, ask an Administrator to set a temporary password on Users.
      </p>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset email"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="login-forgot">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
