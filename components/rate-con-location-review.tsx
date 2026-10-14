"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FacilityMatchPrompt } from "@/components/facility-match-prompt";
import { FormBanner } from "@/components/form-banner";
import { LocationPicker } from "@/components/location-picker";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  rememberFacilityAliasAction,
  rememberFacilityAliasFormAction,
  saveRateConLocationAction,
  suggestFacilityMatchAction,
  type FacilityMatchPreview,
} from "@/lib/actions";
import { US_STATES } from "@/lib/locations";
import { applyNyBoroughState } from "@/lib/places-shared";
import {
  customerRefFromRateCon,
  formatParsedStop,
  parsedStopHasDetails,
  rateConApplyContactFields,
  type ParsedRateCon,
  type ParsedStop,
} from "@/lib/rate-con-shared";
import type { Location } from "@/lib/types";

export function useRateConLocationBook(
  parsed: ParsedRateCon,
  locations: Location[],
  mapsApiKey = "",
  catalog = locations.length === 0,
  facilityMatches: { shipper: FacilityMatchPreview; consignee: FacilityMatchPreview } | null = null,
) {
  const [book, setBook] = useState(locations);
  const [shipperId, setShipperId] = useState("");
  const [consigneeId, setConsigneeId] = useState("");

  const remember = (location: Location, role: "shipper" | "receiver") => {
    setBook((current) => (current.some((item) => item.id === location.id) ? current : [...current, location]));
    if (role === "shipper") setShipperId(String(location.id));
    else setConsigneeId(String(location.id));
  };

  const pickExisting = (locationId: string, role: "shipper" | "receiver") => {
    if (role === "shipper") setShipperId(locationId);
    else setConsigneeId(locationId);
  };

  return {
    book,
    shipperId,
    consigneeId,
    formKey: `${shipperId}-${consigneeId}`,
    defaults: {
      ...parsed,
      customer_reference: customerRefFromRateCon(parsed),
      equipment: parsed.equipment,
      reefer_mode: parsed.reefer_mode,
      shipper_location_id: shipperId ? Number(shipperId) : null,
      consignee_location_id: consigneeId ? Number(consigneeId) : null,
      ...rateConApplyContactFields(parsed),
    },
    review: (
      <RateConLocationReview
        parsed={parsed}
        book={book}
        shipperId={shipperId}
        consigneeId={consigneeId}
        mapsApiKey={mapsApiKey}
        catalog={catalog}
        facilityMatches={facilityMatches}
        onSaved={remember}
        onPick={pickExisting}
      />
    ),
  };
}

function RateConLocationReview({
  parsed,
  book,
  shipperId,
  consigneeId,
  mapsApiKey,
  catalog = false,
  facilityMatches = null,
  onSaved,
  onPick,
}: {
  parsed: ParsedRateCon;
  book: Location[];
  shipperId: string;
  consigneeId: string;
  mapsApiKey: string;
  catalog?: boolean;
  facilityMatches?: { shipper: FacilityMatchPreview; consignee: FacilityMatchPreview } | null;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
  onPick: (locationId: string, role: "shipper" | "receiver") => void;
}) {
  const showShipper = parsedStopHasDetails(parsed.shipper);
  const showConsignee = parsedStopHasDetails(parsed.consignee);
  const extras = parsed.extra_stops.filter((extra) => parsedStopHasDetails(extra.stop));
  if (!showShipper && !showConsignee && extras.length === 0) return null;

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {showShipper ? (
        <StopReviewCard
          title="Pickup 1"
          role="shipper"
          stop={parsed.shipper}
          book={book}
          selectedId={shipperId}
          matched={book.find((location) => String(location.id) === shipperId) ?? null}
          mapsApiKey={mapsApiKey}
          catalog={catalog}
          suggested={facilityMatches?.shipper ?? null}
          suggestionReady={facilityMatches != null}
          onSaved={onSaved}
          onPick={onPick}
        />
      ) : null}
      {showConsignee ? (
        <StopReviewCard
          title="Delivery 1"
          role="receiver"
          stop={parsed.consignee}
          book={book}
          selectedId={consigneeId}
          matched={book.find((location) => String(location.id) === consigneeId) ?? null}
          mapsApiKey={mapsApiKey}
          catalog={catalog}
          suggested={facilityMatches?.consignee ?? null}
          suggestionReady={facilityMatches != null}
          onSaved={onSaved}
          onPick={onPick}
        />
      ) : null}
      {extras.map((extra, index) => (
        <ExtraStopCard
          key={`${extra.kind}-${index}-${extra.stop.name}-${extra.stop.city}`}
          title={extraStopTitle(parsed, extra.kind, index)}
          stop={extra.stop}
        />
      ))}
    </div>
  );
}

