"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  addDriverCardAliasAction,
  deleteDriverCardAliasAction,
  updateDriverCardAliasAction,
} from "@/lib/actions";
import type { DriverCardAlias } from "@/lib/fuel-card-aliases";

function AliasRow({ alias }: { alias: DriverCardAlias }) {
  const [saveState, saveAction, savePending] = useActionState(updateDriverCardAliasAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDriverCardAliasAction, null);
  const fieldId = `driver-card-alias-${alias.id}`;
  return (
    <li className="border-b border-slate-100 py-3 last:border-b-0">
      <form action={saveAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="alias_id" value={alias.id} />
        <div className="field min-w-[16rem] flex-1">
          <label htmlFor={fieldId}>Card name</label>
          <input id={fieldId} name="alias" defaultValue={alias.alias} required autoComplete="off" />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={savePending}>
          {savePending ? "Saving…" : "Save"}
        </button>
      </form>
      <form action={deleteAction} className="mt-2">
        <input type="hidden" name="alias_id" value={alias.id} />
        <button className="btn btn-ghost" type="submit" disabled={deletePending}>
          {deletePending ? "Removing…" : `Delete ${alias.alias}`}
        </button>
      </form>
      <div className="mt-2">
        <FormBanner result={saveState} />
        <FormBanner result={deleteState} hideOk />
      </div>
    </li>
  );
}

export function DriverCardAliases({
  driverId,
  aliases,
  canEdit,
}: {
  driverId: number;
  aliases: DriverCardAlias[];
  canEdit: boolean;
}) {
  const [addState, addAction, addPending] = useActionState(addDriverCardAliasAction, null);
  return (
    <section className="card mb-4 p-5" data-driver-card-aliases="" aria-labelledby="driver-card-aliases-title">
      <h2 id="driver-card-aliases-title" className="text-sm font-semibold">
        Fuel card names
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Names printed on this driver&apos;s fuel card. The importer checks these before the cleaned name.
      </p>
      {aliases.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No card names yet.</p>
      ) : canEdit ? (
        <ul className="mt-2">
          {aliases.map((alias) => (
            <AliasRow key={alias.id} alias={alias} />
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {aliases.map((alias) => (
            <li key={alias.id}>{alias.alias}</li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form action={addAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <input type="hidden" name="driver_id" value={driverId} />
          <div className="field min-w-[16rem] flex-1">
            <label htmlFor="new-driver-card-alias">New card name</label>
            <input id="new-driver-card-alias" name="alias" required autoComplete="off" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={addPending}>
            {addPending ? "Adding…" : "Add card name"}
          </button>
          <div className="basis-full">
            <FormBanner result={addState} />
          </div>
        </form>
      ) : null}
    </section>
  );
}
