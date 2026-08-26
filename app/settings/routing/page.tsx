import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings } from "@/lib/settings";
import { saveRoutingAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function RoutingSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Default routing notes"
        subtitle="Default special instructions on new loads."
      />
      <section className="card p-6">
        <SettingsForm action={saveRoutingAction} submitLabel="Save routing notes" canEdit={canEdit}>
          <div className="field md:col-span-2">
            <label htmlFor="default_routing_notes">Notes the driver will see</label>
            <textarea
              id="default_routing_notes"
              name="default_routing_notes"
              rows={6}
              defaultValue={settings.default_routing_notes}
              placeholder="Call 60 minutes out. No tarps. Live unload."
            />
          </div>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
