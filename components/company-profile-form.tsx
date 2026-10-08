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
        <input
          id="company_name"
          name="company_name"
          required
          defaultValue={profile.company_name}
          aria-describedby="company-name-hint"
        />
        <p id="company-name-hint" className="text-xs text-slate-500">
          MS Express, or the legal name M&amp;S Loads DBA MS Express. A bare M&amp;S Loads name is blocked.
        </p>
      </div>
      <div className="field">
        <label htmlFor="usdot">USDOT</label>
        <input id="usdot" name="usdot" defaultValue={profile.usdot ?? ""} maxLength={32} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="mc">MC</label>
        <input id="mc" name="mc" defaultValue={profile.mc ?? ""} maxLength={32} autoComplete="off" />
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
        <label htmlFor="ar_email">AR email</label>
        <input
          id="ar_email"
          name="ar_email"
          type="email"
          autoComplete="email"
          defaultValue={profile.ar_email ?? ""}
          aria-describedby="ar-email-hint"
        />
        <p id="ar-email-hint" className="text-xs text-slate-500">
          Invoice From address. Required before an invoice can be emailed.
        </p>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="street">Remit street address</label>
        <input
          id="street"
          name="street"
          defaultValue={profile.street}
          autoComplete="street-address"
          aria-describedby="remit-street-hint"
        />
        <p id="remit-street-hint" className="text-xs text-slate-500">
          Required before an invoice can be emailed. MS Express is in Hastings, NE.
        </p>
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
      <p className="md:col-span-2 text-sm text-slate-600">
        USDOT and MC print on invoices and settlement statements. They come from this company profile.
      </p>
    </SettingsForm>
  );
}
