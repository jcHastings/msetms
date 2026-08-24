import { CompanyProfileForm } from "@/components/company-profile-form";
import { LogoUploadForm } from "@/components/logo-upload-form";
import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings, hasCustomCompanyLogo } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Company contact"
        subtitle="Used on load confirmations and as the company header. The default MS Express logo is used until you upload a replacement."
      />
      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Contact</h2>
        <div className="mt-4">
          <CompanyProfileForm profile={settings} canEdit={canEdit} />
        </div>
      </section>
      <section className="card p-6">
        <h2 className="text-sm font-semibold">Logo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shows on login, the dispatcher header, and load confirmation PDFs. Product name stays MS Express TMS.
        </p>
        <div className="mt-4">
          <LogoUploadForm
            hasCustom={hasCustomCompanyLogo(settings)}
            originalName={settings.logo_original_name}
            canEdit={canEdit}
          />
        </div>
      </section>
    </SettingsAdminGate>
  );
}
