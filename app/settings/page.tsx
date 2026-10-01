import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { canEditSettings, getSignedInDispatcher, roleLabel } from "@/lib/dispatcher-session";
import { SETTINGS_SECTIONS, settingsSectionId } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function SettingsHubPage() {
  const dispatcher = await getSignedInDispatcher();
  return (
    <>
      <PageHeader title="Settings" dense />
      {dispatcher ? (
        <p className="mb-4 text-[12.5px] text-slate-600">
          Signed in as <span className="font-semibold">{dispatcher.name}</span> · {roleLabel(dispatcher.role)}
          {dispatcher.permission_group !== "all" ? ` · ${dispatcher.permission_group}` : ""}
        </p>
      ) : null}
      <nav
        id="settings-groups"
        className="settings-jump mb-4 flex flex-wrap gap-2"
        aria-label="Settings groups"
        data-settings-jump=""
      >
        {SETTINGS_SECTIONS.filter((section) =>
          section.items.some((item) => item.href === "/settings/security" || (dispatcher ? canEditSettings(dispatcher.role) : false)),
        ).map((section) => (
          <a key={section.title} href={`#${settingsSectionId(section.title)}`} className="btn btn-secondary">
            {section.title}
          </a>
        ))}
      </nav>
      <div className="settings-page space-y-5">
        {SETTINGS_SECTIONS.map((section) => {
          const items = section.items.filter((item) => {
            if (item.href === "/settings/security") return true;
            return dispatcher ? canEditSettings(dispatcher.role) : false;
          });
          if (items.length === 0) return null;
          const sectionId = settingsSectionId(section.title);
          return (
          <section key={section.title} id={sectionId} tabIndex={-1} className="settings-section-group">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {section.title}
            </h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="card settings-hub-card block hover:border-slate-300">
                  <div className="text-[13px] font-semibold">{item.label}</div>
                  {"hint" in item && item.hint ? (
                    <div className="settings-hub-hint">{item.hint}</div>
                  ) : null}
                </Link>
              ))}
            </div>
            <p className="mt-2">
              <a href="#settings-groups" className="text-xs font-semibold underline">
                Back to settings groups
              </a>
            </p>
          </section>
          );
        })}
      </div>
    </>
  );
}
