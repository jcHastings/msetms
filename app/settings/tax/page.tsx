import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { TAX_KINDS, getCompanySettings } from "@/lib/settings";
import { saveTaxAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function TaxSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Tax"
      />
      <section className="card p-6">
        <SettingsForm action={saveTaxAction} submitLabel="Save tax" canEdit={canEdit}>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="tax_enabled" value="1" defaultChecked={Boolean(settings.tax_enabled)} />
            Charge tax on customer invoices
          </label>
          <div className="field">
            <label htmlFor="tax_kind">Kind</label>
            <select id="tax_kind" name="tax_kind" defaultValue={settings.tax_kind}>
              {TAX_KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tax_rate">Rate (%)</label>
            <input
              id="tax_rate"
              name="tax_rate"
              type="number"
              min={0}
              max={30}
              step="0.01"
              defaultValue={settings.tax_rate}
            />
          </div>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
