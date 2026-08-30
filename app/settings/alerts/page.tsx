import { AlertRulesPanel } from "@/components/alert-rules-panel";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { alertRuleListRows, syncAlertNotifications } from "@/lib/alert-rules";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { formatDateTime } from "@/lib/format";
import { getCompanySettings, listDispatcherUsers } from "@/lib/settings";
import { saveAlertsAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function AlertsSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  syncAlertNotifications();
  const rules = alertRuleListRows().map((rule) => ({
    id: rule.id,
    name: rule.name,
    watching: rule.watching,
    actions: rule.actions,
    updated_at: formatDateTime(rule.updated_at),
  }));
  const users = listDispatcherUsers(false).map((user) => ({ id: user.id, name: user.name }));
  return (
    <SettingsAdminGate>
      <div className="settings-page">
        <SettingsBack />
        <PageHeader
          title="Automated Alerting"
          subtitle="Watch driver, truck, and trailer dates already on Safety and fleet records. Detention and GPS quiet stay separate."
          dense
        />
        <AlertRulesPanel rules={rules} users={users} canEdit={canEdit} />
        <section className="card mt-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Windows and email</h2>
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
            <div className="field">
              <label htmlFor="alert_gps_quiet_hours">GPS quiet window (hours)</label>
              <input
                id="alert_gps_quiet_hours"
                name="alert_gps_quiet_hours"
                type="number"
                min={1}
                max={48}
                step="0.5"
                defaultValue={settings.alert_gps_quiet_hours}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="alert_emails_enabled"
                value="1"
                defaultChecked={Boolean(settings.alert_emails_enabled)}
              />
              Email office users when a rule fires
            </label>
          </SettingsForm>
        </section>
      </div>
    </SettingsAdminGate>
  );
}