function extraStopTitle(parsed: ParsedRateCon, kind: "pickup" | "delivery", index: number): string {
  const prior = parsed.extra_stops.slice(0, index + 1).filter((extra) => extra.kind === kind).length;
  const label = kind === "pickup" ? "Pickup" : "Delivery";
  return `${label} ${prior + 1}`;
}

function ExtraStopCard({ title, stop }: { title: string; stop: ParsedStop }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm" data-extra-stop="">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <p className="mt-1 font-medium">{formatParsedStop(stop)}</p>
      <StopMeta stop={stop} />
    </section>
  );
}

function StopMeta({ stop }: { stop: ParsedStop }) {
  const schedule =
    stop.schedule_type === "fcfs" ? "FCFS" : stop.schedule_type === "appointment" ? "Appointment required" : "";
  if (!schedule && !stop.confirmation && !stop.reference && !stop.notes && !stop.window_start) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-slate-600" data-stop-meta="">
      {schedule ? <li>Window: {schedule}</li> : null}
      {stop.window_start || stop.window_end ? (
        <li>
          Hours: {[stop.window_start, stop.window_end].filter(Boolean).join(" – ")}
        </li>
      ) : null}
      {stop.reference ? <li>Purchase Order #: {stop.reference}</li> : null}
      {stop.confirmation ? <li>Confirmation number: {stop.confirmation}</li> : null}
      {stop.notes ? <li>Notes: {stop.notes}</li> : null}
    </ul>
  );
}

