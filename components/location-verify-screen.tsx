"use client";

import { useState, useTransition } from "react";
import { FormBanner } from "@/components/form-banner";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  acceptCachedLocationAction,
  acceptPickedLocationAction,
  lookupLocationVerifyAction,
  lookupVerifyBatchAction,
} from "@/lib/location-verify-actions";
import { compareLocationToPlace, type LocationCompareSide } from "@/lib/location-verify";
import { relayPointLabel, type PlaceDetails } from "@/lib/places-shared";
import type { ActionResult } from "@/lib/types";

export type VerifyRow = {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  suggestion: PlaceDetails | null;
};

function sideLine(side: LocationCompareSide): string {
  const city = [side.city, side.state].filter(Boolean).join(", ");
  const pin = side.lat != null && side.lng != null ? `${side.lat}, ${side.lng}` : "No pin";
  return [side.name, side.street, [city, side.zip].filter(Boolean).join(" "), pin].filter(Boolean).join(" · ");
}

export function LocationVerifyScreen({
  rows,
  placesOn,
  mapsApiKey,
}: {
  rows: VerifyRow[];
  placesOn: boolean;
  mapsApiKey: string;
}) {
  const [skipped, setSkipped] = useState<number[]>([]);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = rows.filter((row) => !skipped.includes(row.id));

  function run(task: () => Promise<ActionResult>) {
    startTransition(async () => {
      setMessage(await task());
    });
  }

  return (
    <div className="space-y-4" data-verify-locations="">
      <FormBanner result={message} />
      {!placesOn ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-verify-key-off="">
          Google search is off. Turn on the server maps key to look up matches. You can still pick a place when the browser map key is set.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {visible.length === 0 ? "Every location on this page is skipped or verified." : `${visible.length} not verified.`}
          {" "}Lookups run 10 at a time and reuse a saved result for the same address.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || !placesOn}
          onClick={() => run(() => lookupVerifyBatchAction())}
        >
          {pending ? "Looking up…" : "Look up next 10"}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="card p-6 text-sm text-slate-600">No unverified locations in this list.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id}>
              <VerifyCard
                row={row}
                placesOn={placesOn}
                mapsApiKey={mapsApiKey}
                pending={pending}
                onLookup={() => run(() => lookupLocationVerifyAction(row.id))}
                onAcceptCached={() => run(() => acceptCachedLocationAction(row.id))}
                onAcceptPicked={(formData) => run(() => acceptPickedLocationAction(formData))}
                onSkip={() => setSkipped((current) => [...current, row.id])}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerifyCard({
  row,
  placesOn,
  mapsApiKey,
  pending,
  onLookup,
  onAcceptCached,
  onAcceptPicked,
  onSkip,
}: {
  row: VerifyRow;
  placesOn: boolean;
  mapsApiKey: string;
  pending: boolean;
  onLookup: () => void;
  onAcceptCached: () => void;
  onAcceptPicked: (formData: FormData) => void;
  onSkip: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PlaceDetails | null>(null);
  const compare = row.suggestion ? compareLocationToPlace(row, row.suggestion) : null;

  return (
    <article className="card space-y-3 p-4" data-verify-row={row.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{row.name}</h2>
          <p className="text-xs text-slate-500">Not verified</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={pending || !placesOn} onClick={onLookup}>
            Look up
          </button>
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
      {compare ? (
        <div className="grid gap-3 md:grid-cols-2" data-verify-compare="">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current</p>
            <p className="mt-1 text-sm text-slate-800">{sideLine(compare.current)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Google</p>
            <p className="mt-1 text-sm text-slate-800">{sideLine(compare.google)}</p>
            <p className="mt-1 text-xs text-slate-500">Distance between pins: {compare.distanceLabel}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {[row.street, [row.city, row.state].filter(Boolean).join(", "), row.zip].filter(Boolean).join(" · ") || "No address yet."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {compare ? (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={onAcceptCached}>
            Accept
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => setPicking((open) => !open)}>
          {picking ? "Close picker" : "Pick another"}
        </button>
      </div>
      {picking ? (
        <div className="space-y-2">
          <PlacesAutocomplete
            id={`verify-place-${row.id}`}
            apiKey={mapsApiKey}
            value={query}
            onChange={setQuery}
            placeholder="Search a different Google place"
            onPlace={(place) => {
              setPicked(place);
              setQuery(relayPointLabel(place) || place.formatted || query);
            }}
          />
          {picked ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                onAcceptPicked(new FormData(event.currentTarget));
              }}
            >
              <p className="text-sm text-slate-700">
                {picked.name || "Selected place"} · {picked.formatted || [picked.street, picked.city, picked.state].filter(Boolean).join(", ")}
              </p>
              <input type="hidden" name="location_id" value={row.id} />
              <input type="hidden" name="google_place_id" value={picked.placeId} />
              <input type="hidden" name="name" value={picked.name} />
              <input type="hidden" name="street" value={picked.street} />
              <input type="hidden" name="city" value={picked.city} />
              <input type="hidden" name="state" value={picked.state} />
              <input type="hidden" name="zip" value={picked.zip} />
              <input type="hidden" name="country" value={picked.country} />
              <input type="hidden" name="formatted" value={picked.formatted} />
              <input type="hidden" name="latitude" value={picked.latitude ?? ""} />
              <input type="hidden" name="longitude" value={picked.longitude ?? ""} />
              <button className="btn btn-primary" type="submit" disabled={pending}>
                Accept this place
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-500">Choosing a suggestion does not save until you accept it.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
