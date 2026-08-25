"use client";

import { useState } from "react";
import { addStopAction, deleteStopAction, updateStopAction } from "@/lib/dispatcher-actions";
import { applyLocationToStop, formatLocationLabel, matchLocationForStop } from "@/lib/locations";
import { locationRuleLabels } from "@/lib/location-rules-shared";
import { toInputDateTime } from "@/lib/format";
import { formatRouteMiles, milesForStopGap, type LoadRouteGuide } from "@/lib/routing-shared";
import type { LoadStop } from "@/lib/stops";
import type { Location } from "@/lib/types";

export function LoadStopsPanel({
  loadId,
  stops,
  locations = [],
  routeGuide,
}: {
  loadId: number;
  stops: LoadStop[];
  locations?: Location[];
  routeGuide?: LoadRouteGuide;
}) {
  return (
    <section data-load-tab="stops" className="card overflow-hidden">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Stops</h2>
          <p className="mt-1 text-xs text-slate-600">
            Pickup rows are green. Delivery rows are red. Miles show between legs when a route exists.
          </p>
        </div>
        <div className="flex gap-2">
          <AddStopButton loadId={loadId} kind="pickup" />
          <AddStopButton loadId={loadId} kind="delivery" />
        </div>
      </div>
      <div className="space-y-4 p-5">
      {stops.length === 0 ? (
        <p className="text-sm text-slate-500">No stops yet. Add a pickup or delivery.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid text-sm" data-stops-grid="">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Location</th>
                <th>Street</th>
                <th>City / ST / Zip</th>
                <th>Phone</th>
                <th>Window</th>
                <th>Reference</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop, index) => (
                <StopGridBlock
                  key={stop.id}
                  stop={stop}
                  index={index + 1}
                  locations={locations}
                  gapMiles={
                    index < stops.length - 1
                      ? milesForStopGap(index, stops.length, routeGuide ?? { totalMiles: null, legMiles: [] })
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
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

function initialStopDraft(stop: LoadStop, locations: Location[]) {
  const picked = stop.location_id ? locations.find((location) => location.id === stop.location_id) : null;
  const matched = picked ?? matchLocationForStop(locations, stop);
  const filled = matched ? applyLocationToStop(stop, matched) : stop;
  return {
    locationId: filled.location_id ? String(filled.location_id) : "",
    name: filled.name,
    street: filled.street ?? "",
    city: filled.city ?? "",
    state: filled.state ?? "",
    zip: filled.zip ?? "",
    phone: filled.phone ?? "",
  };
}

function StopGridBlock({
  stop,
  index,
  locations,
  gapMiles,
}: {
  stop: LoadStop;
  index: number;
  locations: Location[];
  gapMiles: number | null;
}) {
  const [kind, setKind] = useState(stop.kind);
  const [draft, setDraft] = useState(() => initialStopDraft(stop, locations));

  function pickLocation(locationId: string) {
    if (!locationId) {
      setDraft((current) => ({ ...current, locationId: "" }));
      return;
    }
    const location = locations.find((row) => String(row.id) === locationId);
    if (!location) {
      setDraft((current) => ({ ...current, locationId }));
      return;
    }
    setDraft((current) => {
      const filled = applyLocationToStop(
        {
          name: current.name,
          street: current.street,
          city: current.city,
          state: current.state,
          zip: current.zip,
          phone: current.phone,
          location_id: Number(locationId),
        },
        location,
      );
      return {
        locationId,
        name: filled.name,
        street: filled.street ?? "",
        city: filled.city ?? "",
        state: filled.state ?? "",
        zip: filled.zip ?? "",
        phone: filled.phone ?? "",
      };
    });
  }

  const pickup = kind === "pickup";
  return (
    <>
      <tr className={pickup ? "stop-row-pickup" : "stop-row-delivery"}>
        <td className="align-top font-semibold">{index}</td>
        <td className="align-top">
          <form action={updateStopAction} id={`stop-form-${stop.id}`} className="contents">
            <input type="hidden" name="stop_id" value={stop.id} />
            <span className={`stop-chip ${pickup ? "stop-chip-pickup" : "stop-chip-delivery"}`}>
              {pickup ? "Pickup" : "Delivery"}
            </span>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as "pickup" | "delivery")}
              className={`mt-1 ${pickup ? "stop-kind-pickup" : "stop-kind-delivery"}`}
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </form>
        </td>
        <td className="align-top min-w-40">
          <input form={`stop-form-${stop.id}`} name="name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required />
          <select
            form={`stop-form-${stop.id}`}
            name="location_id"
            value={draft.locationId}
            className="mt-1"
            onChange={(event) => pickLocation(event.target.value)}
          >
            <option value="">One-off address</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
          {draft.locationId
            ? locationRuleLabels(locations.find((location) => String(location.id) === draft.locationId)).map((rule) => (
                <p key={rule} className="mt-1 text-xs font-semibold text-amber-800" data-location-rule="">
                  {rule}
                </p>
              ))
            : null}
        </td>
        <td className="align-top min-w-36">
          <input form={`stop-form-${stop.id}`} name="street" value={draft.street} onChange={(event) => setDraft((current) => ({ ...current, street: event.target.value }))} />
        </td>
        <td className="align-top min-w-40">
          <div className="grid grid-cols-[1fr_3rem_5rem] gap-1">
            <input form={`stop-form-${stop.id}`} name="city" value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} />
            <input form={`stop-form-${stop.id}`} name="state" value={draft.state} maxLength={2} onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))} />
            <input form={`stop-form-${stop.id}`} name="zip" value={draft.zip} onChange={(event) => setDraft((current) => ({ ...current, zip: event.target.value }))} />
          </div>
        </td>
        <td className="align-top min-w-28">
          <input form={`stop-form-${stop.id}`} name="phone" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
        </td>
        <td className="align-top min-w-40">
          <input form={`stop-form-${stop.id}`} name="window_start" type="datetime-local" defaultValue={toInputDateTime(stop.window_start)} />
          <input form={`stop-form-${stop.id}`} name="window_end" type="datetime-local" className="mt-1" defaultValue={toInputDateTime(stop.window_end)} />
          <input form={`stop-form-${stop.id}`} type="hidden" name="cargo" defaultValue={stop.cargo} />
        </td>
        <td className="align-top min-w-28">
          <input form={`stop-form-${stop.id}`} name="reference" defaultValue={stop.reference || stop.confirmation} />
        </td>
        <td className="align-top min-w-40">
          <textarea form={`stop-form-${stop.id}`} name="instructions" rows={2} defaultValue={stop.instructions || stop.notes} />
        </td>
        <td className="align-top whitespace-nowrap">
          <button className="btn btn-secondary" type="submit" form={`stop-form-${stop.id}`}>
            Save
          </button>
          <button className="btn btn-ghost text-rose-700" type="submit" form={`stop-form-${stop.id}`} formAction={deleteStopAction}>
            Remove
          </button>
        </td>
      </tr>
      {gapMiles != null ? (
        <tr className="bg-slate-100 text-xs font-semibold text-slate-600">
          <td colSpan={10} data-leg-miles="">
            {formatRouteMiles(gapMiles)} to next stop
          </td>
        </tr>
      ) : null}
    </>
  );
}
