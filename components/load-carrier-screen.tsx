"use client";

import { useEffect, useMemo, useState } from "react";
import { ComplianceList } from "@/components/compliance-badge";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { collectAssignmentAlerts, driverComplianceAlerts } from "@/lib/compliance";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import { assignedLoadName } from "@/lib/owner-operator-shared";
import { isOwnerOperator, type DriverWithTruck, type Load, type Trailer, type Truck } from "@/lib/types";

export function LoadCarrierScreen({
  drivers,
  trucks,
  trailers = [],
  load,
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  card = true,
  onExpiredChange,
  onDriverIdChange,
}: {
  drivers: DriverWithTruck[];
  trucks: Truck[];
  trailers?: Trailer[];
  load?: Load;
  defaultOoPercent?: number;
  alertWindows?: ComplianceWindows;
  card?: boolean;
  onExpiredChange?: (expired: boolean, confirmed: boolean) => void;
  onDriverIdChange?: (driverId: string) => void;
}) {
  const { handleAssign } = useLoadAssignPersist(load?.id);
  const initialDriver = load?.driver_id ? drivers.find((item) => item.id === load.driver_id) : null;
  const [driverKind, setDriverKind] = useState<"company" | "owner_operator">(
    isOwnerOperator(initialDriver?.driver_type) ? "owner_operator" : "company",
  );
  const [driverId, setDriverId] = useState(load?.driver_id ? String(load.driver_id) : "");
  const [truckId, setTruckId] = useState(load?.truck_id ? String(load.truck_id) : "");
  const [trailerId, setTrailerId] = useState(load?.trailer_id ? String(load.trailer_id) : "");
  const [confirmed, setConfirmed] = useState(false);
  const selectedDriver = drivers.find((item) => String(item.id) === driverId);
  const selectedTruck = trucks.find((item) => String(item.id) === truckId);
  const selectedTrailer = trailers.find((item) => String(item.id) === trailerId);
  const filteredDrivers = drivers.filter((driver) =>
    driverKind === "owner_operator" ? isOwnerOperator(driver.driver_type) : !isOwnerOperator(driver.driver_type),
  );
  const alerts = useMemo(
    () =>
      collectAssignmentAlerts(
        { driver: selectedDriver, truck: selectedTruck, trailer: selectedTrailer },
        alertWindows,
      ),
    [selectedDriver, selectedTruck, selectedTrailer, alertWindows],
  );
  const expired = alerts.some((alert) => alert.severity === "expired");

  useEffect(() => {
    onExpiredChange?.(expired, confirmed);
  }, [expired, confirmed, onExpiredChange]);

  useEffect(() => {
    onDriverIdChange?.(driverId);
  }, [driverId, onDriverIdChange]);

  function syncConfirm(nextConfirmed: boolean) {
    setConfirmed(nextConfirmed);
  }

  return (
    <section data-load-tab="assets" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-3 py-1.5">
          <h2 className="text-[12.5px] font-semibold">Truck / driver / trailer</h2>
        </div>
      ) : null}
      <div className={card ? "grid gap-2 p-3 md:grid-cols-2" : "grid gap-2 md:grid-cols-2"}>
      <div className="md:col-span-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${driverKind === "company" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setDriverKind("company");
            if (isOwnerOperator(selectedDriver?.driver_type)) setDriverId("");
          }}
        >
          Company driver
        </button>
        <button
          type="button"
          className={`btn ${driverKind === "owner_operator" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setDriverKind("owner_operator");
            if (selectedDriver && !isOwnerOperator(selectedDriver.driver_type)) setDriverId("");
          }}
        >
          Owner-operator
        </button>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="driver_id">{driverKind === "owner_operator" ? "Owner-operator" : "Company driver"}</label>
        <select
          id="driver_id"
          name="driver_id"
          value={driverId}
          data-first-assign={load?.driver_id ? undefined : ""}
          onChange={(event) => {
            const next = event.target.value;
            setDriverId(next);
            syncConfirm(false);
            if (load) {
              handleAssign(
                load.driver_id,
                next,
                "driver_id",
                event,
                confirmed ? { confirm_expired: "1" } : undefined,
              );
            }
          }}
        >
          <option value="">Unassigned</option>
          {filteredDrivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {assignedLoadName(driver)}
              {driverNote(driver, alertWindows)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="truck_id">Truck</label>
        <select
          id="truck_id"
          name="truck_id"
          value={truckId}
          data-first-assign={load?.truck_id ? undefined : ""}
          onChange={(event) => {
            const next = event.target.value;
            setTruckId(next);
            if (load) handleAssign(load.truck_id, next, "truck_id", event);
          }}
        >
          <option value="">Unassigned</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.unit_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="trailer_id">Trailer</label>
        <select
          id="trailer_id"
          name="trailer_id"
          value={trailerId}
          data-first-assign={load?.trailer_id ? undefined : ""}
          onChange={(event) => {
            const next = event.target.value;
            setTrailerId(next);
            if (load) handleAssign(load.trailer_id, next, "trailer_id", event);
          }}
        >
          <option value="">Unassigned</option>
          {trailers.map((trailer) => (
            <option key={trailer.id} value={trailer.id}>
              {trailer.unit_number}
            </option>
          ))}
        </select>
      </div>
      {alerts.length > 0 ? (
        <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : null}
      {expired ? (
        <label className="md:col-span-2 flex items-start gap-2 text-sm text-rose-800">
          <input
            type="checkbox"
            name="confirm_expired"
            value="1"
            checked={confirmed}
            onChange={(event) => syncConfirm(event.target.checked)}
          />
          I confirm saving this assignment with expired documents.
        </label>
      ) : null}
      </div>
    </section>
  );
}

function driverNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  const alerts = driverComplianceAlerts(driver, windows);
  const expired = alerts.some((alert) => alert.severity === "expired");
  return expired ? " · expired docs" : "";
}
