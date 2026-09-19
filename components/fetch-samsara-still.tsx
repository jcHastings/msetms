"use client";

import { useActionState, useState } from "react";
import { fetchSamsaraStillAction } from "@/lib/actions";
import { SAMSARA_STILL_CABIN_NOTE, type SamsaraStillStopTime } from "@/lib/samsara-still-shared";
import type { ActionResult } from "@/lib/types";

export function FetchSamsaraStillPanel({
  loadId,
  loads,
  vehicleId,
  canFetch,
  setupMessage,
  stopTimes,
  nowValue,
}: {
  loadId?: number;
  loads?: Array<{ id: number; loadNumber: string; stopTimes: SamsaraStillStopTime[] }>;
  vehicleId: string;
  canFetch: boolean;
  setupMessage: string;
  stopTimes: SamsaraStillStopTime[];
  nowValue: string;
}) {
  const [state, formAction, pending] = useActionState(
    fetchSamsaraStillAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );
  const [selectedLoadId, setSelectedLoadId] = useState(loadId ?? loads?.[0]?.id ?? 0);
  const [facing, setFacing] = useState("road");
  const activeStops =
    loads?.find((item) => item.id === selectedLoadId)?.stopTimes ?? stopTimes;
  const showLoadPicker = Boolean(loads && loads.length > 1);

  return (
    <section className="card mb-4 p-5" data-samsara-still>
      <h2 className="text-sm font-semibold">Samsara still</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pull a camera snapshot onto this load. Road-facing is the usual shot. A miss does not block saving the load.
      </p>
      {setupMessage ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {setupMessage}
        </p>
      ) : null}
      {vehicleId && canFetch ? (
        <p className="mt-2 text-xs text-slate-500">Samsara vehicle {vehicleId}</p>
      ) : null}

      <form action={formAction} className="mt-4 space-y-3">
        {state?.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {state.message || "Samsara still saved on Load documents."}
          </p>
        ) : null}
        {state && !state.ok ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {state.error}
          </p>
        ) : null}
        {showLoadPicker ? (
          <div className="field max-w-sm">
            <label htmlFor="samsara-still-load">Load</label>
            <select
              id="samsara-still-load"
              name="load_id"
              value={selectedLoadId}
              onChange={(event) => setSelectedLoadId(Number(event.target.value))}
            >
              {loads?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.loadNumber}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="load_id" value={selectedLoadId || loadId || ""} />
        )}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="time_choice" value="now" defaultChecked />
            Now
          </label>
          {activeStops.map((stop) => (
            <label key={stop.key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="time_choice" value={stop.key} />
              {stop.label}
            </label>
          ))}
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="radio" name="time_choice" value="custom" />
            Custom
            <input name="captured_at" type="datetime-local" defaultValue={nowValue} />
          </label>
        </fieldset>
        <div className="field max-w-xs">
          <label htmlFor="samsara-still-facing">Camera</label>
          <select
            id="samsara-still-facing"
            name="facing"
            value={facing}
            onChange={(event) => setFacing(event.target.value)}
          >
            <option value="road">Road-facing</option>
            <option value="driver">Driver-facing</option>
          </select>
          {facing === "driver" ? (
            <p className="mt-2 text-sm text-slate-600" data-samsara-still-cabin-note>
              {SAMSARA_STILL_CABIN_NOTE}
            </p>
          ) : null}
        </div>
        <button className="btn btn-secondary" type="submit" disabled={pending || !canFetch || !selectedLoadId}>
          {pending ? "Fetching…" : "Fetch Samsara still"}
        </button>
      </form>
    </section>
  );
}
