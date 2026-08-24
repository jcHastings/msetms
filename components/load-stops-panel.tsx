"use client";

import { useState } from "react";
import { addStopAction, deleteStopAction, updateStopAction } from "@/lib/dispatcher-actions";
import { formatLocationLabel } from "@/lib/locations";
import { toInputDateTime } from "@/lib/format";
import type { LoadStop } from "@/lib/stops";
import type { Location } from "@/lib/types";

export function LoadStopsPanel({
  loadId,
  stops,
  locations = [],
}: {
  loadId: number;
  stops: LoadStop[];
  locations?: Location[];
}) {
  return (
    <section data-load-tab="stops" className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Edit Stops</h2>
          <p className="mt-1 text-sm text-slate-500">Pickup and delivery only. Add as many as the load needs.</p>
        </div>
        <div className="flex gap-2">
          <AddStopButton loadId={loadId} kind="pickup" />
          <AddStopButton loadId={loadId} kind="delivery" />
        </div>
      </div>
      {stops.length === 0 ? (
        <p className="text-sm text-slate-500">No stops yet. Add a pickup or delivery.</p>
      ) : (
        <ol className="space-y-4">
          {stops.map((stop, index) => (
            <li key={stop.id}>
              <StopCard stop={stop} index={index + 1} locations={locations} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AddStopButton({ loadId, kind }: { loadId: number; kind: "pickup" | "delivery" }) {
  return (
    <form action={addStopAction}>
      <input type="hidden" name="load_id" value={loadId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="name" value={kind === "pickup" ? "Pickup" : "Delivery"} />
      <input type="hidden" name="city" value="" />
      <input type="hidden" name="state" value="" />
      <button className="btn btn-secondary" type="submit">
        {kind === "pickup" ? "+ Add Pickup" : "+ Add Delivery"}
      </button>
    </form>
  );
}

function StopCard({
  stop,
  index,
  locations,
}: {
  stop: LoadStop;
  index: number;
  locations: Location[];
}) {
  const [kind, setKind] = useState(stop.kind);
  return (
    <form action={updateStopAction} className="rounded-lg border border-slate-200 p-4">
      <input type="hidden" name="stop_id" value={stop.id} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Stop {index} · {kind === "pickup" ? "Pickup" : "Delivery"}
        </h3>
        <button className="btn btn-ghost text-rose-700" type="submit" formAction={deleteStopAction}>
          Remove
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="field">
          <label>Type</label>
          <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "pickup" | "delivery")}>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        <div className="field">
          <label>Saved location</label>
          <select name="location_id" defaultValue={stop.location_id ?? ""}>
            <option value="">One-off address</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Location name</label>
          <input name="name" defaultValue={stop.name} required />
        </div>
        <div className="field">
          <label>Street</label>
          <input name="street" defaultValue={stop.street} />
        </div>
        <div className="field">
          <label>City</label>
          <input name="city" defaultValue={stop.city} />
        </div>
        <div className="field">
          <label>State</label>
          <input name="state" defaultValue={stop.state} maxLength={2} />
        </div>
        <div className="field">
          <label>Zip</label>
          <input name="zip" defaultValue={stop.zip} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input name="phone" defaultValue={stop.phone} />
        </div>
        <div className="field">
          <label>Window start</label>
          <input name="window_start" type="datetime-local" defaultValue={toInputDateTime(stop.window_start)} />
        </div>
        <div className="field">
          <label>Window end</label>
          <input name="window_end" type="datetime-local" defaultValue={toInputDateTime(stop.window_end)} />
        </div>
        <div className="field">
          <label>Cargo</label>
          <input name="cargo" defaultValue={stop.cargo} />
        </div>
        <div className="field">
          <label>Reference</label>
          <input name="reference" defaultValue={stop.reference || stop.confirmation} />
        </div>
        <div className="field md:col-span-2">
          <label>Driver instructions</label>
          <textarea name="instructions" rows={2} defaultValue={stop.instructions || stop.notes} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn btn-secondary" type="submit">
          Save stop
        </button>
      </div>
    </form>
  );
}
