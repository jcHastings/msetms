"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { DRIVER_STATUSES, DRIVER_TYPES, type ActionResult, type Driver, type Truck } from "@/lib/types";

type Props = {
  driver?: Driver;
  trucks: Truck[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function DriverForm({ driver, trucks, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [kind, setKind] = useState(driver?.driver_type ?? "company_driver");

  return (
    <form action={formAction} className="card grid max-w-xl gap-4 p-6">
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={driver?.name} />
      </div>
      <div className="field">
        <label htmlFor="phone">Mobile</label>
        <input id="phone" name="phone" defaultValue={driver?.phone} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={driver?.email} />
      </div>
      <div className="field">
        <label htmlFor="driver_type">Driver type</label>
        <select
          id="driver_type"
          name="driver_type"
          value={kind}
          onChange={(event) => setKind(event.target.value as Driver["driver_type"])}
        >
          {DRIVER_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      {kind === "owner_operator" ? (
        <div className="field">
          <label htmlFor="pay_percent">Default pay %</label>
          <input
            id="pay_percent"
            name="pay_percent"
            type="number"
            min={0}
            max={100}
            step="0.1"
            defaultValue={driver?.pay_percent ?? 75}
          />
        </div>
      ) : null}
      <h2 className="text-sm font-semibold">Driver license</h2>
      <div className="field">
        <label htmlFor="license_state">State</label>
        <input id="license_state" name="license_state" maxLength={2} defaultValue={driver?.license_state} />
      </div>
      <div className="field">
        <label htmlFor="license_number">Number</label>
        <input id="license_number" name="license_number" defaultValue={driver?.license_number} />
      </div>
      <div className="field">
        <label htmlFor="license_expires">Expiration date</label>
        <input id="license_expires" name="license_expires" type="date" defaultValue={driver?.license_expires} />
      </div>
      <h2 className="text-sm font-semibold">Medical card</h2>
      <div className="field">
        <label htmlFor="medical_issued">Date issued</label>
        <input id="medical_issued" name="medical_issued" type="date" defaultValue={driver?.medical_issued} />
      </div>
      <div className="field">
        <label htmlFor="medical_expires">Expiration date</label>
        <input id="medical_expires" name="medical_expires" type="date" defaultValue={driver?.medical_expires} />
      </div>
      <div className="field">
        <label htmlFor="pin">Driver app PIN {driver ? "(leave blank to keep)" : ""}</label>
        <input
          id="pin"
          name="pin"
          defaultValue=""
          autoComplete="off"
          placeholder={driver?.pin ? "PIN is set" : "4+ digits"}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={driver?.notes} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={driver ? driver.active !== 0 : true} />
        Active
      </label>
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
