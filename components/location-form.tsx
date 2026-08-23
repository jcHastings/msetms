"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { US_STATES } from "@/lib/locations";
import {
  LOCATION_ROLES,
  SCHEDULING_TYPES,
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
          <label htmlFor="name">Name</label>
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
          <select id="state" name="state" required defaultValue={location?.state ?? ""}>
            <option value="">Select state</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
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
        <div className="field">
          <label htmlFor="scheduling_type">Scheduling</label>
          <select id="scheduling_type" name="scheduling_type" defaultValue={location?.scheduling_type ?? "fcfs"}>
            {SCHEDULING_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-2">
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
            rows={3}
            defaultValue={location?.scheduling_notes}
            placeholder="Appointment window, dock numbers, gate instructions"
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={location?.notes} />
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
