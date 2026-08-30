import { SettingsForm } from "@/components/settings-form";
import { saveWorkflowAction } from "@/lib/settings-actions";
import { customLoadStatuses } from "@/lib/settings";
import { labelForLoadStatus } from "@/lib/types";
import {
  displayDurationAmount,
  WORKFLOW_LOAD_STATUSES,
  WORKFLOW_TRUCK_STATUSES,
  type WorkflowSettings,
} from "@/lib/workflow-shared";

function loadStatusOptions(includeBlank = true) {
  const extras = customLoadStatuses().filter((item) => !(WORKFLOW_LOAD_STATUSES as readonly string[]).includes(item.value));
  const options = [
    ...WORKFLOW_LOAD_STATUSES.map((value) => (
      <option key={value} value={value}>
        {labelForLoadStatus(value)}
      </option>
    )),
    ...extras.map((item) => (
      <option key={item.value} value={item.value}>
        {item.label}
      </option>
    )),
  ];
  return includeBlank ? [<option key="" value="" />, ...options] : options;
}

function truckStatusOptions(current = "") {
  const options = WORKFLOW_TRUCK_STATUSES.map((item) => (
    <option key={item.value} value={item.value}>
      {item.label}
    </option>
  ));
  if (current && !WORKFLOW_TRUCK_STATUSES.some((item) => item.value === current)) {
    options.push(
      <option key={current} value={current}>
        {current}
      </option>,
    );
  }
  return [<option key="" value="" />, ...options];
}

function WorkflowCard({
  title,
  note,
  children,
  submitLabel,
  canEdit,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  submitLabel: string;
  canEdit: boolean;
}) {
  return (
    <section className="workflow-card card">
      <h2>{title}</h2>
      <div className="p-4">
        {note ? <p className="workflow-card-note">{note}</p> : null}
        <SettingsForm
          action={saveWorkflowAction}
          submitLabel={submitLabel}
          canEdit={canEdit}
          className="grid gap-3"
          submitClassName="btn workflow-save"
        >
          {children}
        </SettingsForm>
      </div>
    </section>
  );
}

