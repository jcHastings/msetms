"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import type { Dispatcher } from "@/lib/dispatcher-session";
import { roleLabel } from "@/lib/settings-shared";
import type { ActionResult } from "@/lib/types";

export function DispatcherLoginForm({
  dispatchers,
  action,
}: {
  dispatchers: Dispatcher[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="card space-y-4 p-6">
      <FormBanner result={state} />
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
    </form>
  );
}
