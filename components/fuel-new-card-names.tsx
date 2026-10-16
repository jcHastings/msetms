"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { addDriverCardAliasAction } from "@/lib/actions";

type DriverOption = { id: number; label: string };

function NewCardNameRow({ name, drivers, index }: { name: string; drivers: DriverOption[]; index: number }) {
  const [state, action, pending] = useActionState(addDriverCardAliasAction, null);
  const fieldId = `new-card-driver-${index}`;
  return (
    <li className="border-b border-slate-100 px-5 py-3 last:border-b-0" data-new-card-name={name}>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="alias" value={name} />
        <p className="min-w-[12rem] flex-1 text-sm font-semibold">{name}</p>
        <div className="field min-w-[14rem]">
          <label htmlFor={fieldId}>Driver for {name}</label>
          <select id={fieldId} name="driver_id" required defaultValue="">
            <option value="">Choose a driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add alias"}
        </button>
        <div className="basis-full">
          <FormBanner result={state} />
        </div>
      </form>
    </li>
  );
}

export function FuelNewCardNames({
  names,
  drivers,
  canEdit,
}: {
  names: string[];
  drivers: DriverOption[];
  canEdit: boolean;
}) {
  if (names.length === 0) return null;
  return (
    <section className="card mb-6 overflow-hidden" data-new-card-names="" aria-labelledby="new-card-names-title">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 id="new-card-names-title" className="text-sm font-semibold">
          New card names
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          These fuel card names match no driver. Add the alias once and the next match uses it.
        </p>
      </header>
      {canEdit ? (
        <ul>
          {names.map((name, index) => (
            <NewCardNameRow key={name} name={name} drivers={drivers} index={index} />
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 px-5 py-3 text-sm">
          {names.map((name) => (
            <li key={name} data-new-card-name={name}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
