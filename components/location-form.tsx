"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  LOCATION_ROLES,
  LOCATION_SCHEDULING,
  type ActionResult,
  type Location,
} from "@/lib/types";

type Props = {
  location?: Location;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function LocationForm({ location, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <FormBanner result={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field md:col-span-2">
          <label htmlFor="name">Location name</label>
          <input id="name" name="name" required defaultValue={location?.name} placeholder="Warehouse or DC name" />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="street">Street</label>
          <input id="street" name="street" defaultValue={location?.street} />
        </div>
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" required defaultValue={location?.city} />
        </div>
        <div className="field">
          <label htmlFor="state">State</label>
          <input id="state" name="state" required maxLength={2} defaultValue={location?.state} placeholder="TN" />
        </div>
        <div className="field">
          <label htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" defaultValue={location?.zip} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={location?.phone} />
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={location?.role ?? "both"}>
            {LOCATION_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={location?.notes}
            placeholder="Gate code, dock notes, commodity limits"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800">Scheduling</h2>
        <p className="mt-1 text-sm text-slate-500">
          Appointment vs FCFS, hours, and how to book. This shows on the load and the driver dispatch.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="field">
            <label htmlFor="scheduling_type">How they take trucks</label>
            <select id="scheduling_type" name="scheduling_type" defaultValue={location?.scheduling_type ?? "fcfs"}>
              {LOCATION_SCHEDULING.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hours">Hours</label>
            <input
              id="hours"
              name="hours"
              defaultValue={location?.hours}
              placeholder="Mon–Fri 07:00–15:00"
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="scheduling_notes">Scheduling notes</label>
            <textarea
              id="scheduling_notes"
              name="scheduling_notes"
              rows={2}
              defaultValue={location?.scheduling_notes}
              placeholder="Call 60 minutes out. Dock 4. Detention after 2 hours."
            />
          </div>
          <div className="field">
            <label htmlFor="scheduling_email">Scheduling email</label>
            <input
              id="scheduling_email"
              name="scheduling_email"
              type="email"
              defaultValue={location?.scheduling_email}
            />
          </div>
          <div className="field">
            <label htmlFor="scheduling_portal">Scheduling portal</label>
            <input
              id="scheduling_portal"
              name="scheduling_portal"
              defaultValue={location?.scheduling_portal}
              placeholder="https://"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
