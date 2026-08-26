"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { assignFuelDriverAction } from "@/lib/actions";

type Option = { id: number; label: string };

export function FuelAssignForm({
  fuelId,
  drivers,
  loads,
}: {
  fuelId: number;
  drivers: Option[];
  loads: Option[];
}) {
  const [state, formAction, pending] = useActionState(assignFuelDriverAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="fuel_id" value={fuelId} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="driver_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="">Driver…</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.label}
            </option>
          ))}
        </select>
        <select name="load_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          <option value="">Load…</option>
          {loads.map((load) => (
            <option key={load.id} value={load.id}>
              {load.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Assign"}
        </button>
      </div>
      <FormBanner result={state} hideOk />
    </form>
  );
}
