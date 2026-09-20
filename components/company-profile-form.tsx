"use client";

import { SettingsForm } from "@/components/settings-form";
import { saveCompanyContactAction } from "@/lib/settings-actions";
import type { CompanyProfile } from "@/lib/types";

export function CompanyProfileForm({
  profile,
  canEdit = true,
}: {
  profile: CompanyProfile;
  canEdit?: boolean;
}) {
  return (
    <SettingsForm action={saveCompanyContactAction} submitLabel="Save company contact" canEdit={canEdit}>
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
      <div className="field md:col-span-2">
        <label htmlFor="street">Street</label>
        <input id="street" name="street" defaultValue={profile.street} />
      </div>
      <div className="field">
        <label htmlFor="city">City</label>
        <input id="city" name="city" defaultValue={profile.city} />
      </div>
      <div className="field">
        <label htmlFor="state">State</label>
        <input id="state" name="state" maxLength={2} defaultValue={profile.state} />
      </div>
      <div className="field">
        <label htmlFor="zip">ZIP</label>
        <input id="zip" name="zip" defaultValue={profile.zip} />
      </div>
    </SettingsForm>
  );
}
