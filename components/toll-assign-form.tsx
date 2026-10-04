"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { assignTollDriverAction } from "@/lib/actions";

type Option = { id: number; label: string };

export function TollAssignForm({
  tollId,
  drivers,
  loads,
}: {
  tollId: number;
  drivers: Option[];
  loads: Option[];
}) {
  const [state, formAction, pending] = useActionState(assignTollDriverAction, null);
  const [driverId, setDriverId] = useState("");
  const [loadId, setLoadId] = useState("");
  const canAssign = Boolean(driverId || loadId);
  return (
    <form action={formAction} className="flex flex-col gap-1" data-toll-assign-form="">
      <input type="hidden" name="toll_id" value={tollId} />
      <input type="hidden" name="driver_id" value={driverId} />
      <input type="hidden" name="load_id" value={loadId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
          aria-label="Driver"
        >
          <option value="">Driver…</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={loadId}
          onChange={(event) => setLoadId(event.target.value)}
          aria-label="Load"
        >
          <option value="">Load…</option>
          {loads.map((load) => (
            <option key={load.id} value={load.id}>
              {load.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          type="submit"
          disabled={pending || !canAssign}
          title={canAssign ? undefined : "Pick a driver or a load."}
        >
          {pending ? "Saving…" : "Assign"}
        </button>
      </div>
      <FormBanner result={state} hideOk />
    </form>
  );
}
