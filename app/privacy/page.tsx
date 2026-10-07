import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LegalContact, LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy (draft)",
  description: "How MS Express handles data in the MS Express TMS, including QuickBooks Online data.",
  robots: { index: false, follow: false },
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        {LEGAL_ENTITY.name} is a trucking company (motor carrier USDOT {LEGAL_ENTITY.usdot}, MC {LEGAL_ENTITY.mc}) based in{" "}
        {LEGAL_ENTITY.cityState}. We run the MS Express TMS at msetms.mandsloads.com to dispatch our trucks, pay our
        drivers, and bill our customers. The TMS is for MS Express staff and drivers. It is not sold or offered to the
        public.
      </p>
    ),
  },
  {
    id: "what-we-hold",
    title: "What information the TMS holds",
    body: (
      <ul>
        <li>
          <strong>Loads:</strong> shippers, receivers, addresses, pickup and delivery times, rates, reference numbers, and
          shipping documents such as rate confirmations, bills of lading, and proof of delivery.
        </li>
        <li>
          <strong>Drivers:</strong> name, phone, email, license and compliance documents, truck and trailer assignments,
          pay records, and truck location and safety data from our fleet tracking providers.
        </li>
        <li>
          <strong>Customers and vendors:</strong> business names, contacts, billing emails, and payment terms.
        </li>
        <li>
          <strong>Office users:</strong> name, email, role, and sign-in records. Passwords are stored only as secure
          hashes.
        </li>
        <li>
          <strong>QuickBooks Online data:</strong> when an MS Express administrator connects our own QuickBooks Online
          company through Intuit&apos;s sign-in, the TMS can read our customer, vendor, product and service, account, and
          payment-term lists, and create or update the invoices and bills it sends.
        </li>
      </ul>
    ),
  },
  {
    id: "quickbooks",
    title: "How QuickBooks data is used",
    body: (
      <>
        <p>We use QuickBooks Online data only to keep MS Express&apos;s own books in step with the TMS:</p>
        <ul>
          <li>to create and update customer invoices for delivered loads;</li>
          <li>to create bills for vendors and owner-operators;</li>
          <li>to read the lists needed to match each TMS customer, pay item, and vendor to the right QuickBooks record.</li>
        </ul>
        <p>
          We do not sell, rent, or share QuickBooks data. We do not use it for advertising. We do not send it to AI
          services. Only signed-in, authorized MS Express office staff can see it.
        </p>
        <p>
          The connection uses Intuit&apos;s OAuth 2.0 sign-in. We never see or store your Intuit password. The access
          token stays on our server and is never sent to a web browser. An administrator can disconnect at any time from
          Settings → QuickBooks in the TMS, which revokes the token with Intuit and deletes our stored copy. You can also
          disconnect the app from your QuickBooks account settings.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who else receives information",
    body: (
      <>
        <p>We share information only with the service providers that run the TMS for us, and only for that purpose:</p>
        <ul>
          <li>hosting (Amazon Web Services) and network security and encryption in transit (Cloudflare);</li>
          <li>encrypted off-site backups (Cloudflare R2);</li>
          <li>email and text message delivery for load and invoice notices;</li>
          <li>fleet tracking and mapping services, which receive vehicle and address details;</li>
          <li>
            an AI assistant used by office staff, which can receive load and dispatch details to answer staff questions.
            It does not receive QuickBooks data.
          </li>
        </ul>
        <p>We may also share information when the law requires it, for example a valid subpoena or a DOT audit.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep load, billing, and driver records for as long as we need them to run the business and to meet tax and
        Department of Transportation record-keeping rules: [retention period: JC to confirm]. QuickBooks tokens are
        deleted when the connection is removed. Backups roll off on a fixed schedule: [backup retention: JC to confirm].
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect information",
    body: (
      <ul>
        <li>All traffic to the TMS is encrypted with HTTPS (TLS).</li>
        <li>The web app is not exposed directly to the internet. It listens only on the server itself, and web traffic reaches it through an encrypted tunnel.</li>
        <li>Administrator server access uses SSH keys only. Password sign-in to the server is turned off.</li>
        <li>Office users have roles, so each person sees only what their job needs.</li>
        <li>Secrets and QuickBooks tokens are stored on the server in files that only the server administrator and the TMS service account can read.</li>
        <li>Backups are encrypted, and restores are tested on a schedule.</li>
      </ul>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: (
      <p>
        Drivers, customers, and vendors can ask us what information we hold about them and ask us to correct it. Contact
        us using the details below.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy, we will post the new version on this page with a new date.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <LegalContact />
        <p>
          See also our <Link href="/terms">Terms of Use</Link>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      current="privacy"
      title="Privacy Policy"
      updated="Draft prepared October 7, 2026. Not yet in effect."
      summary="This policy explains what information the MS Express TMS holds, how we use QuickBooks Online data, and how we protect it."
      sections={sections}
    />
  );
}
