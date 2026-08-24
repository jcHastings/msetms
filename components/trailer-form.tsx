"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { createTrailerAction, updateTrailerAction } from "@/lib/actions";
import type { FleetTruckOption, TrailerFormValues } from "@/lib/fleet-form-shared";
import { TRAILER_TYPES, TRUCK_STATUSES } from "@/lib/types";

type Props = {
  trailer?: TrailerFormValues;
  trucks?: FleetTruckOption[];
  submitLabel: string;
};

export function TrailerForm({ trailer, trucks = [], submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(trailer ? updateTrailerAction : createTrailerAction, null);

  return (
    <form action={formAction} className="card grid max-w-xl gap-4 p-6">
      {trailer ? <input type="hidden" name="id" value={trailer.id} /> : null}
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="unit_number">Trailer number</label>
        <input id="unit_number" name="unit_number" required defaultValue={trailer?.unit_number} />
      </div>
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue={trailer?.type ?? "reefer"}>
          {TRAILER_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="vin">VIN</label>
        <input id="vin" name="vin" defaultValue={trailer?.vin} />
      </div>
      <div className="field">
        <label htmlFor="plate">Plate</label>
        <input id="plate" name="plate" defaultValue={trailer?.plate} />
      </div>
      <div className="field">
        <label htmlFor="truck_id">Assigned truck</label>
        <select id="truck_id" name="truck_id" defaultValue={trailer?.truck_id ?? ""}>
          <option value="">None</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.unit_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="orbcomm_asset_id">ORBCOMM asset ID</label>
        <input
          id="orbcomm_asset_id"
          name="orbcomm_asset_id"
          defaultValue={trailer?.orbcomm_asset_id}
          placeholder="From Reefer Status Report"
        />
      </div>
      <div className="field">
        <label htmlFor="reefer_setpoint_f">Default reefer setpoint (°F)</label>
        <input
          id="reefer_setpoint_f"
          name="reefer_setpoint_f"
          type="number"
          step="0.1"
          defaultValue={trailer?.reefer_setpoint_f ?? ""}
        />
      </div>
      <h2 className="text-sm font-semibold">Registration</h2>
      <div className="field">
        <label htmlFor="registration_issued">Date issued</label>
        <input id="registration_issued" name="registration_issued" type="date" defaultValue={trailer?.registration_issued} />
      </div>
      <div className="field">
        <label htmlFor="registration_expires">Expiration date</label>
        <input id="registration_expires" name="registration_expires" type="date" defaultValue={trailer?.registration_expires} />
      </div>
      <h2 className="text-sm font-semibold">DOT inspection</h2>
      <div className="field">
        <label htmlFor="dot_inspected_on">Date completed</label>
        <input id="dot_inspected_on" name="dot_inspected_on" type="date" defaultValue={trailer?.dot_inspected_on} />
      </div>
      <div className="field">
        <label htmlFor="dot_expires">Expiration date</label>
        <input id="dot_expires" name="dot_expires" type="date" defaultValue={trailer?.dot_expires} />
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={trailer?.status ?? "available"}>
          {TRUCK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={trailer?.notes} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={trailer ? trailer.active !== 0 : true} />
        Active
      </label>
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
