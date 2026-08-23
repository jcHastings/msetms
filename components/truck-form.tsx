"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  TRUCK_STATUSES,
  TRUCK_TYPES,
  type ActionResult,
  type Truck,
} from "@/lib/types";

type Props = {
  truck?: Truck;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function TruckForm({ truck, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card grid max-w-xl gap-4 p-6">
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="unit_number">Unit number</label>
        <input id="unit_number" name="unit_number" required defaultValue={truck?.unit_number} />
      </div>
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue={truck?.type ?? "dry_van"}>
          {TRUCK_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="capacity_lbs">Capacity (lbs)</label>
        <input
          id="capacity_lbs"
          name="capacity_lbs"
          type="number"
          min={1}
          required
          defaultValue={truck?.capacity_lbs ?? 45000}
        />
      </div>
      <div className="field">
        <label htmlFor="vin">VIN</label>
        <input id="vin" name="vin" defaultValue={truck?.vin} />
      </div>
      <div className="field">
        <label htmlFor="plate">Plate</label>
        <input id="plate" name="plate" defaultValue={truck?.plate} />
      </div>
      <div className="field">
        <label htmlFor="year">Year</label>
        <input id="year" name="year" defaultValue={truck?.year} />
      </div>
      <div className="field">
        <label htmlFor="make">Make</label>
        <input id="make" name="make" defaultValue={truck?.make} />
      </div>
      <div className="field">
        <label htmlFor="samsara_vehicle_id">Samsara vehicle ID (tractor GPS)</label>
        <input
          id="samsara_vehicle_id"
          name="samsara_vehicle_id"
          defaultValue={truck?.samsara_vehicle_id}
          placeholder="Tractor ID in Samsara — not the API token"
        />
      </div>
      <h2 className="text-sm font-semibold">Registration</h2>
      <div className="field">
        <label htmlFor="registration_issued">Date issued</label>
        <input id="registration_issued" name="registration_issued" type="date" defaultValue={truck?.registration_issued} />
      </div>
      <div className="field">
        <label htmlFor="registration_expires">Expiration date</label>
        <input id="registration_expires" name="registration_expires" type="date" defaultValue={truck?.registration_expires} />
      </div>
      <h2 className="text-sm font-semibold">DOT inspection</h2>
      <div className="field">
        <label htmlFor="dot_inspected_on">Date completed</label>
        <input id="dot_inspected_on" name="dot_inspected_on" type="date" defaultValue={truck?.dot_inspected_on} />
      </div>
      <div className="field">
        <label htmlFor="dot_expires">Expiration date</label>
        <input id="dot_expires" name="dot_expires" type="date" defaultValue={truck?.dot_expires} />
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={truck?.status ?? "available"}>
          {TRUCK_STATUSES.map((status) => (
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
