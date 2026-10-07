"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  FACILITY_TEXT_MAX,
  OVERNIGHT_PARKING_OPTIONS,
  PARKING_OPTIONS,
} from "@/lib/location-facility-shared";
import { US_STATES } from "@/lib/locations";
import { applyNyBoroughState, nyBoroughStateError } from "@/lib/places-shared";
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
  mapsApiKey?: string;
};

export function LocationForm({ location, action, submitLabel, mapsApiKey = "" }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [name, setName] = useState(location?.name ?? "");
  const [street, setStreet] = useState(location?.street ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [region, setRegion] = useState(location?.state ?? "");
  const [zip, setZip] = useState(location?.zip ?? "");
  const [country, setCountry] = useState(location?.country ?? "");
  const [latitude, setLatitude] = useState(location?.latitude != null ? String(location.latitude) : "");
  const [longitude, setLongitude] = useState(location?.longitude != null ? String(location.longitude) : "");
  const [placeId, setPlaceId] = useState(location?.google_place_id ?? "");
  const [placePicked, setPlacePicked] = useState(false);

  return (
    <form action={formAction} className="card space-y-6 p-6">
      {state && !state.ok && state.duplicate ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Location already exists.</p>
          <p className="mt-1">Create a second copy, or keep the one already on file.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="submit" name="confirm_duplicate" value="1">
              Create anyway
            </button>
            {state.existingId ? (
              <a className="btn btn-ghost" href={`/locations/${state.existingId}`}>
                Keep existing
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <FormBanner result={state} />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field md:col-span-2">
          <label htmlFor="name">Name</label>
          <PlacesAutocomplete
            id="name"
            name="name"
            apiKey={mapsApiKey}
            required
            value={name}
            placeholder="Type a business, like Tyson Foods"
            onChange={setName}
            onPlace={(place, query) => {
              setPlacePicked(true);
              if (place.placeId) setPlaceId(place.placeId);
              const business = place.name.trim();
              const typed = query.trim();
              if (!name.trim() || name.trim().toLowerCase() === typed.toLowerCase()) setName(business || name);
              if (place.street) setStreet(place.street);
              if (place.city) setCity(place.city);
              if (place.city || place.state) setRegion(applyNyBoroughState(place.city || city, place.state || region));
              if (place.zip) setZip(place.zip);
              if (place.country) setCountry(place.country);
              if (place.latitude != null) setLatitude(String(place.latitude));
              if (place.longitude != null) setLongitude(String(place.longitude));
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
            Pick a Google suggestion to fill the address. You can still edit every field. Without a map key, type the name and address yourself.
          </p>
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
          {nyBoroughStateError(city, region) ? (
            <p className="text-sm text-rose-700" data-ny-borough-warning="">
              {nyBoroughStateError(city, region)}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" value={zip} onChange={(event) => setZip(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" name="country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="US" />
        </div>
        <input type="hidden" name="latitude" value={latitude} />
        <input type="hidden" name="longitude" value={longitude} />
        <input type="hidden" name="google_place_id" value={placeId} />
        <input type="hidden" name="place_picked" value={placePicked ? "1" : ""} />
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
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="call_before" value="1" defaultChecked={Boolean(location?.call_before)} />
            Call before pickup/delivery
          </label>
        </div>
        <div className="field md:col-span-2 note-public">
          <label htmlFor="scheduling_notes">Public scheduling notes</label>
          <textarea
            id="scheduling_notes"
            name="scheduling_notes"
            rows={3}
            aria-describedby="scheduling_notes-help"
            defaultValue={location?.scheduling_notes}
            placeholder="Appointment window, dock numbers, gate instructions"
          />
          <p id="scheduling_notes-help" className="mt-1 text-xs text-slate-600">
            Check-in and appointment steps. Drivers see this in Assist.
          </p>
        </div>
      </div>
      <fieldset className="space-y-4 border-t border-slate-200 pt-5" data-facility-fields="">
        <legend className="text-sm font-semibold text-slate-900">Driver facility info</legend>
        <p className="-mt-2 text-sm text-slate-600">
          Drivers can ask Assist about these. Leave a field blank and Assist says it is not on file.
        </p>
        <input type="hidden" name="facility_fields" value="1" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="field">
            <label htmlFor="receiving_hours">Receiving hours</label>
            <input
              id="receiving_hours"
              name="receiving_hours"
              maxLength={FACILITY_TEXT_MAX}
              defaultValue={location?.receiving_hours ?? ""}
              placeholder="Mon–Fri 06:00–14:00"
            />
          </div>
          <div className="field">
            <label htmlFor="shipping_hours">Shipping hours</label>
            <input
              id="shipping_hours"
              name="shipping_hours"
              maxLength={FACILITY_TEXT_MAX}
              defaultValue={location?.shipping_hours ?? ""}
              placeholder="Mon–Sat 08:00–20:00"
            />
          </div>
          <div className="field">
            <label htmlFor="parking">Onsite parking</label>
            <select id="parking" name="parking" defaultValue={location?.parking ?? ""}>
              {PARKING_OPTIONS.map((item) => (
                <option key={item.value || "none"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="overnight_parking">Overnight parking</label>
            <select id="overnight_parking" name="overnight_parking" defaultValue={location?.overnight_parking ?? ""}>
              {OVERNIGHT_PARKING_OPTIONS.map((item) => (
                <option key={item.value || "none"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="parking_notes">Parking notes</label>
            <input
              id="parking_notes"
              name="parking_notes"
              maxLength={FACILITY_TEXT_MAX}
              defaultValue={location?.parking_notes ?? ""}
              placeholder="Truck lot behind building B"
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="gate_dock_notes">Gate and dock notes</label>
            <textarea
              id="gate_dock_notes"
              name="gate_dock_notes"
              rows={2}
              maxLength={FACILITY_TEXT_MAX}
              defaultValue={location?.gate_dock_notes ?? ""}
              placeholder="Gate code at guard shack, reefer docks 4–7"
            />
          </div>
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field md:col-span-2 note-private">
          <label htmlFor="notes">Private notes</label>
          <textarea id="notes" name="notes" rows={3} aria-describedby="notes-help" defaultValue={location?.notes} />
          <p id="notes-help" className="mt-1 text-xs text-slate-600">
            Office only. Drivers never see these.
          </p>
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
