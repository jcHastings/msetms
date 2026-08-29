"use client";

import { useState } from "react";
import { driverUploadAction } from "@/lib/driver-actions";

export function DriverFuelReceipt({ loadId }: { loadId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="driver-sheet mt-5 rounded-2xl bg-white p-4 shadow-sm"
      action={async (formData) => {
        setError(null);
        setOk(false);
        const result = await driverUploadAction(formData);
        if (!result.ok) setError(result.error);
        else setOk(true);
      }}
    >
      <h2 className="driver-sheet-value text-base font-semibold">Fuel receipt</h2>
      <input type="hidden" name="load_id" value={loadId} />
      <input type="hidden" name="kind" value="fuel_receipt" />
      <div className="mt-3 field">
        <label htmlFor="fuel-photo">Photo</label>
        <input id="fuel-photo" name="file" type="file" accept="image/*,application/pdf" required />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="field">
          <label htmlFor="fuel-gallons">Gallons</label>
          <input id="fuel-gallons" name="gallons" type="number" step="0.1" />
        </div>
        <div className="field">
          <label htmlFor="fuel-state">State</label>
          <input id="fuel-state" name="state" maxLength={2} />
        </div>
      </div>
      <div className="mt-3 field">
        <label htmlFor="fuel-station">Station</label>
        <input id="fuel-station" name="station" />
      </div>
      <button className="btn btn-primary mt-3 w-full" type="submit">
        Save receipt
      </button>
      {ok ? <p className="mt-2 text-sm text-emerald-700">Receipt saved on this load.</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </form>
  );
}
