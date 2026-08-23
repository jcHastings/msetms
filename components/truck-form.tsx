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
        <label htmlFor="samsara_vehicle_id">Samsara vehicle ID</label>
        <input
          id="samsara_vehicle_id"
          name="samsara_vehicle_id"
          defaultValue={truck?.samsara_vehicle_id}
          placeholder="Optional"
        />
      </div>
      <div className="field">
        <label htmlFor="trailer_number">Default trailer #</label>
        <input id="trailer_number" name="trailer_number" defaultValue={truck?.trailer_number} />
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
