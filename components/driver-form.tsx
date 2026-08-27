"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { createDriverAction, updateDriverAction } from "@/lib/actions";
import type { DriverFormValues } from "@/lib/fleet-form-shared";
import { CDL_ENDORSEMENTS, DRIVER_TYPES, normalizeDriverKind, parseCdlEndorsements } from "@/lib/types";

type Props = {
  driver?: DriverFormValues;
  filesHref?: string;
  submitLabel?: string;
};

export function DriverForm({ driver, filesHref, submitLabel = "Save" }: Props) {
  const [state, formAction, pending] = useActionState(driver ? updateDriverAction : createDriverAction, null);

  return (
    <form action={formAction} className="card grid max-w-3xl gap-4 p-6 md:grid-cols-2">
      {driver ? <input type="hidden" name="id" value={driver.id} /> : null}
      <div className="md:col-span-2">
        <FormBanner result={state} />
        <p className="text-sm font-semibold text-slate-900">Driver 1</p>
      </div>
      <fieldset className="field md:col-span-2">
        <legend className="text-sm font-semibold text-slate-900">Driver Type *</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {DRIVER_TYPES.map((type) => (
            <label
              key={type.value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm has-[:checked]:border-slate-900 has-[:checked]:ring-1 has-[:checked]:ring-slate-900"
            >
              <input
                type="radio"
                name="driver_type"
                value={type.value}
                required
                defaultChecked={driver ? normalizeDriverKind(driver.driver_type) === type.value : false}
              />
              <span className="font-semibold text-slate-900">{type.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="name">Name *</label>
        <input id="name" name="name" required defaultValue={driver?.name} />
      </div>
      <div className="field">
        <label htmlFor="phone">Telephone *</label>
        <input id="phone" name="phone" required defaultValue={driver?.phone} />
      </div>
      <div className="field">
        <label htmlFor="alt_phone">Alt - Tel#</label>
        <input id="alt_phone" name="alt_phone" defaultValue={driver?.alt_phone} />
      </div>
      <div className="field">
        <label htmlFor="cell_phone">Cell Phone</label>
        <input id="cell_phone" name="cell_phone" defaultValue={driver?.cell_phone} />
      </div>
      <div className="field">
        <label htmlFor="pager">Pager#</label>
        <input id="pager" name="pager" defaultValue={driver?.pager} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="email">Email Address</label>
        <input id="email" name="email" type="email" defaultValue={driver?.email} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="address">Address</label>
        <input id="address" name="address" defaultValue={driver?.address} />
      </div>
      <div className="field">
        <label htmlFor="country">Country *</label>
        <input id="country" name="country" required defaultValue={driver?.country || "USA"} />
      </div>
      <div className="field">
        <label htmlFor="state">State *</label>
        <input id="state" name="state" required defaultValue={driver?.state} />
      </div>
      <div className="field">
        <label htmlFor="city">City *</label>
        <input id="city" name="city" required defaultValue={driver?.city} />
      </div>
      <div className="field">
        <label htmlFor="postal_zip">Postal/Zip</label>
        <input id="postal_zip" name="postal_zip" defaultValue={driver?.postal_zip} />
      </div>
      <div className="field">
        <label htmlFor="date_of_birth">Date of Birth</label>
        <input id="date_of_birth" name="date_of_birth" type="date" defaultValue={driver?.date_of_birth} />
      </div>
      <div className="field">
        <label htmlFor="date_of_hire">Date of Hire</label>
        <input id="date_of_hire" name="date_of_hire" type="date" defaultValue={driver?.date_of_hire} />
      </div>
      <div className="field">
        <label htmlFor="license_number">License No.</label>
        <input id="license_number" name="license_number" defaultValue={driver?.license_number} />
      </div>
      <div className="field">
        <label htmlFor="license_expires">Exp. Date</label>
        <input id="license_expires" name="license_expires" type="date" defaultValue={driver?.license_expires} />
      </div>
      <fieldset className="field md:col-span-2" data-cdl-endorsements="">
        <legend className="text-sm font-semibold text-slate-900">CDL endorsements</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CDL_ENDORSEMENTS.map((item) => (
            <label key={item.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="cdl_endorsements"
                value={item.value}
                defaultChecked={parseCdlEndorsements(driver?.cdl_endorsements).includes(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="medical_issued">Last Medical</label>
        <input id="medical_issued" name="medical_issued" type="date" defaultValue={driver?.medical_issued} />
      </div>
      <div className="field">
        <label htmlFor="medical_expires">Next Medical</label>
        <input id="medical_expires" name="medical_expires" type="date" defaultValue={driver?.medical_expires} />
      </div>
      <div className="field">
        <label htmlFor="drug_test_last">Last Drug Test</label>
        <input id="drug_test_last" name="drug_test_last" type="date" defaultValue={driver?.drug_test_last} />
      </div>
      <div className="field">
        <label htmlFor="drug_test_next">Next Drug Test</label>
        <input id="drug_test_next" name="drug_test_next" type="date" defaultValue={driver?.drug_test_next} />
      </div>
      <div className="field">
        <label htmlFor="termination_date">Termination Date</label>
        <input id="termination_date" name="termination_date" type="date" defaultValue={driver?.termination_date} />
      </div>
      <div className="field">
        <label htmlFor="active">Status</label>
        <select id="active" name="active" defaultValue={driver ? (driver.active !== 0 ? "1" : "0") : "1"}>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pin">Driver app PIN</label>
        <input
          id="pin"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          minLength={4}
          maxLength={8}
          pattern="\d{4,8}"
          placeholder={driver?.has_app_login ? "Leave blank to keep current" : "4–8 digits"}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="notes">Internal Notes</label>
        <textarea id="notes" name="notes" rows={4} defaultValue={driver?.notes} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        <a className="btn btn-secondary" href="/fleet/drivers">
          Cancel
        </a>
        {filesHref ? (
          <a className="btn btn-secondary" href={filesHref}>
            Files
          </a>
        ) : (
          <button className="btn btn-secondary" type="button" disabled title="Save the driver first">
            Files
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
