"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import type { ActionResult, DriverWithTruck } from "@/lib/types";

export function DriverLoginForm({
  drivers,
  action,
}: {
  drivers: DriverWithTruck[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm">
      <FormBanner result={state} />
      <div className="mt-3 space-y-4">
        <div className="field">
          <label htmlFor="driver_id">Your name</label>
          <select id="driver_id" name="driver_id" required className="min-h-12 text-lg">
            <option value="">Select</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input id="pin" name="pin" inputMode="numeric" required className="min-h-12 text-lg" />
        </div>
        <button className="btn btn-primary min-h-12 w-full text-base" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Open my dispatch"}
        </button>
      </div>
    </form>
  );
}
