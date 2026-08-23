"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { toInputDateTime } from "@/lib/format";
import {
  LOAD_STATUSES,
  labelForLoadStatus,
  type ActionResult,
  type Customer,
  type DriverWithTruck,
  type Load,
  type Truck,
} from "@/lib/types";

type Props = {
  customers: Customer[];
  trucks: Truck[];
  drivers: DriverWithTruck[];
  load?: Load;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function LoadForm({ customers, trucks, drivers, load, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <FormBanner result={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field">
          <label htmlFor="customer_id">Customer</label>
          <select id="customer_id" name="customer_id" required defaultValue={load?.customer_id ?? ""}>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={load?.status ?? "available"}>
            {LOAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelForLoadStatus(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="origin">Origin</label>
          <input
            id="origin"
            name="origin"
            required
            defaultValue={load?.origin}
            placeholder="City, ST"
          />
        </div>
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            name="destination"
            required
            defaultValue={load?.destination}
            placeholder="City, ST"
          />
        </div>
        <div className="field">
          <label htmlFor="pickup_start">Pickup window start</label>
          <input
            id="pickup_start"
            name="pickup_start"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.pickup_start) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="pickup_end">Pickup window end</label>
          <input
            id="pickup_end"
            name="pickup_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.pickup_end) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_start">Delivery window start</label>
          <input
            id="delivery_start"
            name="delivery_start"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_start) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_end">Delivery window end</label>
          <input
            id="delivery_end"
            name="delivery_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_end) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="commodity">Commodity</label>
          <input id="commodity" name="commodity" defaultValue={load?.commodity} />
        </div>
        <div className="field">
          <label htmlFor="weight">Weight (lbs)</label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={0}
            defaultValue={load?.weight ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="rate">Rate (USD)</label>
          <input
            id="rate"
            name="rate"
            type="number"
            min={0}
            step="0.01"
            defaultValue={load?.rate ?? ""}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={load?.notes} />
        </div>
        <div className="field">
          <label htmlFor="truck_id">Assigned truck</label>
          <select id="truck_id" name="truck_id" defaultValue={load?.truck_id ?? ""}>
            <option value="">Unassigned</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>
                {truck.unit_number}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="driver_id">Assigned driver</label>
          <select id="driver_id" name="driver_id" defaultValue={load?.driver_id ?? ""}>
            <option value="">Unassigned</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
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
