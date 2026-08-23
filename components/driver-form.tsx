"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { DRIVER_STATUSES, type ActionResult, type Driver, type Truck } from "@/lib/types";

type Props = {
  driver?: Driver;
  trucks: Truck[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function DriverForm({ driver, trucks, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card grid max-w-xl gap-4 p-6">
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={driver?.name} />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" defaultValue={driver?.phone} />
      </div>
      <div className="field">
        <label htmlFor="license">License / CDL</label>
        <input id="license" name="license" defaultValue={driver?.license} />
      </div>
      <div className="field">
        <label htmlFor="pin">Driver app PIN</label>
        <input id="pin" name="pin" defaultValue={driver?.pin} placeholder="4+ digits" />
      </div>
      <div className="field">
        <label htmlFor="samsara_driver_id">Samsara driver ID (HOS)</label>
        <input
          id="samsara_driver_id"
          name="samsara_driver_id"
          defaultValue={driver?.samsara_driver_id}
          placeholder="Optional — maps Hours of Service"
        />
      </div>
      <div className="field">
        <label htmlFor="truck_id">Assigned truck</label>
        <select id="truck_id" name="truck_id" defaultValue={driver?.truck_id ?? ""}>
          <option value="">None</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.unit_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={driver?.status ?? "available"}>
          {DRIVER_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
