"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { PlaceSearch } from "@/components/place-search";
import { US_STATES } from "@/lib/locations";
import {
  LOCATION_ROLES,
  SCHEDULING_TYPES,
  type ActionResult,
  type Location,
} from "@/lib/types";

type Props = {
  location?: Location;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  placesEnabled?: boolean;
};

export function LocationForm({ location, action, submitLabel, placesEnabled = false }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [name, setName] = useState(location?.name ?? "");
  const [street, setStreet] = useState(location?.street ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [region, setRegion] = useState(location?.state ?? "");
  const [zip, setZip] = useState(location?.zip ?? "");
  const [latitude, setLatitude] = useState(location?.latitude != null ? String(location.latitude) : "");
  const [longitude, setLongitude] = useState(location?.longitude != null ? String(location.longitude) : "");

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <FormBanner result={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceSearch
          enabled={placesEnabled}
          placeholder="Search a shipper or receiver address"
          onPick={(place) => {
            if (!name.trim()) setName(place.name);
            if (!street.trim()) setStreet(place.street);
            setCity(place.city || city);
            setRegion(place.state || region);
            if (!zip.trim()) setZip(place.zip);
            setLatitude(place.latitude != null ? String(place.latitude) : latitude);
            setLongitude(place.longitude != null ? String(place.longitude) : longitude);
          }}
        />
        <div className="field md:col-span-2">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Warehouse or DC name" />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="street">Street</label>
          <input id="street" name="street" value={street} onChange={(event) => setStreet(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" required value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="state">State</label>
          <select id="state" name="state" required value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">Select state</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" value={zip} onChange={(event) => setZip(event.target.value)} />
        </div>
        <input type="hidden" name="latitude" value={latitude} />
        <input type="hidden" name="longitude" value={longitude} />
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={location?.phone} />
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={location?.role ?? "both"}>
            {LOCATION_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="scheduling_type">Scheduling</label>
          <select id="scheduling_type" name="scheduling_type" defaultValue={location?.scheduling_type ?? "fcfs"}>
            {SCHEDULING_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="hours">Hours</label>
          <input
            id="hours"
            name="hours"
            defaultValue={location?.hours}
            placeholder="Mon–Fri 07:00–15:00"
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="scheduling_notes">Scheduling notes</label>
          <textarea
            id="scheduling_notes"
            name="scheduling_notes"
            rows={3}
            defaultValue={location?.scheduling_notes}
            placeholder="Appointment window, dock numbers, gate instructions"
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={location?.notes} />
        </div>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
