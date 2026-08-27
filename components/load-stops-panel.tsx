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
import { stopTypeLabel, stopTypeNumber, type LoadStop } from "@/lib/stops-shared";
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
      <div className="section-head flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">Stops</h2>
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
      <div className="overflow-x-auto">
        {orderedStops.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No stops yet. Add a pickup or delivery.</p>
        ) : (
          <table className="table-grid table-grid-stops" data-stops-grid="">
            <thead>
              <tr>
                <th></th>
                <th>Stop</th>
                <th>Location</th>
                <th>Address</th>
                <th>Window</th>
                <th>Arrived</th>
                <th>Departed</th>
                <th>Notes</th>
                <th>Cargo</th>
                <th>Ref</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedStops.map((stop, index) => (
                <StopGridBlock
                  key={stop.id}
                  stop={stop}
                  typeNumber={stopTypeNumber(orderedStops, stop.id)}
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
            </tbody>
          </table>
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
  arrivedAt: string;
  departedAt: string;
  scheduleType: string;
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
    arrivedAt: toInputDateTime(stop.arrived_at),
    departedAt: toInputDateTime(stop.departed_at),
    scheduleType: stop.schedule_type || (matched?.scheduling_type === "fcfs" ? "fcfs" : matched?.scheduling_type === "appointment" ? "appointment" : ""),
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
    arrivedAt: "",
    departedAt: "",
    scheduleType: "",
  };
}

function stopPrivateNotes(draft: StopDraft, location: Location | null | undefined): string {
  const schedule = draft.scheduleType === "fcfs" ? "FCFS" : draft.scheduleType === "appointment" ? "APPT" : "";
  return [schedule, location?.hours?.trim(), location?.scheduling_notes?.trim(), draft.instructions.trim()]
    .filter(Boolean)
    .join(" · ");
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
    scheduleType: location.scheduling_type === "fcfs" ? "fcfs" : location.scheduling_type === "appointment" ? "appointment" : draft.scheduleType,
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
            <p className="mt-1 text-[11px] text-slate-500" data-stop-autosave="">
              Save to keep this location change.
            </p>
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
          <label>APPT / FCFS</label>
          <select name="schedule_type" value={draft.scheduleType} onChange={(event) => setDraft((current) => ({ ...current, scheduleType: event.target.value }))}>
            <option value="">From location</option>
            <option value="appointment">APPT</option>
            <option value="fcfs">FCFS</option>
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="field">
            <label>Arrived</label>
            <input name="arrived_at" type="datetime-local" value={draft.arrivedAt} onChange={(event) => setDraft((current) => ({ ...current, arrivedAt: event.target.value }))} />
          </div>
          <div className="field">
            <label>Departed</label>
            <input name="departed_at" type="datetime-local" value={draft.departedAt} onChange={(event) => setDraft((current) => ({ ...current, departedAt: event.target.value }))} />
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
  typeNumber,
  locations,
  gapMiles,
  dragging,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  stop: LoadStop;
  typeNumber: number;
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
    formData.set("arrived_at", next.arrivedAt);
    formData.set("departed_at", next.departedAt);
    formData.set("schedule_type", next.scheduleType);
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
  const location =
    locations.find((item) => String(item.id) === draft.locationId) ??
    matchLocationForStop(locations, {
      name: draft.name,
      street: draft.street,
      city: draft.city,
      state: draft.state,
    });
  const rules = locationRuleLabels(location);
  const notes = stopPrivateNotes(draft, location);
  const typeLabel = stopTypeLabel(kind, typeNumber);

  function commitTime(field: "windowStart" | "windowEnd" | "arrivedAt" | "departedAt", value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const original = initialStopDraft(stop, locations);
    if (next[field] === original[field]) return;
    void persistStop(next);
  }

  return (
    <>
      <tr
        className={`${pickup ? "stop-row-pickup" : "stop-row-delivery"} ${dragging ? "opacity-70" : ""}`}
        data-stop-front=""
        title={rules.join(" · ")}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver(stop.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop();
        }}
      >
        <td className="stop-front">
          <form action={updateStopAction} id={`stop-form-${stop.id}`} className="hidden">
            <input type="hidden" name="stop_id" value={stop.id} />
          </form>
          <span
            className="cursor-grab text-xs font-semibold text-slate-400"
            aria-hidden
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDrop}
          >
            ⋮⋮
          </span>
          <div className="hidden">
            <input form={`stop-form-${stop.id}`} name="kind" value={kind} readOnly />
            <input form={`stop-form-${stop.id}`} name="name" value={draft.name} readOnly />
            <input form={`stop-form-${stop.id}`} name="location_id" value={draft.locationId} readOnly />
            <input form={`stop-form-${stop.id}`} name="street" value={draft.street} readOnly />
            <input form={`stop-form-${stop.id}`} name="city" value={draft.city} readOnly />
            <input form={`stop-form-${stop.id}`} name="state" value={draft.state} readOnly />
            <input form={`stop-form-${stop.id}`} name="zip" value={draft.zip} readOnly />
            <input form={`stop-form-${stop.id}`} name="phone" value={draft.phone} readOnly />
            <input form={`stop-form-${stop.id}`} name="reference" value={draft.reference} readOnly />
            <input form={`stop-form-${stop.id}`} name="instructions" value={draft.instructions} readOnly />
            <input form={`stop-form-${stop.id}`} type="hidden" name="cargo" defaultValue={stop.cargo} />
          </div>
        </td>
        <td className="whitespace-nowrap">
          <span className={`stop-chip ${pickup ? "stop-chip-pickup" : "stop-chip-delivery"}`} data-stop-type={typeLabel}>
            {typeLabel}
          </span>
        </td>
        <td className="font-semibold">{draft.name}</td>
        <td className="stop-front-address">{address || "—"}</td>
        <td>
          <div className="stop-front-window" data-stop-window="" title={windowLabel || undefined}>
            <input
              className="stop-time-input"
              type="datetime-local"
              aria-label="Window start"
              value={draft.windowStart}
              onChange={(event) => setDraft((current) => ({ ...current, windowStart: event.target.value }))}
              onBlur={(event) => commitTime("windowStart", event.target.value)}
            />
            <input
              className="stop-time-input"
              type="datetime-local"
              aria-label="Window end"
              value={draft.windowEnd}
              onChange={(event) => setDraft((current) => ({ ...current, windowEnd: event.target.value }))}
              onBlur={(event) => commitTime("windowEnd", event.target.value)}
            />
          </div>
        </td>
        <td>
          <input
            className="stop-time-input"
            type="datetime-local"
            aria-label="Arrived"
            value={draft.arrivedAt}
            onChange={(event) => setDraft((current) => ({ ...current, arrivedAt: event.target.value }))}
            onBlur={(event) => commitTime("arrivedAt", event.target.value)}
          />
        </td>
        <td>
          <input
            className="stop-time-input"
            type="datetime-local"
            aria-label="Departed"
            value={draft.departedAt}
            onChange={(event) => setDraft((current) => ({ ...current, departedAt: event.target.value }))}
            onBlur={(event) => commitTime("departedAt", event.target.value)}
          />
        </td>
        <td className="stop-front-notes" title={notes || undefined}>
          {notes || "—"}
        </td>
        <td className="stop-front-cargo">{stop.cargo || "—"}</td>
        <td className="stop-front-ref">{draft.reference || "—"}</td>
        <td className="whitespace-nowrap">
          <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onEdit}>
            Edit
          </button>
          <button
            className="btn btn-ghost px-2 py-1 text-xs text-rose-700"
            type="submit"
            form={`stop-form-${stop.id}`}
            formAction={deleteStopAction}
          >
            Remove
          </button>
        </td>
      </tr>
      {gapMiles != null ? (
        <tr className="stop-leg-miles">
          <td colSpan={11}>
            <p className="px-1 text-xs font-semibold text-slate-600" data-leg-miles="">
              {formatRouteMiles(gapMiles)} to next stop
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}
