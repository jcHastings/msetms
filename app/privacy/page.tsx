import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LegalContact, LegalDocument, PRIVACY_URL, TERMS_URL, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MS Express handles data in the MS Express TMS, including QuickBooks Online data.",
  robots: { index: false, follow: false },
  alternates: { canonical: PRIVACY_URL },
};

const sections: LegalSection[] = [
  {
    id: "effective-date",
    title: "Effective date",
    body: (
      <p>
        This privacy policy is in effect on October 7, 2026. It covers the MS Express TMS at {LEGAL_ENTITY.site},
        including the QuickBooks Online connection.
      </p>
    ),
  },
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        {LEGAL_ENTITY.name} is a trucking company (motor carrier USDOT {LEGAL_ENTITY.usdot}, MC {LEGAL_ENTITY.mc}) in{" "}
        {LEGAL_ENTITY.cityState}. We run the MS Express TMS to dispatch our trucks, pay our drivers, and bill our
        customers. The TMS is for MS Express staff and drivers. It is an internal tool for our own QuickBooks company.
        It is not offered to other companies.
      </p>
    ),
  },
  {
    id: "quickbooks-data",
    title: "QuickBooks data we access",
    body: (
      <>
        <p>
          An MS Express administrator connects our own QuickBooks Online company with Intuit&apos;s sign-in. The
          connection uses the accounting scope only (<code>com.intuit.quickbooks.accounting</code>). The TMS does not
          use Intuit&apos;s Payments API or Payroll API. We never see or store the Intuit password.
        </p>
        <p>The TMS reads these QuickBooks records, and only these:</p>
        <ul>
          <li>
            <strong>Company name</strong>, so the settings screen can show which QuickBooks company is connected.
          </li>
          <li>
            <strong>Customers</strong>, so a TMS customer can be matched to a QuickBooks customer.
          </li>
          <li>
            <strong>Vendors</strong>, so a TMS vendor can be matched to a QuickBooks vendor.
          </li>
          <li>
            <strong>Products and services (items)</strong>, so a pay line can be matched to a QuickBooks item.
          </li>
          <li>
            <strong>Accounts</strong>, so a vendor bill can be posted to an expense account.
          </li>
          <li>
            <strong>Payment terms</strong>, so a customer&apos;s terms can be matched to a QuickBooks term.
          </li>
          <li>
            <strong>Invoices</strong>, including the invoice id, document number, total, and balance. Comparing the
            balance with the total tells us whether a payment has already been applied. The TMS does not download a
            separate payments list, and it does not create payments.
          </li>
        </ul>
        <p>The TMS writes these QuickBooks records:</p>
        <ul>
          <li>
            <strong>Invoices:</strong> create a customer invoice, and update an invoice the TMS already sent for that
            load.
          </li>
          <li>
            <strong>Bills:</strong> create a vendor bill. The TMS does not change a bill after it is created.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-quickbooks",
    title: "How we use QuickBooks data",
    body: (
      <>
        <p>We use QuickBooks data only to keep MS Express&apos;s own books in step with TMS loads:</p>
        <ul>
          <li>to create and update customer invoices from loads;</li>
          <li>to create vendor bills from TMS bills;</li>
          <li>
            to read an invoice back, confirm it was saved, and see whether a payment was already applied so we do not
            overwrite a paid invoice;
          </li>
          <li>to read the lists above so each TMS customer, item, vendor, account, and term points at the right QuickBooks record.</li>
        </ul>
        <p>We do not send QuickBooks data to an AI service.</p>
      </>
    ),
  },
  {
    id: "storage-and-security",
    title: "Storage and security",
    body: (
      <ul>
        <li>The TMS is hosted on Amazon Web Services in the us-east-1 region.</li>
        <li>Traffic to the TMS is encrypted with HTTPS (TLS).</li>
        <li>
          The web app is not exposed directly to the internet. Web traffic reaches it through an encrypted tunnel.
        </li>
        <li>Administrator server access uses SSH keys only. Password sign-in to the server is turned off.</li>
        <li>Office users have roles, so each person sees only what their job allows.</li>
        <li>
          The QuickBooks OAuth refresh token is stored on the server, not in a web browser, in a file that only the
          server administrator and the TMS service account can read.
        </li>
        <li>Off-site backups (Cloudflare R2) are encrypted.</li>
        <li>
          The server disk that holds the TMS database and the QuickBooks token file is not encrypted at rest today. A
          move to encrypted storage is planned and is not in place.
        </li>
      </ul>
    ),
  },
  {
    id: "no-sale",
    title: "We do not sell, rent, or share QuickBooks data",
    body: (
      <p>
        We do not sell, rent, or share QuickBooks data. We do not use it for advertising. We do not give it to data
        brokers. The only companies that process it are the hosting and backup providers named below, and only to run
        the TMS for MS Express. Only signed-in MS Express office staff with a role that allows it can see it in the TMS.
      </p>
    ),
  },
  {
    id: "subprocessors",
    title: "Subprocessors and hosting",
    body: (
      <>
        <p>These providers process information so the TMS can run. They do so for MS Express, not for their own marketing:</p>
        <ul>
          <li>
            <strong>Amazon Web Services (us-east-1)</strong> hosts the TMS, including the database and the QuickBooks
            token file.
          </li>
          <li>
            <strong>Cloudflare</strong> provides encryption in transit and the public front of the site.
          </li>
          <li>
            <strong>Cloudflare R2</strong> stores encrypted off-site backups.
          </li>
          <li>
            <strong>Email and text providers</strong> deliver load and invoice notices. They do not receive the
            QuickBooks token.
          </li>
          <li>
            <strong>Fleet tracking and mapping services</strong> receive vehicle and address details for dispatch. They
            do not receive QuickBooks data.
          </li>
          <li>
            <strong>An AI assistant</strong> used by office staff can receive load and dispatch details to answer staff
            questions. It does not receive QuickBooks data.
          </li>
        </ul>
        <p>We may also disclose information when the law requires it, for example a valid subpoena or a DOT audit.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep load, billing, and driver records for 10 years to run the business and to meet tax and Department of
        Transportation record-keeping rules. The QuickBooks refresh token is deleted when an administrator disconnects
        in the TMS. Encrypted backups are kept for up to 10 years, then deleted, on the same schedule as business records. Deletion requests are honored except where records must be retained by law.
      </p>
    ),
  },
  {
    id: "deletion",
    title: "Deletion on request",
    body: (
      <p>
        Email {LEGAL_ENTITY.email} and say what you want deleted. We delete information we are not required to keep.
        Records we must keep for the 10-year tax or Department of Transportation period stay until that period ends. A
        deletion request does not disconnect QuickBooks by itself. Use the disconnect steps below for that.
      </p>
    ),
  },
  {
    id: "disconnect",
    title: "How to disconnect or revoke access",
    body: (
      <>
        <p>An MS Express administrator can disconnect inside the TMS in either place:</p>
        <ul>
          <li>
            <strong>Settings → QuickBooks</strong>, the button labeled Disconnect; or
          </li>
          <li>
            <strong>Accounting → QuickBooks</strong>, the button labeled Disconnect From QuickBooks.
          </li>
        </ul>
        <p>
          That button asks Intuit to revoke the refresh token, then deletes the token file on our server. The file is
          deleted even if Intuit cannot be reached.
        </p>
        <p>
          You can also revoke access from QuickBooks Online. Open the Apps page (Connected apps), find this connection,
          and disconnect it. That tells Intuit to stop honoring the token. Disconnecting only inside QuickBooks does
          not delete the token file on our server. An administrator should also use the TMS Disconnect button so that
          file is removed.
        </p>
        <p>
          To connect again, an administrator signs in at <a href={`${LEGAL_ENTITY.site}/login`}>{LEGAL_ENTITY.site}/login</a>,
          opens Settings → QuickBooks, and chooses Connect QuickBooks. The connect address is{" "}
          <a href={`${LEGAL_ENTITY.site}/api/integrations/quickbooks/connect`}>
            {LEGAL_ENTITY.site}/api/integrations/quickbooks/connect
          </a>
          . It starts Intuit&apos;s sign-in only for a signed-in administrator.
        </p>
      </>
    ),
  },
  {
    id: "after-disconnect",
    title: "What happens to data after disconnect",
    body: (
      <ul>
        <li>The TMS cannot call QuickBooks until an administrator connects again.</li>
        <li>
          Loads, invoices, bills, customers, drivers, and the saved QuickBooks ids used for mapping stay in the TMS.
          They are MS Express business records and follow the 10-year period above.
        </li>
        <li>
          Invoices and bills already created in QuickBooks stay in QuickBooks. Disconnect does not delete them there.
        </li>
        <li>The refresh token file on our server is deleted when the TMS Disconnect button is used.</li>
      </ul>
    ),
  },
  {
    id: "children",
    title: "Children's data",
    body: (
      <p>The TMS is not directed to children under 13. We do not knowingly collect information from children.</p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>If we change this policy, we will post the new version on this page and change the effective date.</p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    body: <p>This policy is governed by the laws of the State of Nebraska.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <LegalContact />
        <p>
          Terms of Use: <Link href="/terms">{TERMS_URL}</Link>
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
      updated="Effective October 7, 2026."
      summary="This policy explains what information the MS Express TMS holds, how we use QuickBooks Online data, and how we protect it."
      sections={sections}
    />
  );
}
