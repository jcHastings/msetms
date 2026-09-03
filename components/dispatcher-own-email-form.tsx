"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { updateOwnContactAction } from "@/lib/dispatcher-password-actions";

export function DispatcherOwnEmailForm({
  email,
  phone,
}: {
  email: string;
  phone: string;
}) {
  const [state, action, pending] = useActionState(updateOwnContactAction, null);
  return (
    <section className="card space-y-4 p-6">
      <h2 className="text-sm font-semibold">Your email</h2>
      <p className="text-sm text-slate-600">
        {email.trim()
          ? "Sign-in emails a one-time code to this address after your password."
          : "Add an email on this user. Until you do, sign-in uses your password only. Forgot password also needs this email."}
      </p>
      <form action={action} className="space-y-4">
        <FormBanner result={state} />
        <div className="field">
          <label htmlFor="own_email">Email</label>
          <input id="own_email" name="email" type="email" defaultValue={email} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="own_phone">Phone</label>
          <input id="own_phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save contact"}
        </button>
      </form>
    </section>
  );
}
