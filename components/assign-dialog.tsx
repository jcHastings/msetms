"use client";

import { useState } from "react";
import { assignLoadAction } from "@/lib/actions";
import type { DriverWithTruck, Truck } from "@/lib/types";

type Props = {
  loadId: number;
  loadNumber: string;
  trucks: Truck[];
  drivers: DriverWithTruck[];
};

export function AssignDialog({ loadId, loadNumber, trucks, drivers }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");

  function onDriverChange(value: string) {
    setDriverId(value);
    const driver = drivers.find((item) => String(item.id) === value);
    if (driver?.truck_id && trucks.some((truck) => truck.id === driver.truck_id)) {
      setTruckId(String(driver.truck_id));
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await assignLoadAction(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>
        Assign
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
          <form className="card w-full max-w-md p-5 shadow-xl" onSubmit={onSubmit}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Assign {loadNumber}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Pair a truck and driver. The load moves to assigned.
              </p>
            </div>
            <input type="hidden" name="load_id" value={loadId} />
            <div className="space-y-3">
              <div className="field">
                <label htmlFor={`driver-${loadId}`}>Driver</label>
                <select
                  id={`driver-${loadId}`}
                  name="driver_id"
                  required
                  value={driverId}
                  onChange={(event) => onDriverChange(event.target.value)}
                >
                  <option value="">Select driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                      {driver.truck_unit ? ` · unit ${driver.truck_unit}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`truck-${loadId}`}>Truck</label>
                <select
                  id={`truck-${loadId}`}
                  name="truck_id"
                  required
                  value={truckId}
                  onChange={(event) => setTruckId(event.target.value)}
                >
                  <option value="">Select truck</option>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.unit_number} · {truck.type.replaceAll("_", " ")} ·{" "}
                      {truck.capacity_lbs.toLocaleString()} lbs
                    </option>
                  ))}
                </select>
              </div>
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? "Assigning…" : "Assign unit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
