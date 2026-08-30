"use client";

import { toInputDateTime } from "@/lib/format";
import type { LoadFormDefaults } from "@/components/load-basics-screen";
import type { Load, Location } from "@/lib/types";

export function LoadLaneFields({
  load,
  defaults = {},
}: {
  load?: Load;
  defaults?: LoadFormDefaults;
  locations?: Location[];
}) {
  const origin = load?.origin ?? defaults.origin ?? "";
  const destination = load?.destination ?? defaults.destination ?? "";
  const shipperId = String(load?.shipper_location_id ?? defaults.shipper_location_id ?? "");
  const consigneeId = String(load?.consignee_location_id ?? defaults.consignee_location_id ?? "");
  return (
    <section data-load-tab="lane" className="card grid gap-4 p-6 md:grid-cols-2">
      <h2 className="md:col-span-2 text-sm font-semibold">Pickup and delivery windows</h2>
      <input type="hidden" name="origin" value={origin} />
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="shipper_location_id" value={shipperId} />
      <input type="hidden" name="consignee_location_id" value={consigneeId} />
      <div className="field">
        <label htmlFor="pickup_start">Pickup start</label>
        <input
          id="pickup_start"
          name="pickup_start"
          type="datetime-local"
          defaultValue={load ? toInputDateTime(load.pickup_start) : defaults.pickup_start ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pickup_end">Pickup end</label>
        <input
          id="pickup_end"
          name="pickup_end"
          type="datetime-local"
          defaultValue={load ? toInputDateTime(load.pickup_end) : defaults.pickup_end ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="delivery_start">Delivery start</label>
        <input
          id="delivery_start"
          name="delivery_start"
          type="datetime-local"
          defaultValue={load ? toInputDateTime(load.delivery_start) : defaults.delivery_start ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="delivery_end">Delivery end</label>
        <input
          id="delivery_end"
          name="delivery_end"
          type="datetime-local"
          defaultValue={load ? toInputDateTime(load.delivery_end) : defaults.delivery_end ?? ""}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="special_instructions">Special instructions</label>
        <textarea
          id="special_instructions"
          name="special_instructions"
          rows={2}
          defaultValue={load?.special_instructions ?? defaults.special_instructions ?? ""}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="appointment_notes">Appointment notes</label>
        <textarea
          id="appointment_notes"
          name="appointment_notes"
          rows={2}
          defaultValue={load?.appointment_notes ?? defaults.appointment_notes ?? ""}
        />
      </div>
    </section>
  );
}
