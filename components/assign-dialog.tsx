"use client";

import { useMemo, useState } from "react";
import { ComplianceList } from "@/components/compliance-badge";
import { assignLoadAction } from "@/lib/actions";
import {
  collectAssignmentAlerts,
  complianceShortLabel,
  driverComplianceAlerts,
  trailerComplianceAlerts,
  truckComplianceAlerts,
} from "@/lib/compliance";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import type { DriverWithTruck, Trailer, Truck } from "@/lib/types";

type Props = {
  loadId: number;
  loadNumber: string;
  trucks: Truck[];
  trailers: Trailer[];
  drivers: DriverWithTruck[];
  label?: string;
  defaultOoPercent?: number;
  alertWindows?: ComplianceWindows;
};

export function AssignDialog({
  loadId,
  loadNumber,
  trucks,
  trailers,
  drivers,
  label = "Assign",
  defaultOoPercent = 75,
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [ooPercent, setOoPercent] = useState(String(defaultOoPercent));
  const [confirmed, setConfirmed] = useState(false);

  const driver = drivers.find((item) => String(item.id) === driverId);
  const truck = trucks.find((item) => String(item.id) === truckId);
  const trailer = trailers.find((item) => String(item.id) === trailerId);
  const alerts = useMemo(
    () => collectAssignmentAlerts({ driver, truck, trailer }, alertWindows),
    [driver, truck, trailer, alertWindows],
  );
  const expired = alerts.some((alert) => alert.severity === "expired");

  function onDriverChange(value: string) {
    setDriverId(value);
    setConfirmed(false);
    const next = drivers.find((item) => String(item.id) === value);
    if (next?.driver_type === "owner_operator") {
      setOoPercent(String(next.pay_percent ?? defaultOoPercent));
    }
    if (next?.truck_id && trucks.some((item) => item.id === next.truck_id)) {
      setTruckId(String(next.truck_id));
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
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
          <form className="card w-full max-w-md p-5 shadow-xl" onSubmit={onSubmit}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Assign {loadNumber}</h2>
              <p className="mt-1 text-sm text-slate-500">Pair a truck, trailer, and driver.</p>
            </div>
            <input type="hidden" name="load_id" value={loadId} />
            {confirmed ? <input type="hidden" name="confirm_expired" value="1" /> : null}
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
                  {drivers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.driver_type === "owner_operator" ? " · OO" : ""}
                      {item.truck_unit ? ` · unit ${item.truck_unit}` : ""}
                      {driverOptionNote(item, alertWindows)}
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
                  onChange={(event) => {
                    setTruckId(event.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">Select truck</option>
                  {trucks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.unit_number} · {item.type.replaceAll("_", " ")}
                      {optionNote(truckComplianceAlerts(item, alertWindows))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`trailer-${loadId}`}>Trailer</label>
                <select
                  id={`trailer-${loadId}`}
                  name="trailer_id"
                  value={trailerId}
                  onChange={(event) => {
                    setTrailerId(event.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">None</option>
                  {trailers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.unit_number} · {item.type.replaceAll("_", " ")}
                      {optionNote(trailerComplianceAlerts(item, alertWindows))}
                    </option>
                  ))}
                </select>
              </div>
              {driver?.driver_type === "owner_operator" ? (
                <div className="field">
                  <label htmlFor={`oo-${loadId}`}>Owner-operator %</label>
                  <input
                    id={`oo-${loadId}`}
                    name="oo_percent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={ooPercent}
                    onChange={(event) => setOoPercent(event.target.value)}
                  />
                </div>
              ) : null}
              {alerts.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <ComplianceList alerts={alerts} />
                </div>
              ) : null}
              {expired ? (
                <label className="flex items-start gap-2 text-sm text-rose-800">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I confirm assigning with expired documents.
                </label>
              ) : null}
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={pending || (expired && !confirmed)}>
                {pending ? "Assigning…" : "Assign unit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function driverOptionNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  return optionNote(driverComplianceAlerts(driver, windows));
}

function optionNote(alerts: ReturnType<typeof truckComplianceAlerts>): string {
  const label = complianceShortLabel(alerts);
  return label ? ` · ${label}` : "";
}
