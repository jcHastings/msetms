import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { SETTINGS_DOCUMENT_EDITORS } from "@/lib/document-copy";
import { DOCUMENT_FONTS, DOCUMENT_TAG_HINTS } from "@/lib/document-tags";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCompanySettings, getDocumentDefaults, getDocumentFont, listDocumentDefaults } from "@/lib/settings";
import { saveDocumentDefaultsAction, saveDocumentFontAction } from "@/lib/settings-actions";

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
        <PageHeader
          title="Document defaults"
          subtitle="Terms and footers print on driver confirmation, invoice, customer confirmation, and the BOL. Skip LTL quotes and 3rd-party BOL."
          dense
        />
        <section className="card mb-4 p-4">
          <h2 className="text-sm font-semibold">Font for generated documents</h2>
          <p className="mt-1 text-[12px] text-slate-500">
            Over 100% can add pages. Preview: The quick brown fox jumps over the lazy dog.
          </p>
          <div className="mt-3">
            <SettingsForm action={saveDocumentFontAction} submitLabel="Save font settings" canEdit={canEdit}>
              <div className="field">
                <label htmlFor="document_font_family">Font type</label>
                <select id="document_font_family" name="document_font_family" defaultValue={font.family}>
                  {DOCUMENT_FONTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="document_font_scale">Font scaling ({font.scale}%)</label>
                <input
                  id="document_font_scale"
                  name="document_font_scale"
                  type="range"
                  min={80}
                  max={160}
                  step={4}
                  defaultValue={font.scale}
                />
              </div>
              <p
                className="md:col-span-2 text-slate-800"
                style={{ fontSize: `${Math.round(13 * (font.scale / 100))}px` }}
              >
                The quick brown fox jumps over the lazy dog. — {company.company_name}
              </p>
            </SettingsForm>
          </div>
        </section>
        <p className="mb-3 text-[12px] text-slate-500">
          Optional tags: {DOCUMENT_TAG_HINTS.join(" ")}
        </p>
        <div className="space-y-4">
          {SETTINGS_DOCUMENT_EDITORS.map((type) => {
            const defaults = docs.find((row) => row.doc_type === type.value) ?? getDocumentDefaults(type.value);
            return (
              <section key={type.value} className="card p-4">
                <h2 className="text-sm font-semibold">{type.label}</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">{type.hint}</p>
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
                        rows={5}
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
