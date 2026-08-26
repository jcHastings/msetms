import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { CURRENCIES, WEIGHT_UNITS, getCompanySettings } from "@/lib/settings";
import { saveUnitsAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function UnitsSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Currency and units"
        subtitle="Working currency and weight units."
      />
      <section className="card p-6">
        <SettingsForm action={saveUnitsAction} submitLabel="Save units" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="currency">Currency</label>
            <select id="currency" name="currency" defaultValue={settings.currency}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="weight_unit">Weight unit</label>
            <select id="weight_unit" name="weight_unit" defaultValue={settings.weight_unit}>
              {WEIGHT_UNITS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
