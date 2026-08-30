import { DocumentFontForm } from "@/components/document-font-form";
import { DocumentTagHints } from "@/components/document-tag-hints";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { SETTINGS_DOCUMENT_EDITORS } from "@/lib/document-copy";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings, getDocumentDefaults, getDocumentFont, listDocumentDefaults } from "@/lib/settings";
import { saveDocumentDefaultsAction } from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function DocumentSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const docs = listDocumentDefaults();
  const font = getDocumentFont();
  const company = getCompanySettings();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  return (
    <SettingsAdminGate>
      <div className="settings-page">
        <SettingsBack />
        <PageHeader title="Document defaults" dense />
        <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-950">
          Only an Administrator can change these defaults. Skip LTL quotes and 3rd-party BOL — this is company-truck paperwork.
        </div>
        <section className="card mb-4 p-4">
          <h2 className="text-sm font-semibold">Font for generated documents</h2>
          <div className="mt-3">
            <DocumentFontForm
              family={font.family}
              scale={font.scale}
              companyName={company.company_name}
              canEdit={canEdit}
            />
          </div>
        </section>
        <DocumentTagHints />
        <div className="space-y-4">
          {SETTINGS_DOCUMENT_EDITORS.map((type) => {
            const defaults = docs.find((row) => row.doc_type === type.value) ?? getDocumentDefaults(type.value);
            return (
              <section key={type.value} className="card p-4">
                <h2 className="text-sm font-semibold">{type.label}</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">{type.hint}</p>
                <div className="mt-2 rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-[12px] text-sky-950">
                  Include details you want on every {type.label.toLowerCase()}.
                </div>
                <div className="mt-3">
                  <SettingsForm action={saveDocumentDefaultsAction} submitLabel={`Save ${type.label}`} canEdit={canEdit}>
                    <input type="hidden" name="doc_type" value={type.value} />
                    <div className="field md:col-span-2">
                      <label htmlFor={`${type.value}-header`}>Title</label>
                      <input
                        id={`${type.value}-header`}
                        name="header_text"
                        defaultValue={defaults.header_text}
                      />
                    </div>
                    <div className="field md:col-span-2">
                      <label htmlFor={`${type.value}-terms`}>Terms and conditions</label>
                      <textarea
                        id={`${type.value}-terms`}
                        name="terms_text"
                        rows={type.value === "load_confirmation" ? 10 : 4}
                        defaultValue={defaults.terms_text}
                      />
                    </div>
                    <div className="field md:col-span-2">
                      <label htmlFor={`${type.value}-footer`}>Footer</label>
                      <textarea
                        id={`${type.value}-footer`}
                        name="footer_text"
                        rows={2}
                        defaultValue={defaults.footer_text}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`${type.value}-font`}>Base font size</label>
                      <input
                        id={`${type.value}-font`}
                        name="font_size"
                        type="number"
                        min={7}
                        max={16}
                        defaultValue={defaults.font_size ?? 10}
                      />
                    </div>
                  </SettingsForm>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </SettingsAdminGate>
  );
}
