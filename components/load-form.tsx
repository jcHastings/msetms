"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLoadEdit } from "@/components/load-edit-context";
import { ComplianceList } from "@/components/compliance-badge";
import { FormBanner } from "@/components/form-banner";
import { collectAssignmentAlerts, driverComplianceAlerts } from "@/lib/compliance";
import { toInputDateTime } from "@/lib/format";
import {
  LOAD_CONDITIONS,
  LOAD_SIZES,
  LOAD_TRUCK_STATUSES,
} from "@/lib/load-page-shared";
import { REEFER_MODES } from "@/lib/reefer-shared";
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
  equipmentChoices?: Array<{ value: string; label: string }>;
  returnTo?: string;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  standalone?: boolean;
};

export function LoadForm({
  customers,
  trucks,
  trailers = [],
  drivers,
  load,
  defaults,
  inboxId,
  commodities = [],
  extraStatuses = [],
  defaultOoPercent = 75,
  weightUnit = "lb",
  alertWindows = DEFAULT_COMPLIANCE_WINDOWS,
  equipmentChoices = [],
  returnTo = "/board",
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
  const initialDriver = load?.driver_id ? drivers.find((item) => item.id === load.driver_id) : null;
  const [driverKind, setDriverKind] = useState<"company" | "owner_operator">(
    initialDriver?.driver_type === "owner_operator" ? "owner_operator" : "company",
  );
  const [driverId, setDriverId] = useState(load?.driver_id ? String(load.driver_id) : "");
  const [truckId] = useState(load?.truck_id ? String(load.truck_id) : "");
  const [trailerId] = useState(load?.trailer_id ? String(load.trailer_id) : "");
  const [customerId, setCustomerId] = useState(
    load?.customer_id
      ? String(load.customer_id)
      : extraDefaults.customer_id
        ? String(extraDefaults.customer_id)
        : "",
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [createName, setCreateName] = useState(extraDefaults.customer_name ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const selectedCustomer = customers.find((item) => String(item.id) === customerId) ?? null;
  const selectedDriver = drivers.find((item) => String(item.id) === driverId);
  const selectedTruck = trucks.find((item) => String(item.id) === truckId);
  const selectedTrailer = trailers.find((item) => String(item.id) === trailerId);
  const filteredDrivers = drivers.filter((driver) =>
    driverKind === "owner_operator" ? driver.driver_type === "owner_operator" : driver.driver_type !== "owner_operator",
  );
  const customerMatches = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerQuery.trim().toLowerCase()),
  );
  const looksReefer = Boolean(
    load?.reefer_mode ||
      extraDefaults.reefer_mode ||
      load?.reefer_setpoint_f != null ||
      extraDefaults.reefer_setpoint_f != null ||
      /reefer/i.test(load?.equipment ?? ""),
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
      hidden={Boolean(workspace) && tab !== "basics" && tab !== "customer" && tab !== "assets" && tab !== "financials" && tab !== "all"}
    >
      <FormBanner result={state} />
      {inboxId ? <input type="hidden" name="inbox_id" value={inboxId} /> : null}
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="truck_id" value={truckId} />
      <input type="hidden" name="trailer_id" value={trailerId} />
      <input type="hidden" name="origin" value={load?.origin ?? extraDefaults.origin ?? ""} />
      <input type="hidden" name="destination" value={load?.destination ?? extraDefaults.destination ?? ""} />
      <input type="hidden" name="pickup_start" value={load ? toInputDateTime(load.pickup_start) : extraDefaults.pickup_start ?? ""} />
      <input type="hidden" name="pickup_end" value={load ? toInputDateTime(load.pickup_end) : extraDefaults.pickup_end ?? ""} />
      <input type="hidden" name="delivery_start" value={load ? toInputDateTime(load.delivery_start) : extraDefaults.delivery_start ?? ""} />
      <input type="hidden" name="delivery_end" value={load ? toInputDateTime(load.delivery_end) : extraDefaults.delivery_end ?? ""} />
      <input type="hidden" name="shipper_location_id" value={load?.shipper_location_id ?? extraDefaults.shipper_location_id ?? ""} />
      <input type="hidden" name="consignee_location_id" value={load?.consignee_location_id ?? extraDefaults.consignee_location_id ?? ""} />
      <input type="hidden" name="special_instructions" value={load?.special_instructions ?? extraDefaults.special_instructions ?? ""} />
      <input type="hidden" name="appointment_notes" value={load?.appointment_notes ?? extraDefaults.appointment_notes ?? ""} />
      <input type="hidden" name="customer_name" value={customerId ? "" : createName} />
      {load?.rate != null ? <input type="hidden" name="rate" value={String(load.rate)} /> : null}

      <Section tab={tab} when="basics">
        <section data-load-tab="basics" className={workspace ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
          <div className="field">
            <label htmlFor="status">Load Status</label>
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
            <label htmlFor="truck_status">Truck Status</label>
            <select id="truck_status" name="truck_status" defaultValue={load?.truck_status ?? ""}>
              {LOAD_TRUCK_STATUSES.map((item) => (
                <option key={item.value || "blank"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="branch">Branch</label>
            <input id="branch" name="branch" defaultValue={load?.branch ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="reference_number">Load Reference ID/Numbers</label>
            <input
              id="reference_number"
              name="reference_number"
              defaultValue={load?.reference_number ?? extraDefaults.reference_number ?? ""}
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
            <input id="weight" name="weight" type="number" min={0} defaultValue={load?.weight ?? extraDefaults.weight ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="declared_value">Declared Value</label>
            <input id="declared_value" name="declared_value" type="number" min={0} step="0.01" defaultValue={load?.declared_value ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="load_size">Full/Partial</label>
            <select id="load_size" name="load_size" defaultValue={load?.load_size ?? ""}>
              {LOAD_SIZES.map((item) => (
                <option key={item.value || "blank"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="condition_new_used">New/Used</label>
            <select id="condition_new_used" name="condition_new_used" defaultValue={load?.condition_new_used ?? ""}>
              {LOAD_CONDITIONS.map((item) => (
                <option key={item.value || "blank"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="equipment">Equipment Type</label>
            <select id="equipment" name="equipment" defaultValue={load?.equipment || "reefer_53"}>
              {(equipmentChoices.length ? equipmentChoices : [{ value: "", label: "Any" }]).map((item) => (
                <option key={item.value || "any"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="equipment_length">Equipment Length</label>
            <input id="equipment_length" name="equipment_length" defaultValue={load?.equipment_length ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="temperature_f">Temperature °F</label>
            <input id="temperature_f" name="temperature_f" type="number" step="0.1" defaultValue={load?.temperature_f ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="temp_low_f">Lower temp threshold</label>
            <input id="temp_low_f" name="temp_low_f" type="number" step="0.1" defaultValue={load?.temp_low_f ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="temp_high_f">Upper temp threshold</label>
            <input id="temp_high_f" name="temp_high_f" type="number" step="0.1" defaultValue={load?.temp_high_f ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="temp_time_tolerance">Temp time tolerance</label>
            <input id="temp_time_tolerance" name="temp_time_tolerance" defaultValue={load?.temp_time_tolerance ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="container_number">Container #</label>
            <input id="container_number" name="container_number" defaultValue={load?.container_number ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="last_free_day">Last free day</label>
            <input id="last_free_day" name="last_free_day" type="date" defaultValue={load?.last_free_day ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="reefer_setpoint_f">Reefer setpoint (°F)</label>
            <input
              id="reefer_setpoint_f"
              name="reefer_setpoint_f"
              type="number"
              step="0.1"
              defaultValue={load?.reefer_setpoint_f ?? extraDefaults.reefer_setpoint_f ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="reefer_mode">Reefer mode</label>
            <select
              id="reefer_mode"
              name="reefer_mode"
              defaultValue={load?.reefer_mode || extraDefaults.reefer_mode || (looksReefer ? "continuous" : "")}
            >
              <option value="">Not a reefer</option>
              {REEFER_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Reefers default to Continuous.</p>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="public_notes">Public notes</label>
            <textarea id="public_notes" name="public_notes" rows={2} defaultValue={load?.public_notes ?? ""} />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="notes">Private notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={load?.notes ?? extraDefaults.notes ?? ""} />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="posting_notes">Posting notes</label>
            <textarea id="posting_notes" name="posting_notes" rows={2} defaultValue={load?.posting_notes ?? ""} />
          </div>
        </section>
      </Section>

      <Section tab={tab} when="customer">
        <section data-load-tab="customer" className={workspace ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
          <div className="field md:col-span-2">
            <label htmlFor="customer_search">Customer</label>
            <input
              id="customer_search"
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="Search existing customers"
            />
            <select
              id="customer_id"
              name="customer_id"
              required={!createName}
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                if (event.target.value) setCreateName("");
              }}
            >
              <option value="">{createName ? `Create “${createName}”` : "Select customer"}</option>
              {(customerQuery.trim() ? customerMatches : customers).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="new_customer_name">Or create customer</label>
            <div className="flex flex-wrap gap-2">
              <input
                id="new_customer_name"
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  if (event.target.value) setCustomerId("");
                }}
                placeholder="New customer name"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCustomerId("");
                  setCreateName("");
                  setCustomerQuery("");
                }}
              >
                Remove customer
              </button>
            </div>
          </div>
          {selectedCustomer ? (
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="font-medium">{selectedCustomer.name}</div>
              <p className="text-slate-600">Profile phone and address live on the customer record. Load contact below is for this load only.</p>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="contact_name">Contact name</label>
            <input id="contact_name" name="contact_name" defaultValue={load?.contact_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact_email">Contact email</label>
            <input id="contact_email" name="contact_email" type="email" defaultValue={load?.contact_email ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact_phone">Contact phone</label>
            <input id="contact_phone" name="contact_phone" defaultValue={load?.contact_phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact_ext">Ext</label>
            <input id="contact_ext" name="contact_ext" defaultValue={load?.contact_ext ?? ""} />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="customer_reference">Customer reference #</label>
            <input
              id="customer_reference"
              name="customer_reference"
              defaultValue={load?.customer_reference || load?.po_number || extraDefaults.po_number || ""}
            />
          </div>
        </section>
      </Section>

      <Section tab={tab} when="assets">
        <section data-load-tab="assets" className={workspace ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
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
                setConfirmed(false);
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
                onChange={(event) => setConfirmed(event.target.checked)}
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
      </Section>

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

function driverNote(driver: DriverWithTruck, windows: ComplianceWindows): string {
  const alerts = driverComplianceAlerts(driver, windows);
  const expired = alerts.some((alert) => alert.severity === "expired");
  return expired ? " · expired docs" : "";
}
