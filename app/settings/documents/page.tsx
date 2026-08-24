import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { DOCUMENT_TYPES, listDocumentDefaults } from "@/lib/settings";
import { saveDocumentDefaultsAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function DocumentSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const docs = listDocumentDefaults();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Document defaults"
        subtitle="Header, footer, terms, and font size for confirmations, invoice, customer confirmation, and BOL. Make BOL on Load Documents uses the BOL defaults plus the MS Express logo."
      />
      <div className="space-y-6">
        {DOCUMENT_TYPES.map((type) => {
          const defaults = docs.find((row) => row.doc_type === type.value);
          return (
            <section key={type.value} className="card p-6">
              <h2 className="text-sm font-semibold">{type.label}</h2>
              <div className="mt-4">
                <SettingsForm action={saveDocumentDefaultsAction} submitLabel={`Save ${type.label}`} canEdit={canEdit}>
                  <input type="hidden" name="doc_type" value={type.value} />
                  <div className="field md:col-span-2">
                    <label htmlFor={`${type.value}-header`}>Header</label>
                    <input
                      id={`${type.value}-header`}
                      name="header_text"
                      defaultValue={defaults?.header_text ?? ""}
                    />
                  </div>
                  <div className="field md:col-span-2">
                    <label htmlFor={`${type.value}-footer`}>Footer</label>
                    <input
                      id={`${type.value}-footer`}
                      name="footer_text"
                      defaultValue={defaults?.footer_text ?? ""}
                    />
                  </div>
                  <div className="field md:col-span-2">
                    <label htmlFor={`${type.value}-terms`}>Terms</label>
                    <textarea
                      id={`${type.value}-terms`}
                      name="terms_text"
                      rows={3}
                      defaultValue={defaults?.terms_text ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${type.value}-font`}>Font size</label>
                    <input
                      id={`${type.value}-font`}
                      name="font_size"
                      type="number"
                      min={7}
                      max={16}
                      defaultValue={defaults?.font_size ?? 10}
                    />
                  </div>
                </SettingsForm>
              </div>
            </section>
          );
        })}
      </div>
    </SettingsAdminGate>
  );
}
