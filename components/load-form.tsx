"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLoadEdit } from "@/components/load-edit-context";
import { ComplianceList } from "@/components/compliance-badge";
import { FormBanner } from "@/components/form-banner";
import {
  collectAssignmentAlerts,
  complianceShortLabel,
  driverComplianceAlerts,
  trailerComplianceAlerts,
  truckComplianceAlerts,
} from "@/lib/compliance";
import { formatMoney, toInputDateTime } from "@/lib/format";
import { PlaceSearch } from "@/components/place-search";
import { matchLocationForPlace } from "@/lib/places-shared";
import { formatLocationAddress, formatLocationCityState, formatLocationLabel, formatSchedulingSummary, locationMatchesRole } from "@/lib/locations";
import { formatParsedStop, type ParsedStop } from "@/lib/rate-con-shared";
import { REEFER_MODES } from "@/lib/reefer-shared";
import { computeOwnerOperatorPay } from "@/lib/settlement";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import {
  LOAD_STATUSES,
  labelForLoadStatus,
  type ActionResult,
  type Customer,
  type DriverWithTruck,
  type Load,
  type Location,
  type Trailer,
  type Truck,
} from "@/lib/types";

type Defaults = Partial<{
  customer_id: number | null;
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  weight: number | null;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  reference_number: string;
  po_number: string;
  reefer_setpoint_f: number | null;
  reefer_mode: string;
  trailer_number: string;
  shipper_location_id: number | null;
  consignee_location_id: number | null;
  shipper: ParsedStop;
  consignee: ParsedStop;
}>;

type Props = {
  customers: Customer[];
  trucks: Truck[];
  trailers?: Trailer[];
  drivers: DriverWithTruck[];
  locations?: Location[];
  load?: Load;
  defaults?: Defaults;
  inboxId?: string;
  commodities?: string[];
  extraStatuses?: Array<{ value: string; label: string }>;
  defaultOoPercent?: number;
  weightUnit?: string;
  currency?: string;
  targetMarginPercent?: number;
  placesEnabled?: boolean;
  alertWindows?: ComplianceWindows;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  standalone?: boolean;
};

