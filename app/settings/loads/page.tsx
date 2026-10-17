import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { getDetentionSettings } from "@/lib/detention-store";
import { saveDetentionSettingsAction } from "@/lib/detention-actions";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings, peekNextLoadNumber } from "@/lib/settings";
import { saveLoadManagementAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function LoadManagementPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const detention = getDetentionSettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  const nextNumber = peekNextLoadNumber();
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader title="Load numbers" />
      <section className="card p-6">
        <p className="mb-4 text-sm text-slate-600">
          New loads, including ones created from a rate confirmation, get the next ITS number: one higher than the
          largest all-numeric load number. The next number will be{" "}
          <span className="font-mono font-semibold">{nextNumber}</span>. Raising it reserves every number below it, and
          it will not move below a number already on a load. Existing MSE- numbers stay as they are.
        </p>
        <SettingsForm action={saveLoadManagementAction} submitLabel="Save load settings" canEdit={canEdit}>
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
            Show seeded demo loads
          </label>
        </SettingsForm>
      </section>
      <section className="card mt-4 p-6" data-detention-settings="">
        <h2 className="text-sm font-semibold">Detention requests</h2>
        <p className="mb-4 mt-1 text-sm text-slate-600">
          Delivery stops can draft a detention request after free time. Pickup stops stay off until you turn them on.
          Replies go to the address below. The first email does not include a dollar amount.
        </p>
        <SettingsForm action={saveDetentionSettingsAction} submitLabel="Save detention settings" canEdit={canEdit}>
          <div className="field">
            <label htmlFor="detention_reply_to">Reply-to</label>
            <input
              id="detention_reply_to"
              name="detention_reply_to"
              type="email"
              autoComplete="email"
              defaultValue={detention.replyTo}
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="detention_pickups"
              value="1"
              defaultChecked={detention.pickupsEnabled}
            />
            Offer detention drafts on pickup stops
          </label>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
