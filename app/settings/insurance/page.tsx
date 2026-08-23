import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings } from "@/lib/settings";
import { saveInsuranceAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function InsuranceSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Insurance coverage"
        subtitle="Policy and expiry for the company. This is local coverage info, not a Business Center insurance store."
      />
      <section className="card p-6">
        <SettingsForm action={saveInsuranceAction} submitLabel="Save insurance" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="insurance_provider">Provider</label>
            <input id="insurance_provider" name="insurance_provider" defaultValue={settings.insurance_provider} />
          </div>
          <div className="field">
            <label htmlFor="insurance_policy">Policy number</label>
            <input id="insurance_policy" name="insurance_policy" defaultValue={settings.insurance_policy} />
          </div>
          <div className="field">
            <label htmlFor="insurance_coverage">Coverage</label>
            <input
              id="insurance_coverage"
              name="insurance_coverage"
              defaultValue={settings.insurance_coverage}
              placeholder="Auto / cargo / general"
            />
          </div>
          <div className="field">
            <label htmlFor="insurance_expires">Expires</label>
            <input
              id="insurance_expires"
              name="insurance_expires"
              type="date"
              defaultValue={settings.insurance_expires}
            />
          </div>
        </SettingsForm>
      </section>
    </>
  );
}
