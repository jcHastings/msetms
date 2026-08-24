"use client";

import { useEffect, useMemo, useState } from "react";
import { ComplianceList } from "@/components/compliance-badge";
import { collectAssignmentAlerts, driverComplianceAlerts } from "@/lib/compliance";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import type { DriverWithTruck, Load, Trailer, Truck } from "@/lib/types";

export function LoadCarrierScreen({
  drivers,
  trucks,
  trailers = [],
  load,
  defaultOoPercent = 75,
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  card = true,
  onExpiredChange,
}: {
  drivers: DriverWithTruck[];
  trucks: Truck[];
  trailers?: Trailer[];
  load?: Load;
  defaultOoPercent?: number;
  alertWindows?: ComplianceWindows;
  card?: boolean;
  onExpiredChange?: (expired: boolean, confirmed: boolean) => void;
}) {
  const initialDriver = load?.driver_id ? drivers.find((item) => item.id === load.driver_id) : null;
  const [driverKind, setDriverKind] = useState<"company" | "owner_operator">(
    initialDriver?.driver_type === "owner_operator" ? "owner_operator" : "company",
  );
  const [driverId, setDriverId] = useState(load?.driver_id ? String(load.driver_id) : "");
  const [confirmed, setConfirmed] = useState(false);
  const selectedDriver = drivers.find((item) => String(item.id) === driverId);
  const selectedTruck = trucks.find((item) => item.id === load?.truck_id);
  const selectedTrailer = trailers.find((item) => item.id === load?.trailer_id);
  const filteredDrivers = drivers.filter((driver) =>
    driverKind === "owner_operator" ? driver.driver_type === "owner_operator" : driver.driver_type !== "owner_operator",
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

  function syncConfirm(nextConfirmed: boolean) {
    setConfirmed(nextConfirmed);
  }

  return (
    <section data-load-tab="assets" className={card ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <div className="md:col-span-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${driverKind === "company" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setDriverKind("company");
            if (selectedDriver?.driver_type === "owner_operator") setDriverId("");
          }}
        >
          Company driver
        </button>
        <button
          type="button"
          className={`btn ${driverKind === "owner_operator" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setDriverKind("owner_operator");
            if (selectedDriver && selectedDriver.driver_type !== "owner_operator") setDriverId("");
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
          onChange={(event) => {
            setDriverId(event.target.value);
            syncConfirm(false);
          }}
        >
          <option value="">Unassigned</option>
          {filteredDrivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
              {driverNote(driver, alertWindows)}
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
      {selectedDriver?.driver_type === "owner_operator" ? (
        <input
          type="hidden"
          name="oo_percent"
          value={String(load?.oo_percent ?? selectedDriver.pay_percent ?? defaultOoPercent)}
        />
      ) : null}
    </section>
  );
}

function driverNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  const alerts = driverComplianceAlerts(driver, windows);
  const expired = alerts.some((alert) => alert.severity === "expired");
  return expired ? " · expired docs" : "";
}
