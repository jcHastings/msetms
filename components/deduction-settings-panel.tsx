"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { deleteDeductionTemplateAction, saveDeductionTemplateAction } from "@/lib/settlement-actions";
import type { DeductionTemplate } from "@/lib/settlement-statement";

type DriverOption = { id: number; name: string };

function TemplateForm({
  template,
  drivers,
  canEdit,
}: {
  template?: DeductionTemplate;
  drivers: DriverOption[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveDeductionTemplateAction, null);
  const [removeState, removeAction, removePending] = useActionState(deleteDeductionTemplateAction, null);
  const idPrefix = template ? `deduction-${template.id}` : "deduction-new";
  return (
    <form action={action} className="grid gap-3 border-b border-slate-100 py-4 md:grid-cols-6 md:items-end">
      <div className="md:col-span-6">
        <FormBanner result={state} />
        <FormBanner result={removeState} />
        {template?.example ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Example, off until you turn it on</p> : null}
      </div>
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="field md:col-span-2">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} name="name" required defaultValue={template?.name ?? ""} disabled={!canEdit} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-amount`}>Amount</label>
        <input
          id={`${idPrefix}-amount`}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          required
          defaultValue={template?.amount ?? ""}
          disabled={!canEdit}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-basis`}>Basis</label>
        <select id={`${idPrefix}-basis`} name="basis" defaultValue={template?.basis ?? "fixed"} disabled={!canEdit}>
          <option value="fixed">Fixed, once a week</option>
          <option value="per_load">Per load</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-applies`}>Applies to</label>
        <select id={`${idPrefix}-applies`} name="applies_to" defaultValue={template?.applies_to ?? "company_driver"} disabled={!canEdit}>
          <option value="company_driver">Company drivers</option>
          <option value="owner_operator">Owner-operators</option>
          <option value="driver">One driver</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-driver`}>Driver</label>
        <select id={`${idPrefix}-driver`} name="driver_id" defaultValue={template?.driver_id ?? ""} disabled={!canEdit}>
          <option value="">—</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor={`${idPrefix}-active`}>
          <input
            id={`${idPrefix}-active`}
            name="active"
            type="checkbox"
            value="1"
            className="deduction-active-check"
            defaultChecked={Boolean(template?.active)}
            disabled={!canEdit}
          />{" "}
          Active
        </label>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-4 md:justify-end">
        <button type="submit" className="btn btn-secondary hit-target" disabled={!canEdit || pending} title={canEdit ? undefined : "View-only access"}>
          {pending ? "Saving…" : template ? "Save item" : "Add item"}
        </button>
        {template ? (
          <button
            type="submit"
            className="btn btn-secondary hit-target"
            formAction={removeAction}
            disabled={!canEdit || removePending}
            title={canEdit ? undefined : "View-only access"}
          >
            {removePending ? "Removing…" : "Remove"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function DeductionSettingsPanel({
  templates,
  drivers,
  canEdit,
}: {
  templates: DeductionTemplate[];
  drivers: DriverOption[];
  canEdit: boolean;
}) {
  return (
    <section className="card px-4 py-2" aria-labelledby="deduction-settings-title">
      <div className="border-b border-slate-100 py-4">
        <h2 id="deduction-settings-title" className="text-base font-semibold text-slate-900">
          Deduction items
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Example items are off. Turn one on only after you review the name, amount, and who it applies to. Inactive items
          do not change a statement. Nothing here pays a driver or sends a message.
        </p>
        {!canEdit ? <p className="mt-2 text-sm font-medium text-slate-700">View-only. You can read these items. Changes stay off.</p> : null}
      </div>
      <TemplateForm drivers={drivers} canEdit={canEdit} />
      {templates.length === 0 ? <p className="py-4 text-sm text-slate-600">No deduction items yet.</p> : null}
      {templates.map((template) => (
        <TemplateForm key={template.id} template={template} drivers={drivers} canEdit={canEdit} />
      ))}
    </section>
  );
}
