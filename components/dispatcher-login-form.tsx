"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { dispatcherLoginAction } from "@/lib/dispatch-actions";
import type { ActionResult } from "@/lib/types";

export function DispatcherLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    dispatcherLoginAction,
    null as ActionResult | null,
  );

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm">
      <FormBanner result={state} />
      <input type="hidden" name="next" value={next} />
      <div className="mt-3 space-y-4">
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" required className="min-h-12 text-lg" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="min-h-12 text-lg"
          />
        </div>
        <button className="btn btn-primary min-h-12 w-full text-base" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Open dispatch"}
        </button>
      </div>
    </form>
  );
}