export function LoadForm({
  customers,
  trucks,
  trailers = [],
  drivers,
  locations = [],
  load,
  defaults,
  inboxId,
  commodities = [],
  extraStatuses = [],
  defaultOoPercent = 75,
  weightUnit = "lb",
  currency = "USD",
  targetMarginPercent,
  placesEnabled = false,
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  action,
  submitLabel,
  standalone = false,
}: Props) {
  const edit = useLoadEdit();
  const workspace = standalone ? null : edit;
  const tab = workspace?.tab ?? "all";
  const formId = workspace?.formId;
  const [state, formAction, pending] = useActionState(action, null);
  const extraDefaults = defaults ?? {};
  const [driverId, setDriverId] = useState(load?.driver_id ? String(load.driver_id) : "");
  const [truckId, setTruckId] = useState(load?.truck_id ? String(load.truck_id) : "");
  const [trailerId, setTrailerId] = useState(load?.trailer_id ? String(load.trailer_id) : "");
  const [shipperId, setShipperId] = useState(
    load?.shipper_location_id
      ? String(load.shipper_location_id)
      : extraDefaults.shipper_location_id
        ? String(extraDefaults.shipper_location_id)
        : "",
  );
  const [consigneeId, setConsigneeId] = useState(
    load?.consignee_location_id
      ? String(load.consignee_location_id)
      : extraDefaults.consignee_location_id
        ? String(extraDefaults.consignee_location_id)
        : "",
  );
  const [origin, setOrigin] = useState(load?.origin ?? extraDefaults.origin ?? "");
  const [destination, setDestination] = useState(load?.destination ?? extraDefaults.destination ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const shippers = locations.filter((location) => locationMatchesRole(location, "shipper"));
  const receivers = locations.filter((location) => locationMatchesRole(location, "receiver"));
  const selectedShipper = locations.find((location) => String(location.id) === shipperId) ?? null;
  const selectedConsignee = locations.find((location) => String(location.id) === consigneeId) ?? null;
  const [rate, setRate] = useState(
    load?.rate != null ? String(load.rate) : extraDefaults.rate != null ? String(extraDefaults.rate) : "",
  );
  const [ooPercent, setOoPercent] = useState(
    load?.oo_percent != null ? String(load.oo_percent) : "",
  );
  const selectedDriver = drivers.find((item) => String(item.id) === driverId);
  const selectedTruck = trucks.find((item) => String(item.id) === truckId);
  const selectedTrailer = trailers.find((item) => String(item.id) === trailerId);
  const alerts = useMemo(
    () =>
      collectAssignmentAlerts(
        { driver: selectedDriver, truck: selectedTruck, trailer: selectedTrailer },
        alertWindows,
      ),
    [selectedDriver, selectedTruck, selectedTrailer, alertWindows],
  );
  const expired = alerts.some((alert) => alert.severity === "expired");
  const parsedRate = rate.trim() ? Number.parseFloat(rate) : null;
  const parsedPercent = ooPercent.trim()
    ? Number.parseFloat(ooPercent)
    : selectedDriver?.pay_percent ?? defaultOoPercent;
  const liveOoPay =
    selectedDriver?.driver_type === "owner_operator"
      ? computeOwnerOperatorPay(parsedRate, parsedPercent)
      : null;
  const canSubmit = !pending && !(expired && !confirmed);

  useEffect(() => {
    workspace?.setSubmitState({ canSubmit, pending });
  }, [workspace?.setSubmitState, canSubmit, pending]);

  useEffect(() => {
    if (state && "ok" in state && state.ok) workspace?.clearDirty();
  }, [workspace?.clearDirty, state]);

  return (
    <form
      id={formId}
      action={formAction}
      className={workspace ? "space-y-6" : "card space-y-6 p-6"}
      hidden={
        Boolean(workspace) &&
        tab !== "basics" &&
        tab !== "customer" &&
        tab !== "assets" &&
        tab !== "financials" &&
        tab !== "all"
      }
    >
      <FormBanner result={state} />
      {inboxId ? <input type="hidden" name="inbox_id" value={inboxId} /> : null}
      <input type="hidden" name="customer_name" value={extraDefaults.customer_name ?? ""} />
      <div className={workspace ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
        <Section tab={tab} when="customer">
        <div className="field md:col-span-2">
          <label htmlFor="customer_id">Customer</label>
          <select
            id="customer_id"
            name="customer_id"
            required={!extraDefaults.customer_name}
            defaultValue={load?.customer_id ?? extraDefaults.customer_id ?? ""}
          >
            <option value="">
              {extraDefaults.customer_name
                ? `Create “${extraDefaults.customer_name}”`
                : "Select customer"}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.credit_hold ? " · CREDIT HOLD" : ""}
              </option>
            ))}
          </select>
        </div>
        </Section>
        <Section tab={tab} when="basics">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={load?.status ?? "available"}>
            {LOAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelForLoadStatus(status)}
              </option>
            ))}
            {extraStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="shipper_location_id">Shipper location</label>
          <select
            id="shipper_location_id"
            name="shipper_location_id"
            value={shipperId}
            onChange={(event) => {
              const nextId = event.target.value;
              setShipperId(nextId);
              const next = locations.find((location) => String(location.id) === nextId);
              if (next) setOrigin(formatLocationCityState(next));
            }}
          >
            <option value="">One-off — type origin</option>
            {shippers.map((location) => (
              <option key={location.id} value={location.id}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
          {selectedShipper ? (
            <>
              <p className="text-xs text-slate-500">{formatLocationAddress(selectedShipper)}</p>
              {selectedShipper.phone ? <p className="text-xs text-slate-500">{selectedShipper.phone}</p> : null}
              <p className="text-xs text-slate-500">{formatSchedulingSummary(selectedShipper)}</p>
            </>
          ) : extraDefaults.shipper?.name || extraDefaults.shipper?.street ? (
            <p className="text-xs text-slate-500">From rate con: {formatParsedStop(extraDefaults.shipper)}</p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="consignee_location_id">Consignee location</label>
          <select
            id="consignee_location_id"
            name="consignee_location_id"
            value={consigneeId}
            onChange={(event) => {
              const nextId = event.target.value;
              setConsigneeId(nextId);
              const next = locations.find((location) => String(location.id) === nextId);
              if (next) setDestination(formatLocationCityState(next));
            }}
          >
            <option value="">One-off — type destination</option>
            {receivers.map((location) => (
              <option key={location.id} value={location.id}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
          {selectedConsignee ? (
            <>
              <p className="text-xs text-slate-500">{formatLocationAddress(selectedConsignee)}</p>
              {selectedConsignee.phone ? <p className="text-xs text-slate-500">{selectedConsignee.phone}</p> : null}
              <p className="text-xs text-slate-500">{formatSchedulingSummary(selectedConsignee)}</p>
            </>
          ) : extraDefaults.consignee?.name || extraDefaults.consignee?.street ? (
            <p className="text-xs text-slate-500">From rate con: {formatParsedStop(extraDefaults.consignee)}</p>
          ) : null}
        </div>
        {placesEnabled ? (
          <>
            <PlaceSearch
              enabled
              placeholder="Search origin / shipper address"
              onPick={(place) => {
                const cityState = [place.city, place.state].filter(Boolean).join(", ");
                if (cityState) setOrigin(cityState);
                const match = matchLocationForPlace(shippers, place);
                if (match) setShipperId(String(match));
              }}
            />
            <PlaceSearch
              enabled
              placeholder="Search destination / consignee address"
              onPick={(place) => {
                const cityState = [place.city, place.state].filter(Boolean).join(", ");
                if (cityState) setDestination(cityState);
                const match = matchLocationForPlace(receivers, place);
                if (match) setConsigneeId(String(match));
              }}
            />
          </>
        ) : (
          <p className="text-xs text-slate-500 md:col-span-2">Add a key to enable search.</p>
        )}
        <div className="field">
          <label htmlFor="origin">Origin</label>
          <input
            id="origin"
            name="origin"
            required
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="City, ST"
          />
        </div>
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            name="destination"
            required
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="City, ST"
          />
        </div>
        <div className="field">
          <label htmlFor="pickup_start">Pickup window start</label>
          <input
            id="pickup_start"
            name="pickup_start"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.pickup_start) : extraDefaults.pickup_start ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="pickup_end">Pickup window end</label>
          <input
            id="pickup_end"
            name="pickup_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.pickup_end) : extraDefaults.pickup_end ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_start">Delivery window start</label>
          <input
            id="delivery_start"
            name="delivery_start"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_start) : extraDefaults.delivery_start ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="delivery_end">Delivery window end</label>
          <input
            id="delivery_end"
            name="delivery_end"
            type="datetime-local"
            required
            defaultValue={load ? toInputDateTime(load.delivery_end) : extraDefaults.delivery_end ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="commodity">Commodity</label>
          <input
            id="commodity"
            name="commodity"
            list="commodity-suggestions"
            defaultValue={load?.commodity ?? extraDefaults.commodity ?? ""}
          />
          {commodities.length > 0 ? (
            <datalist id="commodity-suggestions">
              {commodities.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="weight">Weight ({weightUnit})</label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={0}
            defaultValue={load?.weight ?? extraDefaults.weight ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="reference_number">Reference / rate con #</label>
          <input
            id="reference_number"
            name="reference_number"
            defaultValue={load?.reference_number ?? extraDefaults?.reference_number ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="po_number">PO number</label>
          <input id="po_number" name="po_number" defaultValue={load?.po_number ?? extraDefaults?.po_number ?? ""} />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="special_instructions">Special instructions (driver sees these)</label>
          <textarea
            id="special_instructions"
            name="special_instructions"
            rows={4}
            defaultValue={load?.special_instructions ?? extraDefaults?.special_instructions ?? ""}
          />
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="appointment_notes">Appointment notes</label>
          <textarea
            id="appointment_notes"
            name="appointment_notes"
            rows={2}
            defaultValue={load?.appointment_notes ?? extraDefaults?.appointment_notes ?? ""}
          />
        </div>
        </Section>
        <Section tab={tab} when="financials">
        <div className="field">
          <label htmlFor="rate">Rate ({currency})</label>
          <input
            id="rate"
            name="rate"
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
          />
        </div>
        </Section>
        <Section tab={tab} when={["basics", "assets"]}>
        <div className="field">
          <label htmlFor="reefer_setpoint_f">Reefer setpoint (°F)</label>
          <input
            id="reefer_setpoint_f"
            name="reefer_setpoint_f"
            type="number"
            step="0.1"
            defaultValue={load?.reefer_setpoint_f ?? extraDefaults?.reefer_setpoint_f ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="reefer_mode">Reefer mode</label>
          <select
            id="reefer_mode"
            name="reefer_mode"
            defaultValue={
              load?.reefer_mode ||
              extraDefaults.reefer_mode ||
              (load?.reefer_setpoint_f != null || extraDefaults.reefer_setpoint_f != null ? "continuous" : "")
            }
          >
            <option value="">Not a reefer</option>
            {REEFER_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">Reefers default to Continuous. JC’s terms: never start/stop unless you change this.</p>
        </div>
        </Section>
        <Section tab={tab} when="assets">
        <div className="field">
          <label htmlFor="trailer_id">Trailer</label>
          <select
            id="trailer_id"
            name="trailer_id"
            value={trailerId}
            onChange={(event) => {
              setTrailerId(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Unassigned</option>
            {trailers.map((trailer) => (
              <option key={trailer.id} value={trailer.id}>
                {trailer.unit_number}
                {optionNote(trailerComplianceAlerts(trailer, alertWindows))}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="trailer_number">Trailer # (override)</label>
          <input
            id="trailer_number"
            name="trailer_number"
            defaultValue={load?.trailer_number ?? extraDefaults?.trailer_number ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="truck_id">Assigned truck</label>
          <select
            id="truck_id"
            name="truck_id"
            value={truckId}
            onChange={(event) => {
              setTruckId(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Unassigned</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>
                {truck.unit_number}
                {optionNote(truckComplianceAlerts(truck, alertWindows))}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="driver_id">Assigned driver</label>
          <select
            id="driver_id"
            name="driver_id"
            value={driverId}
            onChange={(event) => {
              const nextId = event.target.value;
              setDriverId(nextId);
              setConfirmed(false);
              const next = drivers.find((item) => String(item.id) === nextId);
              if (next?.driver_type === "owner_operator") {
                const keepSaved = load?.driver_id === next.id && load.oo_percent != null;
                setOoPercent(String(keepSaved ? load.oo_percent : next.pay_percent ?? defaultOoPercent));
              } else {
                setOoPercent("");
              }
            }}
          >
            <option value="">Unassigned</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.driver_type === "owner_operator" ? " · OO" : ""}
                {driverOptionNote(driver, alertWindows)}
              </option>
            ))}
          </select>
        </div>
        </Section>
        <Section tab={tab} when="customer">
        <div className="field md:col-span-2">
          <label htmlFor="notes">Internal notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={load?.notes ?? extraDefaults?.notes ?? ""} />
        </div>
        </Section>
        <Section tab={tab} when="financials">
        {selectedDriver?.driver_type === "owner_operator" ? (
          <>
            <div className="field">
              <label htmlFor="oo_percent">Owner-operator %</label>
              <input
                id="oo_percent"
                name="oo_percent"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ooPercent || String(selectedDriver.pay_percent ?? defaultOoPercent)}
                onChange={(event) => setOoPercent(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Computed OO pay</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {formatMoney(liveOoPay)}
                {parsedRate != null ? (
                  <span className="ml-1 text-slate-500">
                    ({parsedPercent}% of {formatMoney(parsedRate)})
                  </span>
                ) : null}
                {targetMarginPercent != null && parsedRate != null && liveOoPay != null ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Margin {Math.round(((parsedRate - liveOoPay) / parsedRate) * 1000) / 10}% · target{" "}
                    {targetMarginPercent}%
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : selectedDriver ? (
          <div className="field">
            <label>Owner-operator pay</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              N/A — company driver
            </div>
          </div>
        ) : null}
        </Section>
      </div>
      {alerts.length > 0 && (tab === "all" || tab === "assets") ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : null}
      {expired ? (
        <label className="flex items-start gap-2 text-sm text-rose-800">
          <input type="checkbox" name="confirm_expired" value="1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I confirm saving this assignment with expired documents.
        </label>
      ) : null}
      {workspace ? null : (
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
      )}
    </form>
  );
}

function Section({
  tab,
  when,
  children,
}: {
  tab: string;
  when: string | string[];
  children: ReactNode;
}) {
  const allowed = Array.isArray(when) ? when : [when];
  const show = tab === "all" || allowed.includes(tab);
  return <div className={show ? "contents" : "hidden"}>{children}</div>;
}

function driverOptionNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  return optionNote(driverComplianceAlerts(driver, windows));
}

function optionNote(alerts: ReturnType<typeof truckComplianceAlerts>): string {
  const label = complianceShortLabel(alerts);
  return label ? ` · ${label}` : "";
}
