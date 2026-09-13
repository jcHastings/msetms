"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { PasswordField } from "@/components/password-field";
import type { ActionResult } from "@/lib/types";

export function DriverLoginForm({
  action,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm">
      <FormBanner result={state} />
      <div className="mt-3 space-y-4">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="min-h-12 text-lg"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordField
            id="password"
            name="password"
            required
            autoComplete="current-password"
            className="min-h-12 text-lg"
          />
        </div>
        <button className="btn btn-primary min-h-12 w-full text-base" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Open my dispatch"}
        </button>
      </div>
    </form>
  );
}
