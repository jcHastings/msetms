"use client";

import { useActionState } from "react";
import { refreshRouteAction, saveManualRouteMilesAction } from "@/lib/dispatcher-actions";
import { formatDateTime } from "@/lib/format";
import { formatRouteMiles, type LoadRouteGuide } from "@/lib/routing-shared";

export function LoadRoutingGuide({
  loadId,
  guide,
  mapsConfigured,
}: {
  loadId: number;
  guide: LoadRouteGuide;
  mapsConfigured: boolean;
}) {
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshRouteAction, null);
  const [manualState, manualAction, manualPending] = useActionState(saveManualRouteMilesAction, null);
  const state = refreshState ?? manualState;

  return (
    <section className="card mt-4 space-y-3 p-5" id="routing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Routing guide</h2>
          <p className="mt-1 text-sm text-slate-500">
            Google route miles from the first pickup through the last delivery, including stops in order.
            State miles are an <span className="font-semibold">IFTA estimate</span> only. Official truck IFTA
            stays on Load Log (Samsara).
          </p>
        </div>
        <form action={refreshAction}>
          <input type="hidden" name="load_id" value={loadId} />
          <button className="btn btn-secondary" type="submit" disabled={refreshPending}>
            {refreshPending ? "Refreshing…" : "Refresh route"}
          </button>
        </form>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-slate-500">Total miles</dt>
          <dd className="font-semibold">{formatRouteMiles(guide.totalMiles)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Source</dt>
          <dd className="font-semibold">
            {guide.source === "google" ? "Google Directions" : guide.source === "manual" ? "Manual" : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Calculated</dt>
          <dd className="font-semibold">{guide.calculatedAt ? formatDateTime(guide.calculatedAt) : "—"}</dd>
        </div>
      </dl>

      {!mapsConfigured ? (
        <p className="text-sm text-slate-600">
          Maps key is not set. Enter miles manually or add <code>GOOGLE_MAPS_API_KEY</code> and click Refresh
          route. The load still saves without a route.
        </p>
      ) : null}

      <form action={manualAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="load_id" value={loadId} />
        <div className="field">
          <label htmlFor="manual-route-miles">Manual miles</label>
          <input
            id="manual-route-miles"
            name="route_miles"
            type="number"
            min={0}
            step="0.1"
            defaultValue={guide.source === "manual" && guide.totalMiles != null ? guide.totalMiles : ""}
            placeholder="Empty if unknown"
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={manualPending}>
          Save miles
        </button>
      </form>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">IFTA estimate</h3>
        <p className="mt-1 text-xs text-slate-500">
          From the Google route polyline. Not Samsara IFTA and not for tax filing.
        </p>
        {guide.states.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No state breakdown yet. Refresh route after stops have cities.</p>
        ) : (
          <table className="table-grid mt-2">
            <thead>
              <tr>
                <th>State</th>
                <th>Name</th>
                <th>Miles (est.)</th>
              </tr>
            </thead>
            <tbody>
              {guide.states.map((row) => (
                <tr key={row.state}>
                  <td className="font-semibold">{row.state}</td>
                  <td>{row.name}</td>
                  <td>{formatRouteMiles(row.miles)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {state?.ok === false ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-slate-600">{state.message}</p> : null}
    </section>
  );
}
