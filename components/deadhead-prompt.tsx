"use client";

import { useActionState, useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { confirmDeadheadAction } from "@/lib/dispatcher-actions";
import { deadheadPromptText } from "@/lib/empty-miles-shared";
import { formatLocationAddress, type LocationPickerRow } from "@/lib/locations";

export function DeadheadPrompt({
  loadId,
  driverName,
  place,
  alternativePlace = "",
  notes,
  readOnly = false,
  locations,
  initialEditing = false,
}: {
  loadId: number;
  driverName: string;
  place: string;
  alternativePlace?: string;
  notes: string[];
  readOnly?: boolean;
  locations: LocationPickerRow[];
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [address, setAddress] = useState("");
  const [state, action, pending] = useActionState(confirmDeadheadAction, null);
  return (
    <section className="card mb-4 p-4" data-deadhead-prompt="">
      <p className="text-sm font-semibold text-slate-900">{deadheadPromptText(driverName, place)}</p>
      <p className="mt-1 text-sm text-slate-600">Empty miles stay pending until you confirm the start.</p>
      {alternativePlace.trim() ? (
        <p className="mt-1 text-sm text-slate-600" data-deadhead-alternative="">
          Other start: {alternativePlace}
        </p>
      ) : null}
      {notes.length ? (
        <ul
          className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-deadhead-warning=""
        >
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {state && !state.ok ? <p className="mt-2 text-sm text-red-700">{state.error}</p> : null}
      {state?.ok && state.message ? <p className="mt-2 text-sm text-slate-600">{state.message}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="load_id" value={loadId} />
          <input type="hidden" name="mode" value="confirm" />
          <button className="btn btn-primary" type="submit" disabled={pending || readOnly} data-deadhead-confirm="">
            {pending ? "Saving…" : "Confirm"}
          </button>
        </form>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={readOnly}
          onClick={() => setEditing((open) => !open)}
          data-deadhead-edit=""
        >
          Edit
        </button>
      </div>
      {editing ? (
        <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="load_id" value={loadId} />
          <input type="hidden" name="mode" value="edit" />
          <div className="field md:col-span-2">
            <label htmlFor={`deadhead-location-${loadId}`}>Location</label>
            <LocationPicker
              id={`deadhead-location-${loadId}`}
              name="location_id"
              locations={locations}
              catalog
              emptyLabel="Pick a saved location"
              placeholder="Search locations"
              onChange={(_locationId, location) => {
                setAddress(location ? formatLocationAddress(location) : "");
              }}
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor={`deadhead-address-${loadId}`}>Address</label>
            <input
              id={`deadhead-address-${loadId}`}
              name="address"
              placeholder="Street, city, state"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending || readOnly}>
            Save start
          </button>
        </form>
      ) : null}
    </section>
  );
}
