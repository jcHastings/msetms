"use client";

import { useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { addRelayAction, deleteRelayAction, updateRelayAction } from "@/lib/dispatcher-actions";
import { formatDateTime, toOfficeDateTime } from "@/lib/format";
import { formatLocationAddress, type LocationPickerRow } from "@/lib/locations";

type RelayLocationOption = LocationPickerRow & {
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
};
import { relayPointLabel, type PlaceDetails } from "@/lib/places-shared";
import { formatRelayHandoff, relayIsCompleted, type LoadRelayView } from "@/lib/relays";
import { assignedLoadName } from "@/lib/owner-operator-shared";
import { isOwnerOperator } from "@/lib/types";

type RelayDriverOption = {
  id: number;
  name: string;
  driver_type: string;
  company_name?: string;
};

export function LoadRelaysPanel({
  loadId,
  relays,
  drivers,
  locations = [],
  mapsApiKey = "",
  primaryDriverId,
  catalog = false,
}: {
  loadId: number;
  relays: LoadRelayView[];
  drivers: RelayDriverOption[];
  locations?: RelayLocationOption[];
  mapsApiKey?: string;
  primaryDriverId?: number | null;
  catalog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LoadRelayView | null>(null);
  const last = relays[relays.length - 1];
  const defaultFromId = last?.driver_id ?? primaryDriverId ?? null;

  return (
    <section className="card mb-2 p-3" id="relays">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Relays</h2>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          + Add Relay
        </button>
      </div>
      {relays.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No relays yet. Click + Add Relay.</p>
      ) : (
        <ol className="mt-3 divide-y divide-slate-100">
          {relays.map((relay) => (
            <li key={relay.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium">
                  {formatRelayHandoff(
                    assignedLoadName({
                      name: relay.from_driver_name,
                      driver_type: relay.from_driver_type,
                      company_name: relay.from_driver_company_name,
                    }),
                    assignedLoadName({
                      name: relay.driver_name,
                      driver_type: relay.driver_type,
                      company_name: relay.driver_company_name,
                    }),
                    relay.delivery || relay.pickup,
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {driverKindLabel(relay.from_driver_type)} → {driverKindLabel(relay.driver_type)}
                  {relayIsCompleted(relay)
                    ? ` · completed ${formatDateTime(relay.completed_at)}`
                    : " · waiting on completed date/time"}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(relay)}>
                  Edit
                </button>
                <form
                  action={async (formData) => {
                    await deleteRelayAction(formData);
                  }}
                >
                  <input type="hidden" name="relay_id" value={relay.id} />
                  <button className="btn btn-ghost text-rose-700" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <RelayDialog
          loadId={loadId}
          drivers={drivers}
          locations={locations}
          mapsApiKey={mapsApiKey}
          catalog={catalog}
          defaultFromId={defaultFromId}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {editing ? (
        <RelayDialog
          loadId={loadId}
          drivers={drivers}
          locations={locations}
          mapsApiKey={mapsApiKey}
          catalog={catalog}
          relay={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function driverKindLabel(type: string | null | undefined): string {
  if (!type) return "Unassigned";
  return isOwnerOperator(type) ? "OO" : "Company";
}

function driverOptionLabel(driver: RelayDriverOption): string {
  const label = assignedLoadName(driver);
  return `${label}${isOwnerOperator(driver.driver_type) ? " · OO" : " · Company"}`;
}

function RelayDialog({
  loadId,
  drivers,
  locations,
  mapsApiKey,
  catalog = false,
  defaultFromId = null,
  relay,
  onClose,
}: {
  loadId: number;
  drivers: RelayDriverOption[];
  locations: RelayLocationOption[];
  mapsApiKey: string;
  catalog?: boolean;
  defaultFromId?: number | null;
  relay?: LoadRelayView;
  onClose: () => void;
}) {
  const editing = Boolean(relay);
  const [fromId, setFromId] = useState(relay?.from_driver_id ? String(relay.from_driver_id) : defaultFromId ? String(defaultFromId) : "");
  const [toId, setToId] = useState(relay?.driver_id ? String(relay.driver_id) : "");
  const [handoff, setHandoff] = useState(relay?.delivery || "");
  const [placeId, setPlaceId] = useState(relay?.relay_place_id ?? "");
  const [lat, setLat] = useState(relay?.relay_lat != null ? String(relay.relay_lat) : "");
  const [lng, setLng] = useState(relay?.relay_lng != null ? String(relay.relay_lng) : "");
  const [address, setAddress] = useState(relay?.relay_address ?? "");
  const [placesReady, setPlacesReady] = useState(Boolean(mapsApiKey));
  const [error, setError] = useState<string | null>(null);

  function rememberPlace(place: PlaceDetails) {
    setHandoff(relayPointLabel(place) || place.formatted || handoff);
    setPlaceId(place.placeId);
    setLat(place.latitude != null ? String(place.latitude) : "");
    setLng(place.longitude != null ? String(place.longitude) : "");
    setAddress(place.formatted || [place.street, place.city, place.state, place.zip].filter(Boolean).join(", "));
  }

  function rememberSaved(locationId: string) {
    const location = locations.find((row) => String(row.id) === locationId);
    if (!location) return;
    const cityState = [location.city, location.state].filter(Boolean).join(", ");
    setHandoff([location.name, cityState].filter(Boolean).join(", "));
    setPlaceId(String(location.google_place_id ?? ""));
    setLat(location.latitude != null ? String(location.latitude) : "");
    setLng(location.longitude != null ? String(location.longitude) : "");
    setAddress(formatLocationAddress(location));
  }

  return (
    <div className="pay-item-dialog-backdrop" role="dialog" aria-label={editing ? "Edit relay" : "Add relay"}>
      <form
        action={async (formData) => {
          const result = editing ? await updateRelayAction(formData) : await addRelayAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onClose();
        }}
        className="pay-item-dialog card space-y-3 p-5"
      >
        <h3 className="text-sm font-semibold">{editing ? "Edit Relay" : "Add Relay"}</h3>
        <input type="hidden" name="load_id" value={loadId} />
        {relay ? <input type="hidden" name="relay_id" value={relay.id} /> : null}
        <div className="field">
          <label htmlFor="relay-driver-a">Driver 1 (first leg)</label>
          <select
            id="relay-driver-a"
            name="from_driver_id"
            required
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
          >
            <option value="">Select driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driverOptionLabel(driver)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="relay-driver-b">Driver 2 (receiving)</label>
          <select
            id="relay-driver-b"
            name="driver_id"
            required
            value={toId}
            onChange={(event) => setToId(event.target.value)}
          >
            <option value="">Select driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id} disabled={String(driver.id) === fromId}>
                {driverOptionLabel(driver)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={relay ? `relay-handoff-${relay.id}` : "relay-handoff"}>Relay point</label>
          <PlacesAutocomplete
            id={relay ? `relay-handoff-${relay.id}` : "relay-handoff"}
            name="handoff"
            apiKey={mapsApiKey}
            required
            value={handoff}
            placeholder="Handoff city or business"
            onAvailability={setPlacesReady}
            onChange={(next) => {
              setHandoff(next);
              if (next !== handoff) {
                setPlaceId("");
                setLat("");
                setLng("");
                setAddress("");
              }
            }}
            onPlace={rememberPlace}
          />
          <input type="hidden" name="relay_place_id" value={placeId} />
          <input type="hidden" name="relay_lat" value={lat} />
          <input type="hidden" name="relay_lng" value={lng} />
          <input type="hidden" name="relay_address" value={address} />
          {!placesReady ? (
            <div className="mt-2">
              <p className="text-xs text-slate-500">Google suggestions are off. Type the relay point, or pick a saved location.</p>
              <LocationPicker
                catalog={catalog}
                locations={locations}
                placeholder="Saved locations"
                emptyLabel="Keep the typed relay point"
                onChange={rememberSaved}
              />
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={relay ? `relay-completed-${relay.id}` : "relay-completed-at"}>Relay completed</label>
          <input
            id={relay ? `relay-completed-${relay.id}` : "relay-completed-at"}
            name="completed_at"
            type="datetime-local"
            defaultValue={relay?.completed_at ? toOfficeDateTime(relay.completed_at) : ""}
          />
          <p className="mt-1 text-xs text-slate-500">
            Date and time the handoff happened. Required once Driver 2 has a truck and trailer on the load.
          </p>
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={Boolean(fromId) && fromId === toId}>
            Save Relay
          </button>
        </div>
      </form>
    </div>
  );
}
