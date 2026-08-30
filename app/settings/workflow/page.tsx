import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getWorkflowSettings } from "@/lib/settings";
import { saveWorkflowAction } from "@/lib/settings-actions";
import { WORKFLOW_LOAD_STATUSES, WORKFLOW_TRUCK_STATUSES } from "@/lib/workflow-shared";
import { labelForLoadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function statusOptions(includeBlank = true) {
  const options = WORKFLOW_LOAD_STATUSES.map((value) => (
    <option key={value} value={value}>
      {labelForLoadStatus(value)}
    </option>
  ));
  return includeBlank ? [<option key="" value="" />, ...options] : options;
}

export default async function WorkflowSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const workflow = getWorkflowSettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <div className="settings-page">
        <SettingsBack />
        <PageHeader
          title="Automated Workflow"
          subtitle="These rules change live loads. Detention and the 2-hour geofence clock stay. No EDI, Highway, or carrier-setup statuses."
          dense
        />
        <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-900">
          Heads up: saved rules apply without an extra click. Assign blocks cannot be overridden.
        </div>
        <section className="card p-4">
          <SettingsForm action={saveWorkflowAction} submitLabel="Save workflow" canEdit={canEdit} className="grid gap-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Block assign if documents are missing or expired</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="block_driver" value="1" defaultChecked={workflow.blockAssignExpiredDriver} />
                Driver CDL / license or DOT medical
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="block_truck" value="1" defaultChecked={workflow.blockAssignExpiredTruck} />
                Truck registration or DOT / inspection
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="block_trailer" value="1" defaultChecked={workflow.blockAssignExpiredTrailer} />
                Trailer registration or DOT / inspection
              </label>
            </fieldset>

            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="md:col-span-2 text-sm font-semibold">Load / truck status from Samsara arrive and depart</legend>
              <div className="field">
                <label htmlFor="arrive_pu_load">Arrived at pickup → load</label>
                <select id="arrive_pu_load" name="arrive_pu_load" defaultValue={workflow.arrivePickupLoadStatus}>
                  {statusOptions()}
                </select>
              </div>
              <div className="field">
                <label htmlFor="arrive_pu_truck">Arrived at pickup → truck</label>
                <select id="arrive_pu_truck" name="arrive_pu_truck" defaultValue={workflow.arrivePickupTruckStatus}>
                  {WORKFLOW_TRUCK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                  <option value="">—</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="depart_pu_load">Departed pickup → load</label>
                <select id="depart_pu_load" name="depart_pu_load" defaultValue={workflow.departPickupLoadStatus}>
                  {statusOptions()}
                </select>
              </div>
              <div className="field">
                <label htmlFor="depart_pu_truck">Departed pickup → truck</label>
                <select id="depart_pu_truck" name="depart_pu_truck" defaultValue={workflow.departPickupTruckStatus}>
                  <option value="">—</option>
                  {WORKFLOW_TRUCK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="arrive_del_load">Arrived at delivery → load</label>
                <select id="arrive_del_load" name="arrive_del_load" defaultValue={workflow.arriveDeliveryLoadStatus}>
                  {statusOptions()}
                </select>
              </div>
              <div className="field">
                <label htmlFor="arrive_del_truck">Arrived at delivery → truck</label>
                <select id="arrive_del_truck" name="arrive_del_truck" defaultValue={workflow.arriveDeliveryTruckStatus}>
                  <option value="">—</option>
                  {WORKFLOW_TRUCK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>

            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="md:col-span-2 text-sm font-semibold">When a driver is assigned</legend>
              <div className="field">
                <label htmlFor="driver_assign_load">Set load status</label>
                <select id="driver_assign_load" name="driver_assign_load" defaultValue={workflow.driverAssignLoadStatus}>
                  {statusOptions()}
                </select>
              </div>
              <div className="field">
                <label htmlFor="driver_assign_truck">Set truck status</label>
                <select id="driver_assign_truck" name="driver_assign_truck" defaultValue={workflow.driverAssignTruckStatus}>
                  <option value="">—</option>
                  {WORKFLOW_TRUCK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>

            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="md:col-span-2 text-sm font-semibold">Late pickup or delivery</legend>
              <div className="field">
                <label htmlFor="late_kind">Watch</label>
                <select id="late_kind" name="late_kind" defaultValue={workflow.lateStopKind}>
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                  <option value="either">Either</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="late_minutes">Minutes after scheduled time</label>
                <input
                  id="late_minutes"
                  name="late_minutes"
                  type="number"
                  min={0}
                  max={1440}
                  defaultValue={workflow.lateStopMinutes}
                />
              </div>
              <div className="field">
                <label htmlFor="late_load">Set load status</label>
                <select id="late_load" name="late_load" defaultValue={workflow.lateStopLoadStatus}>
                  {statusOptions()}
                </select>
              </div>
              <div className="field md:col-span-2">
                <label htmlFor="late_only">Only if current status is</label>
                <select
                  id="late_only"
                  name="late_only"
                  multiple
                  defaultValue={workflow.lateStopOnlyStatuses}
                  className="min-h-24"
                >
                  {WORKFLOW_LOAD_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {labelForLoadStatus(value)}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
          </SettingsForm>
        </section>
      </div>
    </SettingsAdminGate>
  );
}
