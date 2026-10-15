"use client";

import { useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  createLoadSwapAction,
  deleteLoadSwapAction,
  overrideSwapMilesAction,
  previewLoadSwapAction,
} from "@/lib/dispatcher-actions";
import { formatDateTime, toOfficeDateTime } from "@/lib/format";
import { formatLocationAddress, type LocationPickerRow } from "@/lib/locations";
import type { LoadSwapView } from "@/lib/load-swap";
import { relayPointLabel, type PlaceDetails } from "@/lib/places-shared";
import { formatRouteMiles } from "@/lib/routing-shared";

type SwapLocationOption = LocationPickerRow & {
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
};

export function LoadSwapPanel({
  loadId,
  loadNumber,
  swap,
  canOverrideMiles = false,
  locations = [],
  mapsApiKey = "",
  readOnly = false,
}: {
  loadId: number;
  loadNumber: string;
  swap: LoadSwapView | null;
  canOverrideMiles?: boolean;
  locations?: SwapLocationOption[];
  mapsApiKey?: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card mb-2 p-3" id="swap" data-load-swap="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Trailer swap</h2>
        {!swap && !readOnly ? (
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            Swap with load…
          </button>
        ) : null}
      </div>
      {swap ? (
        <SwapSummary swap={swap} loadId={loadId} loadNumber={loadNumber} canOverrideMiles={canOverrideMiles} readOnly={readOnly} />
      ) : (
        <p className="mt-3 text-sm text-slate-500">No swap. One point and time links this load with another.</p>
      )}
      {open ? (
        <SwapDialog
          loadId={loadId}
          locations={locations}
          mapsApiKey={mapsApiKey}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function SwapSummary({
  swap,
  loadId,
  canOverrideMiles,
  readOnly,
}: {
  swap: LoadSwapView;
  loadId: number;
  loadNumber: string;
  canOverrideMiles: boolean;
  readOnly: boolean;
}) {
  const other = swap.loadAId === loadId ? swap.loadBNumber : swap.loadANumber;
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p>
        With <span className="font-medium">{other}</span>
        {swap.address ? ` at ${swap.address}` : ""}
        {swap.swapAt ? ` · ${formatDateTime(swap.swapAt)}` : ""}
      </p>
      <ul className="divide-y divide-slate-100">
        {swap.legs.map((leg) => (
          <li key={leg.loadId} className="py-2">
            <div className="font-medium">{leg.loadNumber}</div>
            <div className="text-xs text-slate-500">
              {leg.fromDriverName || "Unassigned"} {formatRouteMiles(leg.fromMiles)} → {leg.toDriverName || "Unassigned"}{" "}
              {formatRouteMiles(leg.toMiles)}
              {leg.source ? ` · ${leg.source}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <form
          action={async (formData) => {
            const result = await deleteLoadSwapAction(formData);
            if (!result.ok) setError(result.error);
          }}
        >
          <input type="hidden" name="swap_id" value={swap.id} />
          <button className="btn btn-ghost text-rose-700" type="submit">
            Remove swap
          </button>
        </form>
      ) : null}
      {canOverrideMiles && !readOnly ? <MileOverride loadId={loadId} /> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}

function MileOverride({ loadId }: { loadId: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      action={async (formData) => {
        const result = await overrideSwapMilesAction(formData);
        if (!result.ok) setError(result.error);
      }}
    >
      <input type="hidden" name="load_id" value={loadId} />
      <div className="field">
        <label htmlFor={`swap-from-miles-${loadId}`}>Loaded miles to the swap</label>
        <input id={`swap-from-miles-${loadId}`} name="from_miles" inputMode="decimal" required />
      </div>
      <div className="field">
        <label htmlFor={`swap-to-miles-${loadId}`}>Loaded miles after the swap</label>
        <input id={`swap-to-miles-${loadId}`} name="to_miles" inputMode="decimal" required />
      </div>
      <div className="flex items-end">
        <button className="btn btn-secondary" type="submit">
          Save miles
        </button>
      </div>
      {error ? <p className="text-sm text-rose-700 sm:col-span-3">{error}</p> : null}
    </form>
  );
}

function SwapDialog({
  loadId,
  locations,
  mapsApiKey,
  onClose,
}: {
  loadId: number;
  locations: SwapLocationOption[];
  mapsApiKey: string;
  onClose: () => void;
}) {
  const [otherLoad, setOtherLoad] = useState("");
  const [handoff, setHandoff] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [placesReady, setPlacesReady] = useState(Boolean(mapsApiKey));
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Array<{ loadNumber: string; fromMiles: number | null; toMiles: number | null; source: string; offRoute: boolean }> | null>(null);

  function rememberPlace(place: PlaceDetails) {
    const label = relayPointLabel(place) || place.formatted || handoff;
    setHandoff(label);
    setPlaceId(place.placeId);
    setLat(place.latitude != null ? String(place.latitude) : "");
    setLng(place.longitude != null ? String(place.longitude) : "");
    setAddress(place.formatted || [place.street, place.city, place.state, place.zip].filter(Boolean).join(", "));
  }

  function rememberSaved(
    locationId: string,
    picked?: { id: number; name: string; street?: string | null; city?: string | null; state?: string | null; zip?: string | null; latitude?: number | null; longitude?: number | null; google_place_id?: string | null } | null,
  ) {
    const location = picked ?? locations.find((row) => String(row.id) === locationId);
    if (!location) return;
    const cityState = [location.city, location.state].filter(Boolean).join(", ");
    const label = [location.name, cityState].filter(Boolean).join(", ");
    setHandoff(label);
    setPlaceId(String(location.google_place_id ?? ""));
    setLat(location.latitude != null ? String(location.latitude) : "");
    setLng(location.longitude != null ? String(location.longitude) : "");
    setAddress(
      formatLocationAddress({
        street: location.street ?? "",
        city: location.city ?? "",
        state: location.state ?? "",
        zip: location.zip ?? "",
      }) || label,
    );
  }

  function formValues(form: HTMLFormElement): FormData {
    const data = new FormData(form);
    data.set("load_id", String(loadId));
    data.set("other_load_number", otherLoad);
    data.set("handoff", handoff);
    data.set("swap_address", address || handoff);
    data.set("swap_place_id", placeId);
    data.set("swap_lat", lat);
    data.set("swap_lng", lng);
    return data;
  }

  return (
    <div className="pay-item-dialog-backdrop" role="dialog" aria-label="Swap with load">
      <form
        className="pay-item-dialog card space-y-3 p-5"
        action={async (formData) => {
          const result = await createLoadSwapAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onClose();
        }}
      >
        <h3 className="text-sm font-semibold">Swap with load</h3>
        <input type="hidden" name="load_id" value={loadId} />
        <input type="hidden" name="swap_place_id" value={placeId} />
        <input type="hidden" name="swap_lat" value={lat} />
        <input type="hidden" name="swap_lng" value={lng} />
        <input type="hidden" name="swap_address" value={address || handoff} />
        <div className="field">
          <label htmlFor="swap-other-load">Other load number</label>
          <input
            id="swap-other-load"
            name="other_load_number"
            required
            value={otherLoad}
            onChange={(event) => setOtherLoad(event.target.value)}
            placeholder="Load number"
          />
        </div>
        <div className="field">
          <label htmlFor="swap-point">Swap point</label>
          <PlacesAutocomplete
            id="swap-point"
            name="handoff"
            apiKey={mapsApiKey}
            required
            value={handoff}
            placeholder="Meet city or business"
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
          {!placesReady ? (
            <div className="mt-2">
              <p className="text-xs text-slate-500">Google suggestions are off. Type the swap point, or pick a saved location.</p>
              <LocationPicker
                catalog
                locations={locations}
                placeholder="Saved locations"
                emptyLabel="Keep the typed swap point"
                onChange={rememberSaved}
              />
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="swap-at">Swap time</label>
          <input id="swap-at" name="swap_at" type="datetime-local" required defaultValue={toOfficeDateTime(new Date().toISOString())} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="detention-leg-a">Detention on this load</label>
            <select id="detention-leg-a" name="detention_leg_a" defaultValue="">
              <option value="">None</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="detention-leg-b">Detention on the other load</label>
            <select id="detention-leg-b" name="detention_leg_b" defaultValue="">
              <option value="">None</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="swap-notes">Notes</label>
          <input id="swap-notes" name="notes" />
        </div>
        {preview ? (
          <ul className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {preview.map((row) => (
              <li key={row.loadNumber}>
                {row.loadNumber}: {formatRouteMiles(row.fromMiles)} then {formatRouteMiles(row.toMiles)}
                {row.source === "missing" ? " · miles missing" : ""}
                {row.offRoute ? " · point is off the saved route" : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={async (event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              const result = await previewLoadSwapAction(formValues(form));
              if (!result.ok) {
                setError(result.error);
                setPreview(null);
                return;
              }
              setError(null);
              setPreview(result.loads);
            }}
          >
            Preview split
          </button>
          <button className="btn btn-primary" type="submit">
            Save swap
          </button>
        </div>
      </form>
    </div>
  );
}
