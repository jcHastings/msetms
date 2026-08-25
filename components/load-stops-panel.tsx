"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStopAction, deleteStopAction, updateStopAction } from "@/lib/dispatcher-actions";
import { LocationPicker } from "@/components/location-picker";
import { useLoadEdit } from "@/components/load-edit-context";
import { applyLocationToStop, formatLocationAddress, matchLocationForStop } from "@/lib/locations";
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
        <div className="space-y-3" data-stops-grid="">
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
  const address = formatLocationAddress(draft);
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
      <article
        className={`rounded-lg border border-slate-200 p-3 ${pickup ? "stop-row-pickup" : "stop-row-delivery"}`}
        data-stop-front=""
      >
        <form action={updateStopAction} id={`stop-form-${stop.id}`} className="hidden">
          <input type="hidden" name="stop_id" value={stop.id} />
        </form>
        <div className="stop-front">
          <div>
            <div className="text-xs font-semibold text-slate-500">#{index}</div>
            <span className={`stop-chip mt-1 ${pickup ? "stop-chip-pickup" : "stop-chip-delivery"}`}>
              {pickup ? "Pickup" : "Delivery"}
            </span>
            <select
              form={`stop-form-${stop.id}`}
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
          </div>
          <div className="min-w-0">
            <input
              form={`stop-form-${stop.id}`}
              name="name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <LocationPicker
              form={`stop-form-${stop.id}`}
              name="location_id"
              locations={locations}
              value={draft.locationId}
              onChange={pickLocation}
              emptyLabel="One-off address"
              placeholder="Type any name or address"
            />
            {address ? <p className="stop-front-address mt-1">{address}</p> : null}
            <p className="mt-1 text-[11px] text-slate-500" data-stop-autosave="">
              {saving
                ? "Saving location…"
                : saved || stop.location_id
                  ? "Location is saved on this stop."
                  : "Pick a saved location — it stays without Save."}
            </p>
            {rules.map((rule) => (
              <p key={rule} className="mt-1 text-xs font-semibold text-amber-800" data-location-rule="">
                {rule}
              </p>
            ))}
          </div>
          <div className="stop-front-window" data-stop-window="">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {pickup ? "Pickup window" : "Delivery window"}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {windowLabel || `No ${pickup ? "pickup" : "delivery"} time yet`}
            </p>
            <input
              form={`stop-form-${stop.id}`}
              name="window_start"
              type="datetime-local"
              className="mt-2 w-full"
              value={draft.windowStart}
              onChange={(event) => setDraft((current) => ({ ...current, windowStart: event.target.value }))}
            />
            <input
              form={`stop-form-${stop.id}`}
              name="window_end"
              type="datetime-local"
              className="mt-1 w-full"
              value={draft.windowEnd}
              onChange={(event) => setDraft((current) => ({ ...current, windowEnd: event.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <input form={`stop-form-${stop.id}`} name="street" value={draft.street} onChange={(event) => setDraft((current) => ({ ...current, street: event.target.value }))} placeholder="Street" />
          <div className="grid grid-cols-[1fr_3rem_5rem] gap-1">
            <input form={`stop-form-${stop.id}`} name="city" value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
            <input form={`stop-form-${stop.id}`} name="state" value={draft.state} maxLength={2} onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))} placeholder="ST" />
            <input form={`stop-form-${stop.id}`} name="zip" value={draft.zip} onChange={(event) => setDraft((current) => ({ ...current, zip: event.target.value }))} placeholder="ZIP" />
          </div>
          <input form={`stop-form-${stop.id}`} name="phone" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
          <input
            form={`stop-form-${stop.id}`}
            name="reference"
            value={draft.reference}
            onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
            placeholder="Reference"
          />
          <textarea
            form={`stop-form-${stop.id}`}
            name="instructions"
            rows={2}
            className="md:col-span-2"
            value={draft.instructions}
            onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
            placeholder="Notes"
          />
          <input form={`stop-form-${stop.id}`} type="hidden" name="cargo" defaultValue={stop.cargo} />
          <div className="flex flex-wrap items-start gap-2">
            <button className="btn btn-secondary" type="submit" form={`stop-form-${stop.id}`}>
              Save
            </button>
            <button className="btn btn-ghost text-rose-700" type="submit" form={`stop-form-${stop.id}`} formAction={deleteStopAction}>
              Remove
            </button>
          </div>
        </div>
      </article>
      {gapMiles != null ? (
        <p className="px-1 text-xs font-semibold text-slate-600" data-leg-miles="">
          {formatRouteMiles(gapMiles)} to next stop
        </p>
      ) : null}
    </>
  );
}
