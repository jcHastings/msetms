"use client";

import { useState } from "react";
import { formatLocationCityState, formatLocationLabel, parsePlace } from "@/lib/locations";
import { labelForLocationScheduling, type Location } from "@/lib/types";

type Prefix = "shipper" | "consignee";

export function StopPicker({
  prefix,
  label,
  addressName,
  locations,
  defaultLocationId,
  defaultAddress,
}: {
  prefix: Prefix;
  label: string;
  addressName: "origin" | "destination";
  locations: Location[];
  defaultLocationId?: number | null;
  defaultAddress?: string;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId ? String(defaultLocationId) : "");
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [saveToBook, setSaveToBook] = useState(false);
  const selected = locations.find((item) => String(item.id) === locationId) ?? null;
  const parsed = parsePlace(address);

  return (
    <fieldset className="md:col-span-2 grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-slate-800">{label}</legend>
      <div className="field md:col-span-2">
        <label htmlFor={`${prefix}_location_id`}>From Locations</label>
        <select
          id={`${prefix}_location_id`}
          name={`${prefix}_location_id`}
          value={locationId}
          onChange={(event) => {
            const nextId = event.target.value;
            setLocationId(nextId);
            const next = locations.find((item) => String(item.id) === nextId);
            if (next) {
              setAddress(formatLocationCityState(next));
              setSaveToBook(false);
            }
          }}
        >
          <option value="">One-off address</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {formatLocationLabel(location)}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor={addressName}>{prefix === "shipper" ? "Origin" : "Destination"}</label>
        <input
          id={addressName}
          name={addressName}
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="City, ST"
        />
      </div>
      {selected ? (
        <div className="md:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <div className="font-semibold">{labelForLocationScheduling(selected.scheduling_type)}</div>
          {selected.hours ? <div>{selected.hours}</div> : null}
          {selected.scheduling_notes ? <div className="mt-1">{selected.scheduling_notes}</div> : null}
        </div>
      ) : (
        <label className="md:col-span-2 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name={`save_${prefix}_location`}
            value="1"
            checked={saveToBook}
            onChange={(event) => setSaveToBook(event.target.checked)}
          />
          Add this stop to Locations
        </label>
      )}
      {saveToBook && !locationId ? (
        <>
          <div className="field md:col-span-2">
            <label htmlFor={`${prefix}_name`}>Location name</label>
            <input
              id={`${prefix}_name`}
              name={`${prefix}_name`}
              defaultValue={parsed.city || address}
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor={`${prefix}_street`}>Street</label>
            <input id={`${prefix}_street`} name={`${prefix}_street`} defaultValue={parsed.street} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}_city`}>City</label>
            <input id={`${prefix}_city`} name={`${prefix}_city`} defaultValue={parsed.city} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}_state`}>State</label>
            <input id={`${prefix}_state`} name={`${prefix}_state`} maxLength={2} defaultValue={parsed.state} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}_zip`}>ZIP</label>
            <input id={`${prefix}_zip`} name={`${prefix}_zip`} defaultValue={parsed.zip} />
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
