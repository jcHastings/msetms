"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ComplianceList } from "@/components/compliance-badge";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { collectAssignmentAlerts, driverComplianceAlerts } from "@/lib/compliance";
import { updateRelayAssignmentAction } from "@/lib/dispatcher-actions";
import { toOfficeDateTime } from "@/lib/format";
import { lastCompletedRelay, relayHasReceiverEquipment, type LoadRelayView } from "@/lib/relays";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import { assignedLoadName } from "@/lib/owner-operator-shared";
import { isOwnerOperator, type DriverWithTruck, type Load, type Trailer, type Truck } from "@/lib/types";

export function LoadCarrierScreen({
  drivers,
  trucks,
  trailers = [],
  load,
  relays = [],
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  card = true,
  onExpiredChange,
  onDriverIdChange,
}: {
  drivers: DriverWithTruck[];
  trucks: Truck[];
  trailers?: Trailer[];
  load?: Load;
  relays?: LoadRelayView[];
  defaultOoPercent?: number;
  alertWindows?: ComplianceWindows;
  card?: boolean;
  onExpiredChange?: (expired: boolean, confirmed: boolean) => void;
  onDriverIdChange?: (driverId: string) => void;
}) {
  const hasRelay = relays.length > 0;
  const firstRelay = relays[0];
  const lastRelay = relays[relays.length - 1];
  const liveRelay = lastCompletedRelay(relays);
  const driver1 = {
    driverId: firstRelay ? firstRelay.from_driver_id ?? null : load?.driver_id ?? null,
    truckId: firstRelay
      ? firstRelay.from_truck_id ?? (liveRelay ? null : load?.truck_id ?? null)
      : load?.truck_id ?? null,
    trailerId: firstRelay
      ? firstRelay.from_trailer_id ?? (liveRelay ? null : load?.trailer_id ?? null)
      : load?.trailer_id ?? null,
  };
  const driver2 = lastRelay
    ? {
        driverId: lastRelay.driver_id,
        truckId: lastRelay.truck_id,
        trailerId: lastRelay.trailer_id,
        completedAt: lastRelay.completed_at,
        relayId: lastRelay.id,
      }
    : null;

  return (
    <section data-load-tab="assets" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-3 py-1.5">
          <h2 className="text-[12.5px] font-semibold">Truck / driver / trailer</h2>
        </div>
      ) : null}
      <DriverAssignmentBlock
        title={hasRelay ? "Driver 1 — first leg / pre-relay" : undefined}
        hint={hasRelay ? "Driver who starts the load. Stays on this row after the handoff." : undefined}
        drivers={drivers}
        trucks={trucks}
        trailers={trailers}
        load={load}
        driverId={driver1.driverId}
        truckId={driver1.truckId}
        trailerId={driver1.trailerId}
        fieldNames={hasRelay ? null : { driver: "driver_id", truck: "truck_id", trailer: "trailer_id" }}
        persistRelay={
          hasRelay && firstRelay
            ? { relayId: firstRelay.id, driverKey: "from_driver_id", truckKey: "from_truck_id", trailerKey: "from_trailer_id" }
            : null
        }
        alertWindows={alertWindows}
        card={card}
        onExpiredChange={liveRelay ? undefined : onExpiredChange}
        onDriverIdChange={liveRelay ? undefined : onDriverIdChange}
      />
      {hasRelay && driver2 ? (
        <DriverAssignmentBlock
          title="Driver 2 — post-relay receiver"
          hint="Receiving driver after the handoff. Workbench and the board use this once the relay is completed."
          drivers={drivers}
          trucks={trucks}
          trailers={trailers}
          load={load}
          driverId={driver2.driverId}
          truckId={driver2.truckId}
          trailerId={driver2.trailerId}
          fieldNames={null}
          persistRelay={{
            relayId: driver2.relayId,
            driverKey: "driver_id",
            truckKey: "truck_id",
            trailerKey: "trailer_id",
          }}
          completedAt={driver2.completedAt}
          showCompletedAt
          alertWindows={alertWindows}
          card={card}
          onExpiredChange={liveRelay ? onExpiredChange : undefined}
          onDriverIdChange={liveRelay ? onDriverIdChange : undefined}
        />
      ) : null}
    </section>
  );
}

