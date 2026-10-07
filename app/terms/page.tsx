import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LegalContact, LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Terms of Use (draft)",
  description: "End-user terms for the MS Express TMS.",
  robots: { index: false, follow: false },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    body: (
      <p>
        These terms cover your use of the MS Express TMS (&quot;the TMS&quot;) at msetms.mandsloads.com, run by{" "}
        {LEGAL_ENTITY.name} of {LEGAL_ENTITY.cityState} (USDOT {LEGAL_ENTITY.usdot}). By signing in, you agree to these
        terms.
      </p>
    ),
  },
  {
    id: "who-may-use",
    title: "Who may use the TMS",
    body: (
      <p>
        The TMS is for MS Express employees, drivers, and contractors who have an account issued by MS Express. It is not
        offered to the public. MS Express can change or remove an account at any time.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Keep your password and sign-in codes private. Do not share your account.</li>
        <li>You are responsible for what is done with your account.</li>
        <li>Tell the office right away if you think someone else has used your account.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Use the TMS only for MS Express business.</li>
        <li>Do not try to reach data or features your role does not allow.</li>
        <li>Do not upload malware, copy the software, or interfere with how it runs.</li>
        <li>Follow the law, including Department of Transportation rules.</li>
      </ul>
    ),
  },
  {
    id: "quickbooks",
    title: "QuickBooks Online connection",
    body: (
      <>
        <p>
          An MS Express administrator may connect MS Express&apos;s own QuickBooks Online company. Connecting lets the TMS
          read customer, vendor, product and service, account, and payment-term lists, and create or update invoices and
          bills in that company. An administrator can disconnect at any time from Settings → QuickBooks.
        </p>
        <p>
          MS Express staff remain responsible for reviewing the accounting entries the TMS creates. QuickBooks and Intuit
          are trademarks of Intuit Inc. The TMS is not made, endorsed, or supported by Intuit.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Your data",
    body: (
      <p>
        MS Express owns the business data in the TMS. Our <Link href="/privacy">Privacy Policy</Link> explains how we
        handle it.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep the TMS running, but it is provided &quot;as is&quot; and may sometimes be unavailable. We may
        change, pause, or retire features.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on liability",
    body: (
      <p>
        To the extent the law allows, MS Express is not liable for indirect or consequential losses from using the TMS,
        and makes no warranties beyond those these terms state.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the State of Nebraska. Any dispute will be handled in the state or federal
        courts located in Nebraska.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <LegalContact />,
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      current="terms"
      title="Terms of Use"
      updated="Draft prepared October 7, 2026. Not yet in effect."
      summary="These are the end-user terms (EULA) for the MS Express TMS, including its QuickBooks Online connection."
      sections={sections}
    />
  );
}
