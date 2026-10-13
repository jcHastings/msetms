"use client";

import { useActionState } from "react";
import { syncLocationToSamsaraAction } from "@/lib/actions";
import { SAMSARA_ADDRESS_SCOPES } from "@/lib/samsara-address-shared";

type Props = {
  locationId: number;
  addressId: string | null;
  error: string;
};

export function SamsaraAddressSync({ locationId, addressId, error }: Props) {
  const [state, formAction, pending] = useActionState(syncLocationToSamsaraAction, null);
  const liveError = state ? (state.ok ? "" : state.error) : error;
  const liveOk = state?.ok ? state.message ?? "" : "";

  return (
    <section className="card mt-4 p-5" data-samsara-address>
      <h2 className="text-sm font-semibold">Samsara address</h2>
      <p className="mt-1 text-sm text-slate-600">
        TMS keeps this location. Sync copies the name, address, and pin so routing can use the Samsara address id.
        Trailers stay on Orbcomm.
      </p>
      <p className="mt-3 text-sm">
        {addressId ? (
          <>
            On file: <span className="font-mono">{addressId}</span>
          </>
        ) : (
          <span className="text-slate-600">Not on Samsara yet.</span>
        )}
      </p>
      {liveOk ? <p className="mt-2 text-sm text-emerald-800">{liveOk}</p> : null}
      {liveError ? (
        <p className="mt-2 text-sm text-amber-950" role="status">
          {liveError}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">Token needs {SAMSARA_ADDRESS_SCOPES}.</p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="location_id" value={locationId} />
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Syncing…" : "Sync to Samsara"}
        </button>
      </form>
    </section>
  );
}
