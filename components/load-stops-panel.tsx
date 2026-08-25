"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addStopAction,
  deleteStopAction,
  reorderStopsAction,
  updateStopAction,
} from "@/lib/dispatcher-actions";
import { LocationPicker } from "@/components/location-picker";
import { useLoadEdit } from "@/components/load-edit-context";
import { isAssignEdit, isFirstAssign } from "@/lib/first-assign";
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
  const router = useRouter();
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; kind: "pickup" | "delivery"; stop?: LoadStop } | null>(
    null,
  );
  const [order, setOrder] = useState(stops.map((stop) => stop.id));
  const orderRef = useRef(order);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  useEffect(() => {
    const next = stops.map((stop) => stop.id);
    setOrder(next);
    orderRef.current = next;
  }, [stops]);

  const orderedStops = order
    .map((id) => stops.find((stop) => stop.id === id))
    .filter((stop): stop is LoadStop => Boolean(stop));

  async function persistOrder(nextIds: number[]) {
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("stop_ids", nextIds.join(","));
    await reorderStopsAction(formData);
    router.refresh();
  }

  return (
    <section data-load-tab="stops" className="card overflow-hidden">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Stops</h2>
          <p className="mt-1 text-xs text-slate-600">
            Add Stop opens a popup for location, appointment, PO, and notes. Appointment time stays on the
            list and saves in place. Drag a row to reorder — miles follow the new order.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setDialog({ mode: "add", kind: "pickup" })}>
            + Add Pickup
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDialog({ mode: "add", kind: "delivery" })}
          >
            + Add Delivery
          </button>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {orderedStops.length === 0 ? (
          <p className="text-sm text-slate-500">No stops yet. Add a pickup or delivery.</p>
        ) : (
          <div className="space-y-3" data-stops-grid="">
            {orderedStops.map((stop, index) => (
              <StopGridBlock
                key={stop.id}
                stop={stop}
                index={index + 1}
                locations={locations}
                dragging={draggingId === stop.id}
                gapMiles={
                  index < orderedStops.length - 1
                    ? milesForStopGap(index, orderedStops.length, routeGuide ?? { totalMiles: null, legMiles: [] })
                    : null
                }
                onEdit={() => setDialog({ mode: "edit", kind: stop.kind, stop })}
                onDragStart={() => setDraggingId(stop.id)}
                onDragOver={(overId) => {
                  if (draggingId == null || draggingId === overId) return;
                  setOrder((current) => {
                    const from = current.indexOf(draggingId);
                    const to = current.indexOf(overId);
                    if (from < 0 || to < 0) return current;
                    const next = current.slice();
                    next.splice(from, 1);
                    next.splice(to, 0, draggingId);
                    orderRef.current = next;
                    return next;
                  });
                }}
                onDrop={() => {
                  setDraggingId(null);
                  const nextIds = orderRef.current;
                  if (nextIds.join(",") !== stops.map((item) => item.id).join(",")) {
                    void persistOrder(nextIds);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
      {dialog ? (
        <StopDialog
          loadId={loadId}
          mode={dialog.mode}
          kind={dialog.kind}
          stop={dialog.stop}
          locations={locations}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
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

function emptyDraft(kind: "pickup" | "delivery"): StopDraft {
  return {
    locationId: "",
    name: kind === "pickup" ? "Pickup" : "Delivery",
    street: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    windowStart: "",
    windowEnd: "",
    reference: "",
    instructions: "",
  };
}

function applyLocationToDraft(draft: StopDraft, location: Location): StopDraft {
  return {
    ...draft,
    locationId: String(location.id),
    name: location.name,
    street: location.street ?? "",
    city: location.city ?? "",
    state: location.state ?? "",
    zip: location.zip ?? "",
    phone: location.phone ?? "",
  };
}

function StopDialog({
  loadId,
  mode,
  kind,
  stop,
  locations,
  onClose,
}: {
  loadId: number;
  mode: "add" | "edit";
  kind: "pickup" | "delivery";
  stop?: LoadStop;
  locations: Location[];
  onClose: () => void;
}) {
  const router = useRouter();
  const edit = useLoadEdit();
  const [stopKind, setStopKind] = useState(stop?.kind ?? kind);
  const [draft, setDraft] = useState(() => (stop ? initialStopDraft(stop, locations) : emptyDraft(kind)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const persistedLocationId = stop?.location_id ? String(stop.location_id) : "";

  function pickLocation(locationId: string) {
    if (!locationId) {
      setDraft((current) => ({ ...current, locationId: "" }));
      return;
    }
    const location = locations.find((row) => String(row.id) === locationId);
    if (!location) return;
    setDraft((current) => applyLocationToDraft(current, location));
  }

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      if (mode === "add") {
        formData.set("load_id", String(loadId));
        if (!String(formData.get("name") ?? "").trim()) {
          formData.set("name", stopKind === "pickup" ? "Pickup" : "Delivery");
        }
        await addStopAction(formData);
      } else if (stop) {
        formData.set("stop_id", String(stop.id));
        await updateStopAction(formData);
        edit?.clearDirty();
      }
      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the stop.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pay-item-dialog-backdrop" role="dialog" aria-label={mode === "add" ? "Add stop" : "Edit stop"} data-add-stop-dialog="">
      <form action={onSubmit} className="pay-item-dialog card max-w-xl space-y-3 p-5">
        <h3 className="text-sm font-semibold">{mode === "add" ? "Add Stop" : "Edit Stop"}</h3>
        <div className="field">
          <label>Type</label>
          <select name="kind" value={stopKind} onChange={(event) => setStopKind(event.target.value as "pickup" | "delivery")}>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <LocationPicker
            name="location_id"
            locations={locations}
            value={draft.locationId}
            onChange={pickLocation}
            emptyLabel="One-off address"
            placeholder="Type any name or address"
          />
          {formatLocationAddress(draft) ? (
            <p className="stop-front-address mt-1">{formatLocationAddress(draft)}</p>
          ) : null}
          {mode === "edit" && isAssignEdit(persistedLocationId, draft.locationId) ? (
            <p className="mt-1 text-[11px] text-slate-500">Save to keep this location change.</p>
          ) : null}
        </div>
        <input type="hidden" name="name" value={draft.name} />
        <input type="hidden" name="street" value={draft.street} />
        <input type="hidden" name="city" value={draft.city} />
        <input type="hidden" name="state" value={draft.state} />
        <input type="hidden" name="zip" value={draft.zip} />
        <input type="hidden" name="phone" value={draft.phone} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="field">
            <label>Appointment start</label>
            <input name="window_start" type="datetime-local" value={draft.windowStart} onChange={(event) => setDraft((current) => ({ ...current, windowStart: event.target.value }))} />
          </div>
          <div className="field">
            <label>Appointment end</label>
            <input name="window_end" type="datetime-local" value={draft.windowEnd} onChange={(event) => setDraft((current) => ({ ...current, windowEnd: event.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label>PO / reference</label>
          <input name="reference" value={draft.reference} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea name="instructions" rows={3} value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} />
        </div>
        <input type="hidden" name="cargo" value={stop?.cargo ?? ""} />
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StopGridBlock({
  stop,
  index,
  locations,
  gapMiles,
  dragging,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  stop: LoadStop;
  index: number;
  locations: Location[];
  gapMiles: number | null;
  dragging: boolean;
  onEdit: () => void;
  onDragStart: () => void;
  onDragOver: (overId: number) => void;
  onDrop: () => void;
}) {
  const router = useRouter();
  const edit = useLoadEdit();
  const [kind, setKind] = useState(stop.kind);
  const [draft, setDraft] = useState(() => initialStopDraft(stop, locations));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [persistedLocationId, setPersistedLocationId] = useState(
    stop.location_id ? String(stop.location_id) : "",
  );

  useEffect(() => {
    setKind(stop.kind);
    setDraft(initialStopDraft(stop, locations));
    setPersistedLocationId(stop.location_id ? String(stop.location_id) : "");
  }, [stop, locations]);

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
      setPersistedLocationId(next.locationId);
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
      if (isAssignEdit(persistedLocationId, "")) edit?.markDirty();
      return;
    }
    const location = locations.find((row) => String(row.id) === locationId);
    if (!location) return;
    const next = applyLocationToDraft(draft, location);
    setDraft(next);
    if (isFirstAssign(persistedLocationId, locationId)) {
      void persistStop(next);
      return;
    }
    if (isAssignEdit(persistedLocationId, locationId)) {
      edit?.markDirty();
    }
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
        className={`rounded-lg border border-slate-200 p-3 ${pickup ? "stop-row-pickup" : "stop-row-delivery"} ${
          dragging ? "opacity-70" : ""
        }`}
        data-stop-front=""
        draggable
        onDragStart={onDragStart}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver(stop.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop();
        }}
        onDragEnd={onDrop}
      >
        <form action={updateStopAction} id={`stop-form-${stop.id}`} className="hidden">
          <input type="hidden" name="stop_id" value={stop.id} />
        </form>
        <div className="stop-front">
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
              onChange={(event) => {
                setDraft((current) => ({ ...current, windowStart: event.target.value }));
              }}
              onBlur={(event) => {
                const next = { ...draft, windowStart: event.target.value };
                setDraft(next);
                if (next.windowStart !== toInputDateTime(stop.window_start)) void persistStop(next);
              }}
            />
            <input
              form={`stop-form-${stop.id}`}
              name="window_end"
              type="datetime-local"
              className="mt-1 w-full"
              value={draft.windowEnd}
              onChange={(event) => {
                setDraft((current) => ({ ...current, windowEnd: event.target.value }));
              }}
              onBlur={(event) => {
                const next = { ...draft, windowEnd: event.target.value };
                setDraft(next);
                if (next.windowEnd !== toInputDateTime(stop.window_end)) void persistStop(next);
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="cursor-grab text-xs font-semibold text-slate-400" aria-hidden>
                ⋮⋮
              </span>
              <div className="text-xs font-semibold text-slate-500">#{index}</div>
              <span className={`stop-chip ${pickup ? "stop-chip-pickup" : "stop-chip-delivery"}`}>
                {pickup ? "Pickup" : "Delivery"}
              </span>
              <select
                form={`stop-form-${stop.id}`}
                name="kind"
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as "pickup" | "delivery";
                  setKind(next);
                  if (next !== stop.kind) void persistStop(draft, next);
                }}
                className={pickup ? "stop-kind-pickup" : "stop-kind-delivery"}
              >
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
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
                : isAssignEdit(persistedLocationId, draft.locationId)
                  ? "Save to keep this location change."
                  : saved || persistedLocationId
                    ? "Location is saved on this stop."
                    : "Pick a saved location — the first pick stays without Save."}
            </p>
            {rules.map((rule) => (
              <p key={rule} className="mt-1 text-xs font-semibold text-amber-800" data-location-rule="">
                {rule}
              </p>
            ))}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onEdit}>
              Edit notes
            </button>
            <button className="btn btn-ghost text-rose-700" type="submit" form={`stop-form-${stop.id}`} formAction={deleteStopAction}>
              Remove
            </button>
          </div>
        </div>
        <div className="hidden">
          <input form={`stop-form-${stop.id}`} name="street" value={draft.street} readOnly />
          <input form={`stop-form-${stop.id}`} name="city" value={draft.city} readOnly />
          <input form={`stop-form-${stop.id}`} name="state" value={draft.state} readOnly />
          <input form={`stop-form-${stop.id}`} name="zip" value={draft.zip} readOnly />
          <input form={`stop-form-${stop.id}`} name="phone" value={draft.phone} readOnly />
          <input form={`stop-form-${stop.id}`} name="reference" value={draft.reference} readOnly />
          <input form={`stop-form-${stop.id}`} name="instructions" value={draft.instructions} readOnly />
          <input form={`stop-form-${stop.id}`} type="hidden" name="cargo" defaultValue={stop.cargo} />
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
