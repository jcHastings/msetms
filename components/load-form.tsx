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

type Defaults = Partial<{
  customer_id: number | null;
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  weight: number | null;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  reference_number: string;
  po_number: string;
  reefer_setpoint_f: number | null;
  trailer_number: string;
}>;

type Props = {
  customers: Customer[];
  trucks: Truck[];
  drivers: DriverWithTruck[];
  load?: Load;
  defaults?: Defaults;
  inboxId?: string;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function LoadForm({
  customers,
  trucks,
  drivers,
  load,
  defaults,
  inboxId,
  action,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const extraDefaults = defaults ?? {};

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <FormBanner result={state} />
      {inboxId ? <input type="hidden" name="inbox_id" value={inboxId} /> : null}
      <input type="hidden" name="customer_name" value={extraDefaults.customer_name ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field">
          <label htmlFor="customer_id">Customer</label>
          <select
            id="customer_id"
            name="customer_id"
            required={!extraDefaults.customer_name}
            defaultValue={load?.customer_id ?? extraDefaults.customer_id ?? ""}
          >
            <option value="">
              {extraDefaults.customer_name
                ? `Create “${extraDefaults.customer_name}”`
                : "Select customer"}
            </option>
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
            defaultValue={load?.origin ?? extraDefaults.origin ?? ""}
            placeholder="City, ST"
          />
        </div>
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            name="destination"
            required
            defaultValue={load?.destination ?? extraDefaults.destination ?? ""}
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
            defaultValue={load ? toInputDateTime(load.pickup_start) : extraDefaults.pickup_start ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="pickup_end">Pickup window end</label>
          <input
            id="pickup_end"
            name="pickup_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.pickup_end) : extraDefaults.pickup_end ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_start">Delivery window start</label>
          <input
            id="delivery_start"
            name="delivery_start"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_start) : extraDefaults.delivery_start ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_end">Delivery window end</label>
          <input
            id="delivery_end"
            name="delivery_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_end) : extraDefaults.delivery_end ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="commodity">Commodity</label>
          <input
            id="commodity"
            name="commodity"
            defaultValue={load?.commodity ?? extraDefaults.commodity ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="weight">Weight (lbs)</label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={0}
            defaultValue={load?.weight ?? extraDefaults.weight ?? ""}
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
            defaultValue={load?.rate ?? extraDefaults.rate ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="reference_number">Reference / rate con #</label>
          <input
            id="reference_number"
            name="reference_number"
            defaultValue={load?.reference_number ?? extraDefaults?.reference_number ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="po_number">PO number</label>
          <input id="po_number" name="po_number" defaultValue={load?.po_number ?? extraDefaults?.po_number ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="reefer_setpoint_f">Reefer setpoint (°F)</label>
          <input
            id="reefer_setpoint_f"
            name="reefer_setpoint_f"
            type="number"
            step="0.1"
            defaultValue={load?.reefer_setpoint_f ?? extraDefaults?.reefer_setpoint_f ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="trailer_number">Trailer #</label>
          <input
            id="trailer_number"
            name="trailer_number"
            defaultValue={load?.trailer_number ?? extraDefaults?.trailer_number ?? ""}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="special_instructions">Special instructions (driver sees these)</label>
          <textarea
            id="special_instructions"
            name="special_instructions"
            rows={4}
            defaultValue={load?.special_instructions ?? extraDefaults?.special_instructions ?? ""}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="appointment_notes">Appointment notes</label>
          <textarea
            id="appointment_notes"
            name="appointment_notes"
            rows={2}
            defaultValue={load?.appointment_notes ?? extraDefaults?.appointment_notes ?? ""}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="notes">Internal notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={load?.notes ?? extraDefaults?.notes ?? ""} />
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
