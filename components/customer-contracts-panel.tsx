"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  deleteCustomerContractAction,
  deleteCustomerRequirementAction,
  saveCustomerDetentionTermsAction,
  saveCustomerRequirementAction,
  uploadCustomerContractAction,
} from "@/lib/customer-contract-actions";
import {
  CONTRACT_SOURCES,
  REQUIREMENT_TRIGGERS,
  requirementTriggerLabel,
} from "@/lib/customer-contract-shared";
import type { CustomerContractFile, CustomerDetentionTerms, CustomerRequirement } from "@/lib/customer-contracts";

export function CustomerContractsPanel({
  customerId,
  contracts,
  terms,
  requirements,
  canEdit,
}: {
  customerId: number;
  contracts: CustomerContractFile[];
  terms: CustomerDetentionTerms;
  requirements: CustomerRequirement[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-8" data-customer-contracts="" data-ui="customer-contracts">
      <section>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Contract packets</h2>
        <p className="mt-1 max-w-2xl text-base text-slate-800">
          Signed PDFs stay on this customer. The signed date and the packet source sit next to the file.
        </p>
        {contracts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-700">No contract PDF on this customer yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {contracts.map((file) => (
              <li key={file.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3" data-contract-file={file.id}>
                <div>
                  <a className="text-base font-semibold text-slate-900 hover:underline" href={`/api/customer-contracts/${file.id}`}>
                    {file.originalName}
                  </a>
                  <p className="mt-1 text-sm text-slate-700">
                    {file.sourceLabel}
                    {file.signedOn ? ` · signed ${file.signedOn}` : " · signed date not set"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className="btn btn-secondary" href={`/api/customer-contracts/${file.id}`}>
                    View
                  </a>
                  {canEdit ? <RemoveContract customerId={customerId} id={file.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? <UploadContract customerId={customerId} /> : null}
      </section>

      <section data-customer-detention-terms="">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Detention terms</h2>
        <p className="mt-1 max-w-2xl text-base text-slate-800">
          Used when the load&apos;s rate confirmation leaves a detention field blank. Notice lead is the minutes a later alert can read. Nothing here sends mail.
        </p>
        <TermsForm customerId={customerId} terms={terms} canEdit={canEdit} />
      </section>

      <section data-customer-requirements="">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Requirements</h2>
        <p className="mt-1 max-w-2xl text-base text-slate-800">
          Each row becomes a reminder on that customer&apos;s loads and on the desk. The reminder flags. It does not send.
        </p>
        {requirements.length === 0 ? (
          <p className="mt-4 text-sm text-slate-700">No requirements yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {requirements.map((item) => (
              <li key={item.id} className="bg-slate-50 px-4 py-3" data-requirement={item.id}>
                <p className="text-base font-semibold text-slate-900">{item.requirement}</p>
                <p className="mt-1 text-sm text-slate-700">
                  {requirementTriggerLabel(item.trigger)}
                  {item.deadlineHours != null ? ` · ${item.deadlineHours} hours` : ""}
                  {item.timeOfDay ? ` · ${item.timeOfDay}` : ""}
                  {item.page ? ` · ${item.page}` : ""}
                </p>
                {item.quotedClause ? <p className="mt-2 text-sm text-slate-800">{item.quotedClause}</p> : null}
                {canEdit ? <RemoveRequirement customerId={customerId} id={item.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? <RequirementForm customerId={customerId} /> : null}
      </section>
    </div>
  );
}

function UploadContract({ customerId }: { customerId: number }) {
  const [state, action, pending] = useActionState(uploadCustomerContractAction, null);
  return (
    <form action={action} className="mt-5 grid gap-3 md:grid-cols-2" data-contract-upload="">
      <FormBanner result={state} />
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="field">
        <label htmlFor="contract_file">PDF</label>
        <input id="contract_file" name="file" type="file" accept="application/pdf,.pdf" required />
      </div>
      <div className="field">
        <label htmlFor="signed_on">Signed date</label>
        <input id="signed_on" name="signed_on" type="date" />
      </div>
      <div className="field">
        <label htmlFor="source">Source</label>
        <select id="source" name="source" required defaultValue="highway">
          {CONTRACT_SOURCES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving" : "Attach PDF"}
        </button>
      </div>
    </form>
  );
}

function RemoveContract({ customerId, id }: { customerId: number; id: number }) {
  const [state, action, pending] = useActionState(deleteCustomerContractAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        Remove
      </button>
      <FormBanner result={state} />
    </form>
  );
}

function TermsForm({
  customerId,
  terms,
  canEdit,
}: {
  customerId: number;
  terms: CustomerDetentionTerms;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveCustomerDetentionTermsAction, null);
  return (
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
      <FormBanner result={state} />
      <input type="hidden" name="customer_id" value={customerId} />
      <NumberField id="rate_per_hour" label="Rate per hour" value={terms.ratePerHour} disabled={!canEdit} />
      <NumberField id="free_hours" label="Free hours" value={terms.freeHours} disabled={!canEdit} />
      <NumberField
        id="billing_increment_minutes"
        label="Billing increment minutes"
        value={terms.billingIncrementMinutes}
        disabled={!canEdit}
      />
      <NumberField id="cap_per_day" label="Cap per day" value={terms.capPerDay} disabled={!canEdit} />
      <NumberField id="cap_per_stop" label="Cap per stop" value={terms.capPerStop} disabled={!canEdit} />
      <NumberField id="notice_lead_minutes" label="Notice lead minutes" value={terms.noticeLeadMinutes} disabled={!canEdit} />
      <div className="field md:col-span-2">
        <label htmlFor="conditions">Conditions</label>
        <textarea id="conditions" name="conditions" rows={4} defaultValue={terms.conditions ?? ""} disabled={!canEdit} />
      </div>
      {canEdit ? (
        <div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Saving" : "Save detention terms"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  disabled,
}: {
  id: string;
  label: string;
  value: number | null | undefined;
  disabled: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} inputMode="decimal" defaultValue={value ?? ""} disabled={disabled} />
    </div>
  );
}

function RequirementForm({ customerId }: { customerId: number }) {
  const [state, action, pending] = useActionState(saveCustomerRequirementAction, null);
  return (
    <form action={action} className="mt-5 grid gap-3 md:grid-cols-2" data-requirement-form="">
      <FormBanner result={state} />
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="field">
        <label htmlFor="trigger">Trigger</label>
        <select id="trigger" name="trigger" defaultValue="after_delivery">
          {REQUIREMENT_TRIGGERS.map((trigger) => (
            <option key={trigger} value={trigger}>
              {requirementTriggerLabel(trigger)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="deadline_hours">Deadline hours</label>
        <input id="deadline_hours" name="deadline_hours" inputMode="decimal" />
      </div>
      <div className="field">
        <label htmlFor="time_of_day">Time of day</label>
        <input id="time_of_day" name="time_of_day" placeholder="08:00" />
      </div>
      <div className="field">
        <label htmlFor="page">Page</label>
        <input id="page" name="page" />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="requirement">Requirement</label>
        <textarea id="requirement" name="requirement" rows={2} required />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="quoted_clause">Quoted clause</label>
        <textarea id="quoted_clause" name="quoted_clause" rows={3} />
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving" : "Add requirement"}
        </button>
      </div>
    </form>
  );
}

function RemoveRequirement({ customerId, id }: { customerId: number; id: number }) {
  const [state, action, pending] = useActionState(deleteCustomerRequirementAction, null);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        Remove
      </button>
      <FormBanner result={state} />
    </form>
  );
}