function AliasUseForm({
  suggestion,
  stop,
  role,
  autoFocus,
  onSaved,
  onCreateNew,
}: {
  suggestion: { id: number; name: string };
  stop: ParsedStop;
  role: "shipper" | "receiver";
  autoFocus: boolean;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
  onCreateNew: () => void;
}) {
  const [state, formAction, pending] = useActionState(rememberFacilityAliasFormAction, null);
  const reportedId = useRef<number | null>(null);

  useEffect(() => {
    if (!state?.ok || reportedId.current === state.location.id) return;
    reportedId.current = state.location.id;
    onSaved(state.location, role);
  }, [onSaved, role, state]);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="location_id" value={suggestion.id} />
      <input type="hidden" name="name" value={stop.name} />
      <input type="hidden" name="street" value={stop.street} />
      <input type="hidden" name="city" value={stop.city} />
      <input type="hidden" name="state" value={stop.state} />
      <input type="hidden" name="zip" value={stop.zip} />
      {state && !state.ok ? (
        <p role="alert" className="mb-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <FacilityMatchPrompt
        facilityName={suggestion.name}
        pending={pending}
        autoFocus={autoFocus}
        useName="use_existing"
        onCreateNew={onCreateNew}
      />
    </form>
  );
}

function StopReviewCard({
  title,
  role,
  stop,
  book,
  selectedId,
  matched,
  mapsApiKey,
  catalog = false,
  suggested = null,
  suggestionReady = false,
  onSaved,
  onPick,
}: {
  title: string;
  role: "shipper" | "receiver";
  stop: ParsedStop;
  book: Location[];
  selectedId: string;
  matched: Location | null;
  mapsApiKey: string;
  catalog?: boolean;
  suggested?: FacilityMatchPreview;
  suggestionReady?: boolean;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
  onPick: (locationId: string, role: "shipper" | "receiver") => void;
}) {
  const stopKey = [stop.name, stop.street, stop.city, stop.state, stop.zip].join("|");
  const [choice, setChoice] = useState<"checking" | "prompt" | "create">(
    suggestionReady ? (suggested ? "prompt" : "create") : "checking",
  );
  const [suggestion, setSuggestion] = useState<FacilityMatchPreview>(suggested ?? null);
  const [queriedKey, setQueriedKey] = useState(stopKey);
  if (queriedKey !== stopKey) {
    setQueriedKey(stopKey);
    setChoice("checking");
    setSuggestion(null);
  }

  useEffect(() => {
    if (suggestionReady) return;
    let cancelled = false;
    const incoming = {
      name: stop.name,
      street: stop.street,
      city: stop.city,
      state: stop.state,
      zip: stop.zip,
    };
    startTransition(async () => {
      try {
        const match = await suggestFacilityMatchAction(incoming);
        if (cancelled) return;
        if (match) {
          setSuggestion({ id: match.id, name: match.name });
          setChoice("prompt");
        } else {
          setChoice("create");
        }
      } catch {
        if (!cancelled) setChoice("create");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [suggestionReady, stopKey, stop.name, stop.street, stop.city, stop.state, stop.zip]);

  const showPrompt = !matched && choice === "prompt" && suggestion;
  const showCreate = !matched && choice === "create";

  return (
    <section
      className={`rounded-lg border px-4 py-3 text-sm ${
        matched
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wide ${
          matched ? "text-emerald-800" : "text-slate-600"
        }`}
      >
        {title}
      </div>
      {matched ? (
        <p className="mt-1 text-xs">Matched a saved location. Change it below if this is the wrong place.</p>
      ) : choice === "checking" ? (
        <p className="mt-1 text-slate-600" role="status">
          Checking saved locations.
        </p>
      ) : (
        <>
          {showCreate ? <p className="mt-1 font-medium">No matching Locations row</p> : null}
          <p className="mt-1">{formatParsedStop(stop)}</p>
        </>
      )}
      <StopMeta stop={stop} />
      {showPrompt && suggestion ? (
        <AliasUseForm
          suggestion={suggestion}
          stop={stop}
          role={role}
          autoFocus={role === "shipper"}
          onSaved={onSaved}
          onCreateNew={() => setChoice("create")}
        />
      ) : null}
      <p className={`mt-2 text-xs ${matched ? "text-emerald-800" : "text-slate-600"}`}>
        Type a name or address to pick a different saved location.
      </p>
      <div className="mt-2">
        <LocationPicker
          catalog={catalog}
          locations={book}
          value={selectedId}
          onChange={(locationId) => onPick(locationId, role)}
          emptyLabel="No saved location"
          placeholder="Type any name or address"
        />
      </div>
      {showCreate ? (
        <SaveNewLocationCard
          role={role}
          stop={stop}
          mapsApiKey={mapsApiKey}
          declinedLocationId={suggestion?.id ?? null}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

function SaveNewLocationCard({
  role,
  stop,
  mapsApiKey,
  declinedLocationId = null,
  onSaved,
}: {
  role: "shipper" | "receiver";
  stop: ParsedStop;
  mapsApiKey: string;
  declinedLocationId?: number | null;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
}) {
  const [state, formAction, pending] = useActionState(saveRateConLocationAction, null);
  const prefix = role === "shipper" ? "rate-con-pickup" : "rate-con-delivery";
  const savedId = state && state.ok ? state.location.id : null;
  const draft = state && !state.ok ? state.draft : undefined;
  const [name, setName] = useState(draft?.name ?? stop.name);
  const [street, setStreet] = useState(draft?.street ?? stop.street);
  const [city, setCity] = useState(draft?.city ?? stop.city);
  const [region, setRegion] = useState(draft?.state ?? stop.state);
  const [zip, setZip] = useState(draft?.zip ?? stop.zip);
  const [country, setCountry] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [placePicked, setPlacePicked] = useState(false);
  const [aliasError, setAliasError] = useState("");

  useEffect(() => {
    if (state && state.ok) onSaved(state.location, role);
  }, [savedId]);

  const duplicate = state && !state.ok && state.duplicate ? state : null;

  async function acceptDuplicate() {
    if (!duplicate?.existingId) return;
    setAliasError("");
    const result = await rememberFacilityAliasAction(duplicate.existingId, {
      name,
      street,
      city,
      state: region,
      zip,
    });
    if (!result.ok) {
      setAliasError(result.error);
      return;
    }
    onSaved(result.location, role);
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="font-medium">Save as new location?</p>
      <p className="mt-1 text-slate-600">
        Confirm to add this to the book — we will not create it automatically from the typed search.
      </p>
      {aliasError ? (
        <p role="alert" className="mt-2 text-sm text-rose-800">
          {aliasError}
        </p>
      ) : null}
      {state && !state.ok && !state.duplicate ? (
        <div className="mt-2">
          <FormBanner result={state} />
        </div>
      ) : null}
      <form action={formAction} className="mt-3 grid gap-2 md:grid-cols-2">
        {duplicate ? (
          <div className="md:col-span-2">
            <FacilityMatchPrompt
              facilityName={duplicate.existingName || "this facility"}
              existingId={duplicate.existingId}
              createName="confirm_duplicate"
              pending={pending}
              autoFocus
              onUse={() => {
                void acceptDuplicate();
              }}
            />
          </div>
        ) : null}
        {declinedLocationId ? <input type="hidden" name="declined_location_id" value={declinedLocationId} /> : null}
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="notes" value="Added from rate confirmation" />
        <div className="field md:col-span-2">
          <label htmlFor={`${prefix}-scheduling`}>Scheduling</label>
          <select
            id={`${prefix}-scheduling`}
            name="scheduling_type"
            defaultValue={stop.schedule_type === "fcfs" ? "fcfs" : "appointment"}
          >
            <option value="appointment">Appointment required</option>
            <option value="fcfs">FCFS</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
          <input
            type="checkbox"
            name="call_before"
            value="1"
            defaultChecked={/call before/i.test(stop.notes)}
          />
          Call before pickup/delivery
        </label>
        <div className="field md:col-span-2">
          <label htmlFor={`${prefix}-name`}>Name</label>
          <PlacesAutocomplete
            id={`${prefix}-name`}
            name="name"
            apiKey={mapsApiKey}
            required
            value={name}
            placeholder="Type a business or address"
            onChange={setName}
            onPlace={(place, query) => {
              setPlacePicked(true);
              if (place.placeId) setPlaceId(place.placeId);
              const business = place.name.trim();
              if (!name.trim() || name.trim().toLowerCase() === query.trim().toLowerCase()) setName(business || name);
              if (place.street) setStreet(place.street);
              if (place.city) setCity(place.city);
              if (place.city || place.state) setRegion(applyNyBoroughState(place.city || city, place.state || region));
              if (place.zip) setZip(place.zip);
              if (place.country) setCountry(place.country);
              if (place.latitude != null) setLatitude(String(place.latitude));
              if (place.longitude != null) setLongitude(String(place.longitude));
            }}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor={`${prefix}-street`}>Street</label>
          <input id={`${prefix}-street`} name="street" value={street} onChange={(event) => setStreet(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-city`}>City</label>
          <input id={`${prefix}-city`} name="city" required value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-state`}>State</label>
          <select id={`${prefix}-state`} name="state" required value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">Select state</option>
            {US_STATES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-zip`}>ZIP</label>
          <input id={`${prefix}-zip`} name="zip" value={zip} onChange={(event) => setZip(event.target.value)} />
        </div>
        <input type="hidden" name="country" value={country} />
        <input type="hidden" name="latitude" value={latitude} />
        <input type="hidden" name="longitude" value={longitude} />
        <input type="hidden" name="google_place_id" value={placeId} />
        <input type="hidden" name="place_picked" value={placePicked ? "1" : ""} />
        <div className="field">
          <label htmlFor={`${prefix}-phone`}>Phone</label>
          <input id={`${prefix}-phone`} name="phone" defaultValue={stop.phone} />
        </div>
        <div className="md:col-span-2">
          <button className="btn btn-secondary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save as new location"}
          </button>
        </div>
      </form>
    </div>
  );
}
