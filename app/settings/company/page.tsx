import { CompanyProfileForm } from "@/components/company-profile-form";
import { LogoUploadForm } from "@/components/logo-upload-form";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Company contact"
        subtitle="Used on load confirmations and as the company header. Address and logo are optional."
      />
      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Contact</h2>
        <div className="mt-4">
          <CompanyProfileForm profile={settings} canEdit={canEdit} />
        </div>
      </section>
      <section className="card p-6">
        <h2 className="text-sm font-semibold">Logo</h2>
        <p className="mt-1 text-sm text-slate-600">Shows on the load confirmation PDF when present.</p>
        <div className="mt-4">
          <LogoUploadForm
            hasLogo={Boolean(settings.logo_stored_name)}
            originalName={settings.logo_original_name}
            canEdit={canEdit}
          />
        </div>
      </section>
    </>
  );
}
