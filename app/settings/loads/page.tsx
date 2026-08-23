import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings, peekNextLoadNumber } from "@/lib/settings";
import { saveLoadManagementAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function LoadManagementPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Load numbers and sample data"
        subtitle="Next booked load uses the prefix and starting number. Turning sample data off hides the seeded demo loads on the board, search, and home — it does not delete them."
      />
      <section className="card p-6">
        <p className="mb-4 text-sm text-slate-600">
          Next number will be <span className="font-mono font-semibold">{peekNextLoadNumber()}</span>
        </p>
        <SettingsForm action={saveLoadManagementAction} submitLabel="Save load settings" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="load_number_prefix">Prefix</label>
            <input id="load_number_prefix" name="load_number_prefix" defaultValue={settings.load_number_prefix} />
          </div>
          <div className="field">
            <label htmlFor="load_number_next">Next number</label>
            <input
              id="load_number_next"
              name="load_number_next"
              type="number"
              min={1}
              defaultValue={settings.load_number_next}
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="show_sample_data"
              value="1"
              defaultChecked={Boolean(settings.show_sample_data)}
            />
            Show sample / seeded loads
          </label>
        </SettingsForm>
      </section>
    </>
  );
}
