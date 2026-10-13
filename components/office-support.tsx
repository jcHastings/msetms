/** Office help contact. MS Express only. No brokerage identity. */
export const OFFICE_SUPPORT = {
  label: "Help / Support",
  name: "MS Express",
  phoneDisplay: "402-302-0097",
  phoneHref: "tel:+14023020097",
  email: "info@msloads.com",
  emailHref: "mailto:info@msloads.com",
} as const;

export function OfficeSupport({ tone = "sidebar" }: { tone?: "sidebar" | "page" }) {
  if (tone === "page") {
    return (
      <section className="card mb-6 p-6" data-office-support="" aria-label={OFFICE_SUPPORT.label}>
        <h2 className="text-sm font-semibold">{OFFICE_SUPPORT.label}</h2>
        <p className="mt-3 text-sm font-semibold text-slate-800">{OFFICE_SUPPORT.name}</p>
        <p className="mt-2 text-sm">
          <a className="font-semibold text-sky-900 underline" href={OFFICE_SUPPORT.phoneHref}>
            {OFFICE_SUPPORT.phoneDisplay}
          </a>
        </p>
        <p className="mt-1 text-sm">
          <a className="font-semibold text-sky-900 underline" href={OFFICE_SUPPORT.emailHref}>
            {OFFICE_SUPPORT.email}
          </a>
        </p>
      </section>
    );
  }

  return (
    <div
      className="desk-sidebar-support shrink-0 border-t border-white/10 px-3 py-3 text-xs text-slate-200"
      data-office-support=""
      aria-label={OFFICE_SUPPORT.label}
    >
      <div className="font-semibold text-slate-50">{OFFICE_SUPPORT.label}</div>
      <div className="mt-1">{OFFICE_SUPPORT.name}</div>
      <a className="mt-1 block font-semibold underline" href={OFFICE_SUPPORT.phoneHref}>
        {OFFICE_SUPPORT.phoneDisplay}
      </a>
      <a className="mt-1 block break-all font-semibold underline" href={OFFICE_SUPPORT.emailHref}>
        {OFFICE_SUPPORT.email}
      </a>
    </div>
  );
}