export function WorkflowEngine({ settings, canEdit }: { settings: WorkflowSettings; canEdit: boolean }) {
  return (
    <div className="grid gap-4">
      <WorkflowCard
        title="Assign current user when building or copying a load"
        note="The signed-in dispatcher is written on the load. Skip assign-a-carrier — this TMS is company drivers and owner-operators."
        submitLabel="Save user assignment rule"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="user_assign" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="auto_assign_dispatcher"
            value="1"
            defaultChecked={settings.autoAssignDispatcherOnCreate}
          />
          When the current user builds, copies, or creates from a template, assign them as dispatcher
        </label>
      </WorkflowCard>

      <WorkflowCard
        title="Prevent a driver, truck, or trailer from being assigned if…"
        note="Hard error — the assign cannot be overridden. CDL / license and DOT medical on the driver; registration and DOT / inspection on the unit. No TWIC, hazmat, FAST, or passport."
        submitLabel="Save assignment block rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="blocks" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="block_driver" value="1" defaultChecked={settings.blockAssignExpiredDriver} />
          Company driver: CDL / license or DOT medical not entered or expired
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="block_truck" value="1" defaultChecked={settings.blockAssignExpiredTruck} />
          Power unit: registration or DOT / inspection not entered or expired
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="block_trailer" value="1" defaultChecked={settings.blockAssignExpiredTrailer} />
          Trailer: registration or DOT / inspection not entered or expired
        </label>
      </WorkflowCard>

      <WorkflowCard
        title="Set Load / Truck Status based on arrive and depart"
        note="Samsara 2-mile geofence stamps Arrived / Departed only when those times are empty — dispatcher-typed times stay. Driver Check In / Check Out uses the same rules. Detention alerts stay separate."
        submitLabel="Save arrive / depart rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="arrive_depart" />
        <div className="workflow-rule-grid">
          <span>When this stop event happens…</span>
          <span>Change the load&apos;s Load Status to</span>
          <span>Change the load&apos;s Truck Status to</span>
        </div>
        <div className="workflow-rule-grid">
          <label className="field">
            <span className="sr-only">Arrived at pickup</span>
            <select defaultValue="arrive_pickup" disabled>
              <option value="arrive_pickup">Arrived at pick-up</option>
            </select>
            <input type="hidden" name="arrive_event" value="arrive_pickup" />
          </label>
          <label className="field">
            <span className="sr-only">Arrived at pickup load status</span>
            <select id="arrive_pu_load" name="arrive_pu_load" defaultValue={settings.arrivePickupLoadStatus}>
              {loadStatusOptions()}
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Arrived at pickup truck status</span>
            <select id="arrive_pu_truck" name="arrive_pu_truck" defaultValue={settings.arrivePickupTruckStatus}>
              {truckStatusOptions(settings.arrivePickupTruckStatus)}
            </select>
          </label>
        </div>
        <div className="workflow-rule-grid">
          <label className="field">
            <span className="sr-only">Departed pickup</span>
            <select defaultValue="depart_pickup" disabled>
              <option value="depart_pickup">Departed pick-up with shipment</option>
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Departed pickup load status</span>
            <select id="depart_pu_load" name="depart_pu_load" defaultValue={settings.departPickupLoadStatus}>
              {loadStatusOptions()}
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Departed pickup truck status</span>
            <select id="depart_pu_truck" name="depart_pu_truck" defaultValue={settings.departPickupTruckStatus}>
              {truckStatusOptions(settings.departPickupTruckStatus)}
            </select>
          </label>
        </div>
        <div className="workflow-rule-grid">
          <label className="field">
            <span className="sr-only">Arrived at delivery</span>
            <select defaultValue="arrive_delivery" disabled>
              <option value="arrive_delivery">Arrived at delivery</option>
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Arrived at delivery load status</span>
            <select id="arrive_del_load" name="arrive_del_load" defaultValue={settings.arriveDeliveryLoadStatus}>
              {loadStatusOptions()}
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Arrived at delivery truck status</span>
            <select id="arrive_del_truck" name="arrive_del_truck" defaultValue={settings.arriveDeliveryTruckStatus}>
              {truckStatusOptions(settings.arriveDeliveryTruckStatus)}
            </select>
          </label>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Set Load / Truck Status when a driver is assigned"
        note="Fires when a company driver or owner-operator is assigned or replaced. Removing a driver does not change status."
        submitLabel="Save driver assignment rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="driver_assign" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="field">
            <label htmlFor="driver_assign_load">Change the load&apos;s Load Status to</label>
            <select id="driver_assign_load" name="driver_assign_load" defaultValue={settings.driverAssignLoadStatus}>
              {loadStatusOptions()}
            </select>
          </div>
          <div className="field">
            <label htmlFor="driver_assign_truck">Change the load&apos;s Truck Status to</label>
            <select id="driver_assign_truck" name="driver_assign_truck" defaultValue={settings.driverAssignTruckStatus}>
              {truckStatusOptions(settings.driverAssignTruckStatus)}
            </select>
          </div>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Set Load Status based on Late Pickups or Deliveries"
        note="Status automation only. The 2-hour geofence detention / dwell alerts stay. Leave the status blank to turn this rule off."
        submitLabel="Save late stop rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="late" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="field">
            <label htmlFor="late_kind">If the stop action below…</label>
            <select id="late_kind" name="late_kind" defaultValue={settings.lateStopKind}>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
              <option value="either">Pickup or Delivery</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="late_mode">did not occur within…</label>
            <select id="late_mode" name="late_mode" defaultValue={settings.lateStopMode}>
              <option value="specified">Specified time period</option>
              <option value="same_day">Same day</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="late_minutes">of scheduled time</label>
            <div className="flex gap-2">
              <input
                id="late_minutes"
                name="late_minutes"
                type="number"
                min={0}
                max={10080}
                defaultValue={displayDurationAmount(settings.lateStopMinutes, settings.lateStopUnit)}
              />
              <select id="late_unit" name="late_unit" defaultValue={settings.lateStopUnit}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="late_load">then set Load Status to</label>
            <select id="late_load" name="late_load" defaultValue={settings.lateStopLoadStatus}>
              {loadStatusOptions()}
            </select>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="late_only">Only if the load&apos;s Load Status is one of these</label>
            <select
              id="late_only"
              name="late_only"
              multiple
              defaultValue={settings.lateStopOnlyStatuses}
              className="min-h-24"
            >
              {loadStatusOptions(false)}
            </select>
          </div>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Set Load / Truck Status based on Document Actions"
        note="Invoice sent is the QuickBooks customer invoice. Signature / docs requested is the driver BOL / POD request. No Highway or EDI 214."
        submitLabel="Save document action rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="documents" />
        <div className="workflow-rule-grid">
          <span>When the following document action is taken…</span>
          <span>Change the load&apos;s Load Status to</span>
          <span>Change the load&apos;s Truck Status to</span>
        </div>
        <div className="workflow-rule-grid">
          <label className="field">
            <span className="sr-only">Invoice sent</span>
            <select defaultValue="invoice_sent" disabled>
              <option value="invoice_sent">Invoice sent</option>
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Invoice sent load status</span>
            <select id="invoice_sent_load" name="invoice_sent_load" defaultValue={settings.invoiceSentLoadStatus}>
              {loadStatusOptions()}
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Invoice sent truck status</span>
            <select id="invoice_sent_truck" name="invoice_sent_truck" defaultValue={settings.invoiceSentTruckStatus}>
              {truckStatusOptions(settings.invoiceSentTruckStatus)}
            </select>
          </label>
        </div>
        <div className="workflow-rule-grid">
          <label className="field">
            <span className="sr-only">Signature requested</span>
            <select defaultValue="docs_requested" disabled>
              <option value="docs_requested">Signature / docs requested</option>
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Docs requested load status</span>
            <select id="docs_requested_load" name="docs_requested_load" defaultValue={settings.docsRequestedLoadStatus}>
              {loadStatusOptions()}
            </select>
          </label>
          <label className="field">
            <span className="sr-only">Docs requested truck status</span>
            <select
              id="docs_requested_truck"
              name="docs_requested_truck"
              defaultValue={settings.docsRequestedTruckStatus}
            >
              {truckStatusOptions(settings.docsRequestedTruckStatus)}
            </select>
          </label>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Set Load Status when No Activity occurs"
        note="Activity is a check call, driver SMS, Samsara / Orbcomm ping, or an arrive / depart stamp. Leave minutes at 0 or status blank to keep this off."
        submitLabel="Save no-activity rules"
        canEdit={canEdit}
      >
        <input type="hidden" name="card" value="no_activity" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="field">
            <label htmlFor="no_activity_minutes">When no activity has occurred on the load for</label>
            <div className="flex gap-2">
              <input
                id="no_activity_minutes"
                name="no_activity_minutes"
                type="number"
                min={0}
                max={10080}
                defaultValue={displayDurationAmount(settings.noActivityMinutes, settings.noActivityUnit)}
              />
              <select id="no_activity_unit" name="no_activity_unit" defaultValue={settings.noActivityUnit}>
                <option value="hours">Hours</option>
                <option value="minutes">Minutes</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="no_activity_load">Change the load&apos;s Load Status to</label>
            <select id="no_activity_load" name="no_activity_load" defaultValue={settings.noActivityLoadStatus}>
              {loadStatusOptions()}
            </select>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="no_activity_only">Only if the load&apos;s Load Status is one of these</label>
            <select
              id="no_activity_only"
              name="no_activity_only"
              multiple
              defaultValue={settings.noActivityOnlyStatuses}
              className="min-h-24"
            >
              {loadStatusOptions(false)}
            </select>
          </div>
        </div>
      </WorkflowCard>
    </div>
  );
}
