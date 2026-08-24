import { toInputDateTime } from "@/lib/format";
import type { LoadFormDefaults } from "@/components/load-basics-screen";
import type { Load, Location } from "@/lib/types";

export function LoadLaneFields({
  load,
  defaults = {},
  locations = [],
}: {
  load?: Load;
  defaults?: LoadFormDefaults;
  locations?: Location[];
}) {
  return (
    <section data-load-tab="lane" className="card grid gap-4 p-6 md:grid-cols-2">
      <h2 className="md:col-span-2 text-sm font-semibold">Lane from rate con</h2>
      <p className="md:col-span-2 text-sm text-slate-500">
        Review extracted origin, destination, windows, and rate before saving. Stops stay on Edit Stops after the load exists.
      </p>
      <div className="field">
        <label htmlFor="origin">Origin</label>
        <input id="origin" name="origin" defaultValue={load?.origin ?? defaults.origin ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="destination">Destination</label>
        <input id="destination" name="destination" defaultValue={load?.destination ?? defaults.destination ?? ""} />
      </div>
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
      <div className="field">
        <label htmlFor="rate">Rate</label>
        <input id="rate" name="rate" type="number" min={0} step="0.01" defaultValue={load?.rate ?? defaults.rate ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="shipper_location_id">Shipper location</label>
        <select
          id="shipper_location_id"
          name="shipper_location_id"
          defaultValue={load?.shipper_location_id ?? defaults.shipper_location_id ?? ""}
        >
          <option value="">—</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="consignee_location_id">Consignee location</label>
        <select
          id="consignee_location_id"
          name="consignee_location_id"
          defaultValue={load?.consignee_location_id ?? defaults.consignee_location_id ?? ""}
        >
          <option value="">—</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
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
