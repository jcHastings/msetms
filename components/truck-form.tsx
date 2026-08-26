"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { createTruckAction, updateTruckAction } from "@/lib/actions";
import type { FleetDriverOption, TruckFormValues } from "@/lib/fleet-form-shared";
import { US_STATES } from "@/lib/locations";
import { DEFAULT_CAB_TYPE, TRUCK_STATUSES, TRUCK_TYPES } from "@/lib/types";

type Props = {
  truck?: TruckFormValues;
  drivers?: FleetDriverOption[];
  submitLabel: string;
};

export function TruckForm({ truck, drivers = [], submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(truck ? updateTruckAction : createTruckAction, null);
  const [type, setType] = useState(truck?.type || DEFAULT_CAB_TYPE);

  return (
    <form
      action={(formData) => {
        formData.set("type", type || DEFAULT_CAB_TYPE);
        formAction(formData);
      }}
      className="card grid max-w-xl gap-4 p-6"
    >
      {truck ? <input type="hidden" name="id" value={truck.id} /> : null}
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="unit_number">Unit number</label>
        <input id="unit_number" name="unit_number" required defaultValue={truck?.unit_number} />
      </div>
      <div className="field">
        <label htmlFor="type">Cab type</label>
        <select id="type" name="type" value={type} onChange={(event) => setType(event.target.value)}>
          {TRUCK_TYPES.map((cab) => (
            <option key={cab.value} value={cab.value}>
              {cab.label}
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
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="field">
          <label htmlFor="plate">Plate</label>
          <input id="plate" name="plate" defaultValue={truck?.plate} />
        </div>
        <div className="field">
          <label htmlFor="plate_state">Plate state</label>
          <select id="plate_state" name="plate_state" defaultValue={truck?.plate_state || ""}>
            <option value="">—</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>
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
        <label htmlFor="model">Model</label>
        <input id="model" name="model" defaultValue={truck?.model} />
      </div>
      <div className="field">
        <label htmlFor="assigned_driver_id">Assigned driver</label>
        <select id="assigned_driver_id" name="assigned_driver_id" defaultValue={truck?.assigned_driver_id ?? ""}>
          <option value="">None</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="samsara_vehicle_id">Samsara vehicle ID (tractor GPS)</label>
        <input
          id="samsara_vehicle_id"
          name="samsara_vehicle_id"
          defaultValue={truck?.samsara_vehicle_id}
          placeholder="Samsara vehicle id — not the API token"
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
      <div className="field md:col-span-2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={truck?.notes} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={truck ? truck.active !== 0 : true} />
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
