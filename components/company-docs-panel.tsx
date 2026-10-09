"use client";

import { useActionState, useId } from "react";
import { FormBanner } from "@/components/form-banner";
import type { CompanyDocSlotDef } from "@/lib/company-docs-shared";
import type { ActionResult } from "@/lib/types";

export type CompanyDocRow = {
  id: number;
  label: string;
  originalName: string;
  expiresOn: string;
  expiresLabel: string;
  tone: "ok" | "expiring" | "expired";
  toneLabel: string;
  status: "current" | "replaced" | "retired";
  uploadedBy: string;
  createdLabel: string;
  endedLabel: string;
};

export type UnitOption = { value: string; label: string };

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

const STATUS_LABEL: Record<CompanyDocRow["status"], string> = {
  current: "Current",
  replaced: "Replaced",
  retired: "Removed",
};

function ToneBadge({ row }: { row: CompanyDocRow }) {
  const cls =
    row.tone === "expired"
      ? "status-pill status-tone-danger"
      : row.tone === "expiring"
        ? "status-pill status-tone-warning"
        : "status-pill";
  return <span className={cls}>{row.toneLabel}</span>;
}

function UploadForm({
  slot,
  action,
  units,
  replacesId,
  submitLabel,
}: {
  slot: CompanyDocSlotDef;
  action: Action;
  units: UnitOption[];
  replacesId?: number;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const base = useId();
  return (
    <form action={formAction} className="space-y-3" data-company-doc-upload={slot.value}>
      <FormBanner result={state} />
      <input type="hidden" name="slot" value={slot.value} />
      {replacesId ? <input type="hidden" name="replaces_id" value={replacesId} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="field md:col-span-1">
          <label htmlFor={`${base}-file`}>File</label>
          <input id={`${base}-file`} name="file" type="file" required accept="application/pdf,image/*" />
        </div>
        <div className="field">
          <label htmlFor={`${base}-expires`}>Expiry date</label>
          <input id={`${base}-expires`} name="expires_on" type="date" required aria-describedby={`${base}-expires-help`} />
          <p id={`${base}-expires-help`} className="mt-1 text-xs text-slate-600">
            The office gets a warning 30 days before.
          </p>
        </div>
        {slot.unitTaggable && !replacesId ? (
          <div className="field">
            <label htmlFor={`${base}-unit`}>Applies to</label>
            <select id={`${base}-unit`} name="unit" defaultValue="">
              <option value="">All units (company card)</option>
              {units.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <button className="btn btn-primary min-h-11 whitespace-nowrap active:scale-[0.98]" type="submit" disabled={pending}>
        {pending ? "Uploading…" : submitLabel}
      </button>
    </form>
  );
}

function RemoveForm({ id, action, label }: { id: number; action: Action; label: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn btn-secondary min-h-11 whitespace-nowrap"
        disabled={pending}
        aria-label={`Remove ${label} from the current set`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state && !state.ok ? (
        <span role="alert" className="ml-2 text-sm text-rose-800">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function CompanyDocSlotCard({
  slot,
  current,
  history,
  units,
  canEdit,
  uploadAction,
  retireAction,
}: {
  slot: CompanyDocSlotDef;
  current: CompanyDocRow[];
  history: CompanyDocRow[];
  units: UnitOption[];
  canEdit: boolean;
  uploadAction: Action;
  retireAction: Action;
}) {
  const headingId = useId();
  const missing = slot.required && current.length === 0;
  return (
    <section className="card p-5" aria-labelledby={headingId} data-company-doc-slot={slot.value}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <h2 id={headingId} className="text-base font-semibold text-slate-900">
            {slot.label}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{slot.hint}</p>
        </div>
        {slot.required ? (
          <span className={missing ? "status-pill status-tone-danger" : "status-pill"}>
            {missing ? "Required · missing" : "Required"}
          </span>
        ) : null}
      </div>

      {current.length ? (
        <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {current.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{row.label}</p>
                <p className="break-words text-sm text-slate-600">{row.originalName}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span>Expires {row.expiresLabel}</span>
                  <ToneBadge row={row} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a className="btn btn-secondary min-h-11" href={`/api/company-docs/${row.id}`} target="_blank" rel="noopener">
                  Open
                </a>
                {canEdit && slot.multiple ? <RemoveForm id={row.id} action={retireAction} label={row.label} /> : null}
              </div>
              {canEdit && slot.multiple ? (
                <details className="w-full md:basis-full">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Replace this file</summary>
                  <div className="mt-3">
                    <UploadForm slot={slot} action={uploadAction} units={units} replacesId={row.id} submitLabel="Replace file" />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-700">
          No file yet. Drivers who ask Assist for the {slot.label.toLowerCase()} hear that it is not on file.
        </p>
      )}

      {canEdit ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {slot.multiple ? "Add a file" : current.length ? "Upload a new version" : "Upload"}
          </h3>
          <UploadForm
            slot={slot}
            action={uploadAction}
            units={units}
            submitLabel={slot.multiple ? "Add file" : current.length ? "Replace file" : "Upload file"}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">View only. Administrator or Standard can upload.</p>
      )}

      {history.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">History ({history.length})</summary>
          <ul className="mt-2 space-y-2 text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-company-doc-history={row.status}>
                <span className="font-medium text-slate-900">{STATUS_LABEL[row.status]}</span>
                <a className="break-all underline" href={`/api/company-docs/${row.id}`} target="_blank" rel="noopener">
                  {row.originalName}
                </a>
                <span className="text-slate-600">
                  {row.label} · expires {row.expiresLabel} · added {row.createdLabel}
                  {row.uploadedBy ? ` by ${row.uploadedBy}` : ""}
                  {row.endedLabel ? ` · ended ${row.endedLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
