import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LegalContact, LegalDocument, PRIVACY_URL, TERMS_URL, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "End-user license agreement for the MS Express TMS.",
  robots: { index: false, follow: false },
  alternates: { canonical: TERMS_URL },
};

const sections: LegalSection[] = [
  {
    id: "effective-date",
    title: "Effective date",
    body: (
      <p>
        These terms are in effect on October 7, 2026. They are the end-user license agreement (EULA) for the MS Express
        TMS at {LEGAL_ENTITY.site}.
      </p>
    ),
  },
  {
    id: "parties",
    title: "Parties",
    body: (
      <p>
        These terms are between {LEGAL_ENTITY.name}, a motor carrier (USDOT {LEGAL_ENTITY.usdot}, MC {LEGAL_ENTITY.mc})
        in {LEGAL_ENTITY.cityState}, and the person who is given a TMS account. By signing in, you agree to these terms.
      </p>
    ),
  },
  {
    id: "license",
    title: "License grant",
    body: (
      <p>
        {LEGAL_ENTITY.name} grants you a limited, non-exclusive, non-transferable license to use the TMS for MS Express
        business while your account is active.
      </p>
    ),
  },
  {
    id: "license-restrictions",
    title: "License restrictions",
    body: (
      <p>
        You may not copy the TMS, sell it, sublicense it, rent it, or try to reverse engineer it. You may not use it for
        any business other than MS Express.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Use the TMS only for MS Express business.</li>
        <li>Do not try to reach data or features your role does not allow.</li>
        <li>Do not upload malware or interfere with how the TMS runs.</li>
        <li>Follow the law, including Department of Transportation rules.</li>
      </ul>
    ),
  },
  {
    id: "accounts",
    title: "User accounts and responsibilities",
    body: (
      <ul>
        <li>The TMS is for MS Express employees, drivers, and contractors who have an account issued by MS Express. It is not offered to the public.</li>
        <li>Keep your password and sign-in codes private. Do not share your account.</li>
        <li>You are responsible for what is done with your account.</li>
        <li>Tell the office right away if you think someone else has used your account.</li>
        <li>MS Express can change or remove an account at any time.</li>
      </ul>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    body: (
      <>
        <p>
          An MS Express administrator may connect MS Express&apos;s own QuickBooks Online company. QuickBooks Online is
          a service of Intuit Inc. Intuit and QuickBooks are registered trademarks of Intuit Inc. MS Express and the TMS
          are not affiliated with, endorsed by, or sponsored by Intuit Inc.
        </p>
        <p>
          Connecting lets the TMS read and write the QuickBooks data described in the{" "}
          <Link href="/privacy">Privacy Policy</Link>. MS Express staff remain responsible for reviewing the accounting
          entries the TMS creates. Intuit&apos;s own terms apply to the QuickBooks company.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "Disclaimer of warranties",
    body: (
      <p>
        The TMS is provided &quot;as is&quot; and &quot;as available.&quot; To the extent the law allows, MS Express
        disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not
        warrant that the TMS will be uninterrupted or error-free, or that an invoice or bill sent to QuickBooks is free
        of mistakes. Review those entries before you rely on them.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the extent the law allows, MS Express is not liable for indirect, incidental, special, or consequential
        losses from using the TMS or the QuickBooks connection, including lost profits or lost data. This limit applies
        even if we have been told those losses were possible.
      </p>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        To the extent the law allows, you will defend and cover MS Express against claims, losses, and reasonable costs
        that come from your misuse of the TMS, your breach of these terms, or your violation of the law while using the
        TMS.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>
        MS Express can suspend or close your account at any time. You can stop using the TMS at any time. An
        administrator can disconnect QuickBooks as the Privacy Policy describes. The sections on your data, warranties,
        liability, indemnity, and governing law still apply after access ends.
      </p>
    ),
  },
  {
    id: "data",
    title: "Your data",
    body: (
      <p>
        MS Express owns the business data in the TMS. The <Link href="/privacy">Privacy Policy</Link> explains how we
        handle it, including QuickBooks data, retention, deletion, and disconnect.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and venue",
    body: (
      <p>
        These terms are governed by the laws of the State of Nebraska. Any dispute will be handled in the state or
        federal courts located in Nebraska.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <LegalContact />
        <p>
          Privacy Policy: <Link href="/privacy">{PRIVACY_URL}</Link>
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      current="terms"
      title="Terms of Use"
      updated="Effective October 7, 2026."
      summary="These are the end-user terms (EULA) for the MS Express TMS, including its QuickBooks Online connection."
      sections={sections}
    />
  );
}
