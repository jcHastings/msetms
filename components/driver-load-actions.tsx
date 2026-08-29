"use client";

import { useState } from "react";
import { DriverCameraPdf } from "@/components/driver-camera-pdf";
import { driverStopButtons, type DriverStopButton } from "@/lib/driver-stops";
import { driverStopCheckAction, driverUploadAction } from "@/lib/driver-actions";
import { labelForDriverProgress } from "@/lib/types";
import type { LoadStop } from "@/lib/stops";

export function DriverLoadActions({
  loadId,
  loadNumber,
  current,
  closed,
  stops,
}: {
  loadId: number;
  loadNumber: string;
  current: string;
  closed: boolean;
  stops: LoadStop[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const buttons = driverStopButtons(stops);

  async function runStop(button: DriverStopButton) {
    if (!button.enabled || pending || closed) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("stop_id", String(button.stopId));
    form.set("kind", button.kind);
    const result = await driverStopCheckAction(form);
    setPending(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <section className="mt-5 space-y-3">
      <h2 className="text-base font-semibold text-white">Check in / check out</h2>
      {buttons.map((button) => (
        <button
          key={`${button.stopId}-${button.kind}`}
          type="button"
          disabled={pending || closed || !button.enabled}
          onClick={() => void runStop(button)}
          className={`min-h-14 w-full rounded-2xl px-4 text-left text-lg font-semibold shadow-sm ${
            button.enabled && !closed ? "bg-navy text-white" : "bg-slate-200 text-slate-500"
          }`}
        >
          {button.stopLabel} {button.kind === "arrive" ? "Check In" : "Check Out"}
          {!button.enabled && button.stopLabel === "Delivery" && button.kind === "arrive"
            ? " · after pickup check out"
            : ""}
        </button>
      ))}

      <DriverCameraPdf loadId={loadId} loadNumber={loadNumber} />

      <form
        className="rounded-2xl bg-slate-900 p-4 shadow-sm ring-1 ring-white/10"
        action={async (formData) => {
          setError(null);
          const result = await driverUploadAction(formData);
          if (!result.ok) setError(result.error);
        }}
      >
        <h2 className="text-base font-semibold text-white">Or upload a file you already have</h2>
        <p className="mt-1 text-sm text-slate-400">Upload first. Pick Receipt, Scale Ticket, BOL, or Proof of Delivery after.</p>
        <input type="hidden" name="load_id" value={loadId} />
        <div className="mt-3 field">
          <label htmlFor="file" className="text-slate-300">File</label>
          <input id="file" name="file" type="file" required accept="image/*,.pdf" className="min-h-12 text-white" />
        </div>
        <button className="btn btn-primary mt-4 min-h-12 w-full text-base" type="submit">
          Save to this load
        </button>
      </form>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {current ? (
        <p className="text-sm text-slate-500">Current: {labelForDriverProgress(current)}</p>
      ) : null}
    </section>
  );
}
