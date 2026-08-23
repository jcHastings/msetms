import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings } from "@/lib/settings";
import { saveAlertsAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function AlertsSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Alerts"
        subtitle="These windows drive the compliance inbox and assign-time warnings. Email delivery is a later stub — nothing is sent."
      />
      <section className="card p-6">
        <SettingsForm action={saveAlertsAction} submitLabel="Save alert windows" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="alert_driver_days">License / medical (days)</label>
            <input
              id="alert_driver_days"
              name="alert_driver_days"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.alert_driver_days}
            />
          </div>
          <div className="field">
            <label htmlFor="alert_registration_days">Registration (days)</label>
            <input
              id="alert_registration_days"
              name="alert_registration_days"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.alert_registration_days}
            />
          </div>
          <div className="field">
            <label htmlFor="alert_dot_days">DOT inspection (days)</label>
            <input
              id="alert_dot_days"
              name="alert_dot_days"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.alert_dot_days}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="alert_emails_enabled"
              value="1"
              defaultChecked={Boolean(settings.alert_emails_enabled)}
            />
            Email alerts later (saved, not sent)
          </label>
        </SettingsForm>
      </section>
    </>
  );
}
