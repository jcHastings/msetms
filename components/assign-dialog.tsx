"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/components/use-dismissable";
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
import type { AssignSuggestion } from "@/lib/assign-suggestion-shared";
import { fleetDivisionOf, isOwnerOperator, type DriverWithTruck, type Trailer, type Truck } from "@/lib/types";

type Props = {
  loadId: number;
  loadNumber: string;
  trucks: Truck[];
  trailers: Trailer[];
  drivers: DriverWithTruck[];
  label?: string;
  defaultOoPercent?: number;
  alertWindows?: ComplianceWindows;
  currentDriverId?: number | null;
  currentTruckId?: number | null;
  currentTrailerId?: number | null;
  triggerClassName?: string;
  suggestions?: AssignSuggestion[];
  readOnly?: boolean;
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
  currentDriverId = null,
  currentTruckId = null,
  currentTrailerId = null,
  triggerClassName = "btn btn-secondary",
  suggestions = [],
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [ooPercent, setOoPercent] = useState(String(defaultOoPercent));
  const [confirmed, setConfirmed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  useDismissable(open, () => setOpen(false), panelRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmed(false);
    setDriverId(currentDriverId ? String(currentDriverId) : "");
    setTruckId(currentTruckId ? String(currentTruckId) : "");
    setTrailerId(currentTrailerId ? String(currentTrailerId) : "");
    const current = drivers.find((item) => item.id === currentDriverId);
    setOoPercent(String(current?.pay_percent ?? defaultOoPercent));
  }, [open, currentDriverId, currentTruckId, currentTrailerId, drivers, defaultOoPercent]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

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
    if (next && isOwnerOperator(next.driver_type)) {
      setOoPercent(String(next.pay_percent ?? defaultOoPercent));
    }
    if (next?.truck_id && trucks.some((item) => item.id === next.truck_id)) {
      setTruckId(String(next.truck_id));
    }
    if (next?.last_trailer_id && trailers.some((item) => item.id === next.last_trailer_id)) {
      setTrailerId(String(next.last_trailer_id));
    }
  }

  function applySuggestion(suggestion: AssignSuggestion) {
    if (readOnly || !suggestion.selectable) return;
    setConfirmed(false);
    setError(null);
    if (suggestion.driverId && drivers.some((item) => item.id === suggestion.driverId)) {
      onDriverChange(String(suggestion.driverId));
    }
    if (trucks.some((item) => item.id === suggestion.truckId)) {
      setTruckId(String(suggestion.truckId));
    }
    if (suggestion.trailerId && trailers.some((item) => item.id === suggestion.trailerId)) {
      setTrailerId(String(suggestion.trailerId));
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
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

  const panel = (
    <div
      className="load-overlay-backdrop overflow-y-auto overscroll-contain"
      data-assign-overlay=""
      role="dialog"
      aria-modal="true"
      aria-labelledby={`assign-title-${loadId}`}
    >
      <form
        ref={panelRef}
        className="load-overlay-panel p-5"
        data-assign-panel=""
        data-assign-read-only={readOnly ? "" : undefined}
        onSubmit={onSubmit}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={`assign-title-${loadId}`} className="text-lg font-semibold">
              {label} {loadNumber}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Assign a driver, truck, and trailer to this load.</p>
          </div>
          <button
            className="btn btn-secondary shrink-0"
            type="button"
            data-assign-close=""
            data-view-only-allow=""
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <input type="hidden" name="load_id" value={loadId} />
        {confirmed ? <input type="hidden" name="confirm_expired" value="1" /> : null}
        <SuggestionList
          loadId={loadId}
          suggestions={suggestions}
          readOnly={readOnly}
          truckId={truckId}
          driverId={driverId}
          trailerId={trailerId}
          onPick={applySuggestion}
        />
        <div className="space-y-3">
          <div className="field">
            <label htmlFor={`driver-${loadId}`}>Driver</label>
            <select
              id={`driver-${loadId}`}
              name="driver_id"
              required
              disabled={readOnly}
              aria-disabled={readOnly || undefined}
              title={readOnly ? "View-only access" : undefined}
              value={driverId}
              onChange={(event) => onDriverChange(event.target.value)}
            >
              <option value="">Select driver</option>
              {drivers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {` · ${fleetDivisionOf(item)}`}
                  {isOwnerOperator(item.driver_type) ? " · OO" : ""}
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
              disabled={readOnly}
              aria-disabled={readOnly || undefined}
              title={readOnly ? "View-only access" : undefined}
              value={truckId}
              onChange={(event) => {
                setTruckId(event.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Select truck</option>
              {trucks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.unit_number}
                  {` · ${fleetDivisionOf(item)}`}
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
              disabled={readOnly}
              aria-disabled={readOnly || undefined}
              title={readOnly ? "View-only access" : undefined}
              value={trailerId}
              onChange={(event) => {
                setTrailerId(event.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">None</option>
              {trailers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.unit_number} · {fleetDivisionOf(item)} · {item.type.replaceAll("_", " ")}
                  {optionNote(trailerComplianceAlerts(item, alertWindows))}
                </option>
              ))}
            </select>
          </div>
          {isOwnerOperator(driver?.driver_type) ? (
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
                disabled={readOnly}
                aria-disabled={readOnly || undefined}
                title={readOnly ? "View-only access" : undefined}
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
                disabled={readOnly}
                aria-disabled={readOnly || undefined}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirm assigning with expired documents.
            </label>
          ) : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            data-view-only-allow=""
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button className="btn btn-secondary" name="dispatch" value="" type="submit" disabled={readOnly || pending || (expired && !confirmed)}>
            {pending ? "Assigning…" : "Assign"}
          </button>
          <button className="btn btn-primary" name="dispatch" value="1" type="submit" disabled={readOnly || pending || (expired && !confirmed)}>
            {pending ? "Dispatching…" : "Assign & Dispatch"}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      <button
        className={triggerClassName}
        type="button"
        data-assign-open=""
        data-view-only-allow=""
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && mounted ? createPortal(panel, document.body) : null}
    </>
  );
}

function SuggestionList({
  loadId,
  suggestions,
  readOnly,
  truckId,
  driverId,
  trailerId,
  onPick,
}: {
  loadId: number;
  suggestions: AssignSuggestion[];
  readOnly: boolean;
  truckId: string;
  driverId: string;
  trailerId: string;
  onPick: (suggestion: AssignSuggestion) => void;
}) {
  return (
    <section className="mb-4" aria-labelledby={`assign-suggest-title-${loadId}`} data-assign-suggestions="">
      <h3 id={`assign-suggest-title-${loadId}`} className="text-sm font-semibold text-slate-900">
        Suggested trucks
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {readOnly
          ? "View only. Suggestions stay visible. Selecting and assigning are off."
          : "Top matches for this load. Tap one to fill the form. You still confirm."}
      </p>
      {suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600" data-assign-suggestions-empty="">
          No trucks to suggest for this load.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {suggestions.map((suggestion) => {
            const locked = readOnly || !suggestion.selectable;
            const selected =
              truckId === String(suggestion.truckId) &&
              (suggestion.driverId == null || driverId === String(suggestion.driverId)) &&
              (suggestion.trailerId == null || trailerId === String(suggestion.trailerId));
            return (
              <li key={suggestion.truckId}>
                <button
                  type="button"
                  className={`assign-suggestion${suggestion.caution ? " assign-suggestion-caution" : ""}`}
                  data-assign-suggestion=""
                  data-truck-id={suggestion.truckId}
                  disabled={locked}
                  aria-disabled={locked || undefined}
                  aria-pressed={selected}
                  title={locked ? (readOnly ? "View-only access" : suggestion.reason) : suggestion.reason}
                  onClick={() => onPick(suggestion)}
                >
                  <span className="assign-suggestion-title">
                    Unit {suggestion.unit}
                    {suggestion.driverName ? ` · ${suggestion.driverName}` : ""}
                  </span>
                  <span className="assign-suggestion-reason">{suggestion.reason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function driverOptionNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  return optionNote(driverComplianceAlerts(driver, windows));
}

function optionNote(alerts: ReturnType<typeof truckComplianceAlerts>): string {
  const label = complianceShortLabel(alerts);
  return label ? ` · ${label}` : "";
}
