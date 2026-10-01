import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { PAY_METHODS, getCompanySettings } from "@/lib/settings";
import { savePayAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function PaySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Pay and margin"
      />
      <section className="card p-6">
        <SettingsForm action={savePayAction} submitLabel="Save pay defaults" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="default_oo_percent">Owner-operator default %</label>
            <input
              id="default_oo_percent"
              name="default_oo_percent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={settings.default_oo_percent}
            />
          </div>
          <div className="field">
            <label htmlFor="default_gross_margin_percent">Target gross margin %</label>
            <input
              id="default_gross_margin_percent"
              name="default_gross_margin_percent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={settings.default_gross_margin_percent}
            />
          </div>
          <div className="field">
            <label htmlFor="carrier_pay_method">Carrier / OO payment method</label>
            <select id="carrier_pay_method" name="carrier_pay_method" defaultValue={settings.carrier_pay_method}>
              {PAY_METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="carrier_pay_notes">Payment notes</label>
            <textarea
              id="carrier_pay_notes"
              name="carrier_pay_notes"
              rows={3}
              defaultValue={settings.carrier_pay_notes}
              placeholder="Pay Friday after POD. No QuickBooks bill for OO pay."
            />
          </div>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
