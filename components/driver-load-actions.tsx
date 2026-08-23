"use client";

import { useState } from "react";
import { driverProgressAction, driverUploadAction } from "@/lib/driver-actions";
import { ATTACHMENT_KINDS, DRIVER_PROGRESS, labelForDriverProgress } from "@/lib/types";

export function DriverLoadActions({
  loadId,
  current,
  closed,
}: {
  loadId: number;
  current: string;
  closed: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function setProgress(progress: string) {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("progress", progress);
    const result = await driverProgressAction(form);
    setPending(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <section className="mt-5 space-y-3">
      <h2 className="text-base font-semibold">Update status</h2>
      {DRIVER_PROGRESS.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={pending || closed}
          onClick={() => setProgress(item.value)}
          className={`min-h-14 w-full rounded-2xl px-4 text-left text-lg font-semibold shadow-sm ${
            current === item.value
              ? "bg-navy text-white"
              : "bg-white text-slate-900"
          }`}
        >
          {item.label}
          {current === item.value ? " · current" : ""}
        </button>
      ))}

      <form
        className="rounded-2xl bg-white p-4 shadow-sm"
        action={async (formData) => {
          setError(null);
          const result = await driverUploadAction(formData);
          if (!result.ok) setError(result.error);
        }}
      >
        <h2 className="text-base font-semibold">Upload a photo or PDF</h2>
        <input type="hidden" name="load_id" value={loadId} />
        <div className="mt-3 field">
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" className="min-h-12" defaultValue="pod">
            {ATTACHMENT_KINDS.filter((kind) => kind.value !== "rate_con").map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 field">
          <label htmlFor="file">File</label>
          <input id="file" name="file" type="file" required accept="image/*,.pdf" className="min-h-12" />
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
