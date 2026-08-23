"use client";

import { useActionState, useEffect, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { saveRateConLocationAction } from "@/lib/actions";
import { US_STATES } from "@/lib/locations";
import {
  formatParsedStop,
  parsedStopHasDetails,
  type ParsedRateCon,
  type ParsedStop,
} from "@/lib/rate-con-shared";
import type { Location } from "@/lib/types";

export function useRateConLocationBook(parsed: ParsedRateCon, locations: Location[]) {
  const [book, setBook] = useState(locations);
  const [shipperId, setShipperId] = useState(parsed.shipper_location_id ? String(parsed.shipper_location_id) : "");
  const [consigneeId, setConsigneeId] = useState(
    parsed.consignee_location_id ? String(parsed.consignee_location_id) : "",
  );

  const remember = (location: Location, role: "shipper" | "receiver") => {
    setBook((current) => (current.some((item) => item.id === location.id) ? current : [...current, location]));
    if (role === "shipper") setShipperId(String(location.id));
    else setConsigneeId(String(location.id));
  };

  return {
    book,
    shipperId,
    consigneeId,
    formKey: `${shipperId}-${consigneeId}`,
    defaults: {
      ...parsed,
      shipper_location_id: shipperId ? Number(shipperId) : null,
      consignee_location_id: consigneeId ? Number(consigneeId) : null,
    },
    review: (
      <RateConLocationReview
        parsed={parsed}
        book={book}
        shipperId={shipperId}
        consigneeId={consigneeId}
        onSaved={remember}
      />
    ),
  };
}

function RateConLocationReview({
  parsed,
  book,
  shipperId,
  consigneeId,
  onSaved,
}: {
  parsed: ParsedRateCon;
  book: Location[];
  shipperId: string;
  consigneeId: string;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
}) {
  const showShipper = parsedStopHasDetails(parsed.shipper);
  const showConsignee = parsedStopHasDetails(parsed.consignee);
  if (!showShipper && !showConsignee) return null;

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {showShipper ? (
        <StopReviewCard
          title="Pickup location"
          role="shipper"
          stop={parsed.shipper}
          matched={book.find((location) => String(location.id) === shipperId) ?? null}
          onSaved={onSaved}
        />
      ) : null}
      {showConsignee ? (
        <StopReviewCard
          title="Delivery location"
          role="receiver"
          stop={parsed.consignee}
          matched={book.find((location) => String(location.id) === consigneeId) ?? null}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function StopReviewCard({
  title,
  role,
  stop,
  matched,
  onSaved,
}: {
  title: string;
  role: "shipper" | "receiver";
  stop: ParsedStop;
  matched: Location | null;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
}) {
  if (matched) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{title}</div>
        <p className="mt-1 font-medium">Matched existing location — {matched.name}</p>
        <p className="mt-1 text-emerald-900">{formatParsedStop(stop)}</p>
        <p className="mt-2 text-xs text-emerald-800">Selected on the load. Change the dropdown if this is the wrong row.</p>
      </section>
    );
  }

  return (
    <SaveNewLocationCard title={title} role={role} stop={stop} onSaved={onSaved} />
  );
}

function SaveNewLocationCard({
  title,
  role,
  stop,
  onSaved,
}: {
  title: string;
  role: "shipper" | "receiver";
  stop: ParsedStop;
  onSaved: (location: Location, role: "shipper" | "receiver") => void;
}) {
  const [state, formAction, pending] = useActionState(saveRateConLocationAction, null);
  const prefix = role === "shipper" ? "rate-con-pickup" : "rate-con-delivery";
  const savedId = state && state.ok ? state.location.id : null;

  useEffect(() => {
    if (state && state.ok) onSaved(state.location, role);
  }, [savedId]);

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">{title}</div>
      <p className="mt-1 font-medium">Save as new location?</p>
      <p className="mt-1 text-amber-900">
        No matching Locations row. Confirm to add this to the book — we will not create it automatically.
      </p>
      {state && !state.ok ? <div className="mt-2"><FormBanner result={state} /></div> : null}
      <form action={formAction} className="mt-3 grid gap-2 md:grid-cols-2">
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="scheduling_type" value="appointment" />
        <input type="hidden" name="notes" value="Added from rate confirmation" />
        <div className="field md:col-span-2">
          <label htmlFor={`${prefix}-name`}>Name</label>
          <input id={`${prefix}-name`} name="name" required defaultValue={stop.name} />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor={`${prefix}-street`}>Street</label>
          <input id={`${prefix}-street`} name="street" defaultValue={stop.street} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-city`}>City</label>
          <input id={`${prefix}-city`} name="city" required defaultValue={stop.city} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-state`}>State</label>
          <select id={`${prefix}-state`} name="state" required defaultValue={stop.state}>
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
          <input id={`${prefix}-zip`} name="zip" defaultValue={stop.zip} />
        </div>
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
    </section>
  );
}
