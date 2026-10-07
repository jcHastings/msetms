import Link from "next/link";

/** MS Express public identity for legal pages. */
export const LEGAL_ENTITY = {
  name: "MS Express",
  usdot: "3062879",
  mc: "056299",
  cityState: "Hastings, Nebraska",
  phone: "402-302-0097",
  phoneHref: "tel:+14023020097",
  /** MS Express accounts receivable. */
  email: "ar@msloads.com",
  site: "https://msetms.mandsloads.com",
} as const;

export const PRIVACY_URL = `${LEGAL_ENTITY.site}/privacy`;
export const TERMS_URL = `${LEGAL_ENTITY.site}/terms`;

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/**
 * Public, signed-out legal page (Privacy, Terms). Static: no session, no database.
 */
export function LegalDocument({
  title,
  summary,
  updated,
  sections,
  current,
}: {
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
  current: "privacy" | "terms";
}) {
  const otherHref = current === "privacy" ? "/terms" : "/privacy";
  const otherLabel = current === "privacy" ? "Terms of Use" : "Privacy Policy";
  const otherUrl = current === "privacy" ? TERMS_URL : PRIVACY_URL;

  return (
    <div className="legal-page" data-legal-page={current}>
      <a href="#legal-main" className="legal-skip">
        Skip to content
      </a>
      <header className="legal-header">
        <div className="legal-wrap legal-header-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ms-express-logo-on-dark.png" alt="MS Express" className="legal-logo" width={132} height={44} />
          <nav aria-label="Legal" className="legal-nav">
            <Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>
              Privacy
            </Link>
            <Link href="/terms" aria-current={current === "terms" ? "page" : undefined}>
              Terms of Use
            </Link>
          </nav>
        </div>
      </header>

      <main id="legal-main" className="legal-wrap legal-main" tabIndex={-1}>
        <h1>{title}</h1>
        <p className="legal-updated">{updated}</p>
        <p className="legal-summary">{summary}</p>

        <nav aria-label="On this page" className="legal-toc">
          <h2>On this page</h2>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="legal-section">
            <h2 id={`${section.id}-title`}>
              <span className="legal-num" aria-hidden="true">
                {index + 1}.
              </span>{" "}
              {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </main>

      <footer className="legal-footer">
        <div className="legal-wrap">
          <p>
            <Link href={otherHref}>{otherLabel}</Link>
            {" · "}
            <a href={otherUrl}>{otherUrl}</a>
          </p>
          <p>
            {LEGAL_ENTITY.name} · USDOT {LEGAL_ENTITY.usdot} · MC {LEGAL_ENTITY.mc} · {LEGAL_ENTITY.cityState}
          </p>
          <p>
            <a href={LEGAL_ENTITY.phoneHref}>{LEGAL_ENTITY.phone}</a> · {LEGAL_ENTITY.email}
          </p>
        </div>
      </footer>
    </div>
  );
}

export function LegalContact() {
  return (
    <address className="legal-address">
      {LEGAL_ENTITY.name}
      <br />
      {LEGAL_ENTITY.cityState}
      <br />
      Phone: <a href={LEGAL_ENTITY.phoneHref}>{LEGAL_ENTITY.phone}</a>
      <br />
      Email: {LEGAL_ENTITY.email}
    </address>
  );
}