function DriverAssignmentBlock({
  title,
  hint,
  drivers,
  trucks,
  trailers,
  load,
  driverId: initialDriverId,
  truckId: initialTruckId,
  trailerId: initialTrailerId,
  fieldNames,
  persistRelay,
  completedAt: initialCompletedAt,
  showCompletedAt = false,
  alertWindows,
  card,
  onExpiredChange,
  onDriverIdChange,
}: {
  title?: string;
  hint?: string;
  drivers: DriverWithTruck[];
  trucks: Truck[];
  trailers: Trailer[];
  load?: Load;
  driverId: number | null;
  truckId: number | null;
  trailerId: number | null;
  fieldNames: { driver: string; truck: string; trailer: string } | null;
  persistRelay: {
    relayId: number;
    driverKey: "driver_id" | "from_driver_id";
    truckKey: "truck_id" | "from_truck_id";
    trailerKey: "trailer_id" | "from_trailer_id";
  } | null;
  completedAt?: string | null;
  showCompletedAt?: boolean;
  alertWindows: ComplianceWindows;
  card: boolean;
  onExpiredChange?: (expired: boolean, confirmed: boolean) => void;
  onDriverIdChange?: (driverId: string) => void;
}) {
  const router = useRouter();
  const { handleAssign } = useLoadAssignPersist(load?.id);
  const initialDriver = initialDriverId ? drivers.find((item) => item.id === initialDriverId) : null;
  const [driverKind, setDriverKind] = useState<"company" | "owner_operator">(
    isOwnerOperator(initialDriver?.driver_type) ? "owner_operator" : "company",
  );
  const [driverId, setDriverId] = useState(initialDriverId ? String(initialDriverId) : "");
  const [truckId, setTruckId] = useState(initialTruckId ? String(initialTruckId) : "");
  const [trailerId, setTrailerId] = useState(initialTrailerId ? String(initialTrailerId) : "");
  const [completedAt, setCompletedAt] = useState(initialCompletedAt ? toOfficeDateTime(initialCompletedAt) : "");
  const [confirmed, setConfirmed] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
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
  const needsCompletedAt =
    showCompletedAt &&
    relayHasReceiverEquipment({
      driver_id: driverId ? Number(driverId) : null,
      truck_id: truckId ? Number(truckId) : null,
      trailer_id: trailerId ? Number(trailerId) : null,
    }) &&
    !completedAt;
  const idPrefix = persistRelay?.driverKey === "from_driver_id" ? "driver1" : persistRelay ? "driver2" : "driver";

  useEffect(() => {
    onExpiredChange?.(expired, confirmed);
  }, [expired, confirmed, onExpiredChange]);

  useEffect(() => {
    onDriverIdChange?.(driverId);
  }, [driverId, onDriverIdChange]);

  function syncConfirm(nextConfirmed: boolean) {
    setConfirmed(nextConfirmed);
  }

  async function persistRelayFields(fields: Record<string, string>) {
    if (!persistRelay) return;
    const formData = new FormData();
    formData.set("relay_id", String(persistRelay.relayId));
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    const result = await updateRelayAssignmentAction(formData);
    if (!result.ok) {
      setRelayError(result.error);
      return;
    }
    setRelayError(null);
    router.refresh();
  }

  function assignDriver(next: string, event: { stopPropagation: () => void }) {
    setDriverId(next);
    syncConfirm(false);
    if (persistRelay) {
      void persistRelayFields({ [persistRelay.driverKey]: next });
      return;
    }
    if (load && fieldNames) {
      handleAssign(load.driver_id, next, fieldNames.driver, event, confirmed ? { confirm_expired: "1" } : undefined);
    }
  }

  function assignTruck(next: string, event: { stopPropagation: () => void }) {
    setTruckId(next);
    if (persistRelay) {
      void persistRelayFields({ [persistRelay.truckKey]: next });
      return;
    }
    if (load && fieldNames) handleAssign(load.truck_id, next, fieldNames.truck, event);
  }

  function assignTrailer(next: string, event: { stopPropagation: () => void }) {
    setTrailerId(next);
    if (persistRelay) {
      void persistRelayFields({ [persistRelay.trailerKey]: next });
      return;
    }
    if (load && fieldNames) handleAssign(load.trailer_id, next, fieldNames.trailer, event);
  }

  return (
    <div className={card ? "grid gap-2 p-3 md:grid-cols-2" : "grid gap-2 md:grid-cols-2"} data-driver-leg={idPrefix}>
      {title ? (
        <div className="md:col-span-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
      ) : null}
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
        <label htmlFor={`${idPrefix}_id`}>{driverKind === "owner_operator" ? "Owner-operator" : "Company driver"}</label>
        <select
          id={`${idPrefix}_id`}
          name={fieldNames?.driver}
          value={driverId}
          data-first-assign={load?.driver_id && !persistRelay ? undefined : persistRelay ? undefined : ""}
          onChange={(event) => assignDriver(event.target.value, event)}
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
        <label htmlFor={`${idPrefix}_truck_id`}>Truck</label>
        <select
          id={`${idPrefix}_truck_id`}
          name={fieldNames?.truck}
          value={truckId}
          data-first-assign={load?.truck_id && !persistRelay ? undefined : persistRelay ? undefined : ""}
          onChange={(event) => assignTruck(event.target.value, event)}
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
        <label htmlFor={`${idPrefix}_trailer_id`}>Trailer</label>
        <select
          id={`${idPrefix}_trailer_id`}
          name={fieldNames?.trailer}
          value={trailerId}
          data-first-assign={load?.trailer_id && !persistRelay ? undefined : persistRelay ? undefined : ""}
          onChange={(event) => assignTrailer(event.target.value, event)}
        >
          <option value="">Unassigned</option>
          {trailers.map((trailer) => (
            <option key={trailer.id} value={trailer.id}>
              {trailer.unit_number}
            </option>
          ))}
        </select>
      </div>
      {showCompletedAt ? (
        <div className="field md:col-span-2">
          <label htmlFor={`${idPrefix}_completed_at`}>Relay completed</label>
          <input
            id={`${idPrefix}_completed_at`}
            type="datetime-local"
            value={completedAt}
            required={needsCompletedAt}
            onChange={(event) => {
              const next = event.target.value;
              setCompletedAt(next);
              void persistRelayFields({ completed_at: next });
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
            Date and time the handoff happened. Required once Driver 2 has a truck and trailer. After that,
            Workbench and the board show Driver 2 as current.
          </p>
        </div>
      ) : null}
      {needsCompletedAt ? (
        <p className="md:col-span-2 text-sm text-rose-700">
          Enter the date and time this relay was completed.
        </p>
      ) : null}
      {relayError ? <p className="md:col-span-2 text-sm text-rose-700">{relayError}</p> : null}
      {alerts.length > 0 ? (
        <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : null}
      {expired ? (
        <label className="md:col-span-2 flex items-start gap-2 text-sm text-rose-800">
          <input
            type="checkbox"
            name={fieldNames ? "confirm_expired" : undefined}
            value="1"
            checked={confirmed}
            onChange={(event) => syncConfirm(event.target.checked)}
          />
          I confirm saving this assignment with expired documents.
        </label>
      ) : null}
    </div>
  );
}

function driverNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  const alerts = driverComplianceAlerts(driver, windows);
  const expired = alerts.some((alert) => alert.severity === "expired");
  return expired ? " · expired docs" : "";
}
