import { CompanyProfileForm } from "@/components/company-profile-form";
import { LogoUploadForm } from "@/components/logo-upload-form";
import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { invoiceIssuerProblems, invoiceIssuerWarning } from "@/lib/carrier-identity";
import { getCompanySettings, hasCustomCompanyLogo } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const settings = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  const issuerWarning = invoiceIssuerWarning(invoiceIssuerProblems(settings));
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Company contact"
      />
      {issuerWarning ? (
        <p
          role="alert"
          data-invoice-issuer-warning=""
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {issuerWarning}
        </p>
      ) : null}
      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Contact</h2>
        <div className="mt-4">
          <CompanyProfileForm profile={settings} canEdit={canEdit} />
        </div>
      </section>
      <section className="card p-6">
        <h2 className="text-sm font-semibold">Logo</h2>
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
