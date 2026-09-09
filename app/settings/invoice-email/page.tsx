import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getInvoiceEmailBody } from "@/lib/settings";
import { saveInvoiceEmailAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function InvoiceEmailSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader title="Invoice email" />
      <section className="card p-6">
        <SettingsForm action={saveInvoiceEmailAction} submitLabel="Save invoice email" canEdit={canEdit}>
          <div className="field md:col-span-2">
            <label htmlFor="invoice_email_body">Email body</label>
            <textarea
              id="invoice_email_body"
              name="invoice_email_body"
              rows={8}
              defaultValue={getInvoiceEmailBody()}
            />
            <p className="mt-1 text-xs text-slate-500">
              Tags: [customer_name], [load_id], [invoice_number], [invoice_total]
            </p>
          </div>
        </SettingsForm>
      </section>
    </SettingsAdminGate>
  );
}
