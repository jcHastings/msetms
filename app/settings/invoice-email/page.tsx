import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getInvoiceEmailBody, getInvoiceSendMode } from "@/lib/settings";
import { saveInvoiceEmailAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function InvoiceEmailSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  const sendMode = getInvoiceSendMode();
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader title="Invoice email" />
      <section className="card p-6">
        <SettingsForm action={saveInvoiceEmailAction} submitLabel="Save invoice email" canEdit={canEdit}>
          <fieldset className="field md:col-span-2" data-invoice-send-mode="">
            <legend className="mb-1 text-sm font-medium text-slate-800">When a load is delivered</legend>
            <label className="mt-1 flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="invoice_send_mode"
                value="ask"
                defaultChecked={sendMode !== "auto"}
              />
              <span>Ask before sending invoice</span>
            </label>
            <label className="mt-1 flex items-start gap-2 text-sm text-slate-700">
              <input type="radio" name="invoice_send_mode" value="auto" defaultChecked={sendMode === "auto"} />
              <span>Send automatically</span>
            </label>
          </fieldset>
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
