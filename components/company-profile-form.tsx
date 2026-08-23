"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { updateCompanyProfileAction } from "@/lib/actions";
import type { ActionResult, CompanyProfile } from "@/lib/types";

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const [state, formAction, pending] = useActionState(
    updateCompanyProfileAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <FormBanner result={state} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="company_name">Company name</label>
        <input id="company_name" name="company_name" required defaultValue={profile.company_name} />
      </div>
      <div className="field">
        <label htmlFor="dispatcher_name">Dispatcher</label>
        <input id="dispatcher_name" name="dispatcher_name" required defaultValue={profile.dispatcher_name} />
      </div>
      <div className="field">
        <label htmlFor="dispatcher_phone">Phone</label>
        <input id="dispatcher_phone" name="dispatcher_phone" defaultValue={profile.dispatcher_phone} />
      </div>
      <div className="field">
        <label htmlFor="dispatcher_fax">Fax</label>
        <input id="dispatcher_fax" name="dispatcher_fax" defaultValue={profile.dispatcher_fax} />
      </div>
      <div className="field">
        <label htmlFor="dispatcher_email">Email</label>
        <input id="dispatcher_email" name="dispatcher_email" defaultValue={profile.dispatcher_email} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save company header"}
        </button>
      </div>
    </form>
  );
}
