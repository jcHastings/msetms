"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStopAction, deleteStopAction, updateStopAction } from "@/lib/dispatcher-actions";
import { LocationPicker } from "@/components/location-picker";
import { useLoadEdit } from "@/components/load-edit-context";
import { applyLocationToStop, matchLocationForStop } from "@/lib/locations";
import { locationRuleLabels } from "@/lib/location-rules-shared";
import { formatStopWindow, toInputDateTime } from "@/lib/format";
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
            Type · name + address · date/time on each row. Picking a location saves that stop immediately.
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
                <th>Location · time</th>
                <th>Street</th>
                <th>City / ST / Zip</th>
                <th>Phone</th>
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

type StopDraft = {
  locationId: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  windowStart: string;
  windowEnd: string;
  reference: string;
  instructions: string;
};

function initialStopDraft(stop: LoadStop, locations: Location[]): StopDraft {
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
    windowStart: toInputDateTime(stop.window_start),
    windowEnd: toInputDateTime(stop.window_end),
    reference: stop.reference || stop.confirmation || "",
    instructions: stop.instructions || stop.notes || "",
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
  const router = useRouter();
  const edit = useLoadEdit();
  const [kind, setKind] = useState(stop.kind);
  const [draft, setDraft] = useState(() => initialStopDraft(stop, locations));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function persistStop(next: StopDraft, nextKind = kind) {
    const formData = new FormData();
    formData.set("stop_id", String(stop.id));
    formData.set("kind", nextKind);
    formData.set("name", next.name);
    formData.set("street", next.street);
    formData.set("city", next.city);
    formData.set("state", next.state);
    formData.set("zip", next.zip);
    formData.set("phone", next.phone);
    formData.set("location_id", next.locationId);
    formData.set("window_start", next.windowStart);
    formData.set("window_end", next.windowEnd);
    formData.set("cargo", stop.cargo);
    formData.set("reference", next.reference);
    formData.set("instructions", next.instructions);
    setSaving(true);
    try {
      await updateStopAction(formData);
      edit?.clearDirty();
      setSaved(true);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not save the stop.");
    } finally {
      setSaving(false);
    }
  }

  function pickLocation(locationId: string) {
    if (!locationId) {
      const next = { ...draft, locationId: "" };
      setDraft(next);
      if (stop.location_id) edit?.markDirty();
      return;
    }
    const location = locations.find((row) => String(row.id) === locationId);
    if (!location) return;
    const next = {
      ...draft,
      locationId,
      name: location.name,
      street: location.street ?? "",
      city: location.city ?? "",
      state: location.state ?? "",
      zip: location.zip ?? "",
      phone: location.phone ?? "",
    };
    setDraft(next);
    edit?.clearDirty();
    void persistStop(next);
  }

  const pickup = kind === "pickup";
  const windowLabel = formatStopWindow(stop.window_start, stop.window_end);
  const rules = locationRuleLabels(
    locations.find((location) => String(location.id) === draft.locationId) ??
      matchLocationForStop(locations, {
        name: draft.name,
        street: draft.street,
        city: draft.city,
        state: draft.state,
      }),
  );
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
              onChange={(event) => {
                const next = event.target.value as "pickup" | "delivery";
                setKind(next);
                if (next !== stop.kind) edit?.markDirty();
              }}
              className={`mt-1 ${pickup ? "stop-kind-pickup" : "stop-kind-delivery"}`}
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </form>
        </td>
        <td className="align-top min-w-56">
          <input form={`stop-form-${stop.id}`} name="name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required />
          <LocationPicker
            form={`stop-form-${stop.id}`}
            name="location_id"
            locations={locations}
            value={draft.locationId}
            onChange={pickLocation}
            emptyLabel="One-off address"
            placeholder="Type any name or address"
          />
          <p className="mt-1 text-[11px] text-slate-500" data-stop-autosave="">
            {saving ? "Saving location…" : saved || stop.location_id ? "Location is saved on this stop." : "Pick a saved location — it stays without Save."}
          </p>
          {windowLabel ? (
            <p className="mt-1 text-xs font-semibold text-slate-800" data-stop-window="">
              {windowLabel}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500" data-stop-window="">
              No {pickup ? "pickup" : "delivery"} time yet
            </p>
          )}
          <input
            form={`stop-form-${stop.id}`}
            name="window_start"
            type="datetime-local"
            className="mt-1"
            value={draft.windowStart}
            onChange={(event) => setDraft((current) => ({ ...current, windowStart: event.target.value }))}
          />
          <input
            form={`stop-form-${stop.id}`}
            name="window_end"
            type="datetime-local"
            className="mt-1"
            value={draft.windowEnd}
            onChange={(event) => setDraft((current) => ({ ...current, windowEnd: event.target.value }))}
          />
          <input form={`stop-form-${stop.id}`} type="hidden" name="cargo" defaultValue={stop.cargo} />
          {rules.map((rule) => (
            <p key={rule} className="mt-1 text-xs font-semibold text-amber-800" data-location-rule="">
              {rule}
            </p>
          ))}
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
        <td className="align-top min-w-28">
          <input
            form={`stop-form-${stop.id}`}
            name="reference"
            value={draft.reference}
            onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
          />
        </td>
        <td className="align-top min-w-40">
          <textarea
            form={`stop-form-${stop.id}`}
            name="instructions"
            rows={2}
            value={draft.instructions}
            onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
          />
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
          <td colSpan={9} data-leg-miles="">
            {formatRouteMiles(gapMiles)} to next stop
          </td>
        </tr>
      ) : null}
    </>
  );
}
