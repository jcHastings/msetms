# Intuit production-key checklist

Checked October 7, 2026 for the MS Express TMS QuickBooks Online connection. Pages: `/privacy` and `/terms`. Both are public (no login). The draft banner is removed. Effective date on both pages: October 7, 2026.

Official Intuit doc pages at `developer.intuit.com` returned only the developer-portal shell (“Compiling and pre-filling your Intuit info...”) on this date, so their article body could not be quoted. Rows below cite the Intuit page URL anyway, plus the Intuit Developer Support answers and the published description of Intuit’s production questionnaire that did return text.

This app uses the QuickBooks Online Accounting API only (`com.intuit.quickbooks.accounting`). It does not use the Payments API or the Payroll API.

## Requirements

| Requirement | Source | Page and section | Status |
| --- | --- | --- | --- |
| Production settings ask for an end-user license agreement URL and a privacy policy URL. A published app needs a real URL whose page contains the EULA and a privacy policy for that app. A private app that will not be published may use a dummy URL. These pages are the real URLs. | https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | Privacy: https://msetms.mandsloads.com/privacy . EULA: https://msetms.mandsloads.com/terms | Covered |
| The production questionnaire’s App details step is “Add your app’s end-user license agreement and privacy policy.” | https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire | Same two URLs | Covered |
| App details also ask for host domain, launch URL, and disconnect URL. Host domain is the website or app domain. Launch URL is the initial URL for the authorization flow. Disconnect URL is a link to the process for deauthorizing access (a page on the site or an unlink endpoint). | https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire | Host: `msetms.mandsloads.com`. Launch: https://msetms.mandsloads.com/login . Connect (admin, after sign-in): https://msetms.mandsloads.com/api/integrations/quickbooks/connect . Disconnect URL to enter: https://msetms.mandsloads.com/privacy#disconnect | Enter these URLs in the Intuit form |
| The same host, launch, disconnect, EULA, and privacy fields are required in production setup even for an internal app. Intuit staff have said a private app may submit a placeholder such as `https://xyz.com/not_used`. This app submits the real pages instead. | https://help.developer.intuit.com/s/question/0D54R00009B4irTSAR/quickbooks-app-for-internal-use and https://help.developer.intuit.com/s/topic/0TOG00000004rJZOAY/disconnect-url and https://help.developer.intuit.com/s/topic/0TOG00000004rJaOAI/launch-url | `#disconnect` on the privacy page, plus the URLs in the row above | Covered |
| Privacy policy URL must be reachable with no login. | https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | `middleware.ts` excludes `/privacy` and `/terms` from the sign-in redirect | Covered |
| EULA URL must be reachable with no login. | Same source | Same middleware exclusion for `/terms` | Covered |
| What QuickBooks data is accessed, and why: customers, vendors, items, accounts, invoices, bills, and payment status as the code actually uses them. | Questionnaire “how your app interacts with Intuit product data,” described at https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire . Scope in code is accounting only. | Privacy `#quickbooks-data` | Covered |
| How that data is used: create and update invoices from TMS loads, create bills, and read invoice status back (balance versus total, which shows a payment already applied). The code creates bills and does not update them. The page says that. | Same questionnaire section | Privacy `#how-we-use-quickbooks` | Covered |
| Storage and security actually in place: AWS us-east-1, TLS in transit, OAuth refresh token stored on the server with restricted file permissions, role-based access, encrypted backups. The server disk is not encrypted today. The page says the disk move is planned and is not done. | Security questions on the same questionnaire (secrets not hardcoded; who can see Intuit data). Disk wording is limited to what is true in this app today. | Privacy `#storage-and-security` | Covered |
| No selling, renting, or sharing of QuickBooks data. No advertising use. | Same “who else sees Intuit data” question: https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire | Privacy `#no-sale` | Covered |
| Subprocessors and hosting. | Privacy policy must describe the app’s own handling; hosting location is an App details question on the same questionnaire (“Tell us where your app is hosted”). | Privacy `#subprocessors` | Covered |
| Retention: 10 years for business and financial records. Encrypted Cloudflare R2 backups are kept for up to 10 years, then deleted, on the same schedule as business records. Deletion requests are honored except where records must be retained by law. | JC, October 7, 2026. Stated on the privacy page for tax and DOT records and for the encrypted backups. Intuit’s rendered docs did not publish a required year count. | Privacy `#retention` | Done |
| Deletion on request. | Same. Contact path is the AR email on the page. | Privacy `#deletion` | Covered |
| How a user disconnects or revokes access: the TMS Disconnect button, which revokes the token at Intuit, and QuickBooks Apps / Connected apps. | Disconnect URL field, https://help.developer.intuit.com/s/topic/0TOG00000004rJZOAY/disconnect-url . Revoke call is `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` from `disconnectQuickbooks`. | Privacy `#disconnect` | Covered |
| What happens to data after disconnect. TMS business records stay. The token file is deleted when the TMS button is used. QuickBooks invoices and bills already created stay in QuickBooks. | Same disconnect-URL topic, plus the page text a reviewer reads at the Disconnect URL. | Privacy `#after-disconnect` | Covered |
| Contact: MS Express, Hastings, Nebraska, ar@msloads.com, 402-302-0097. | Required so the privacy policy and EULA name the app owner. https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | Privacy `#contact` and Terms `#contact` | Covered |
| Effective date October 7, 2026. | Page text. Intuit did not publish a required date format. | Privacy `#effective-date` and Terms `#effective-date` | Covered |
| Changes to the policy. | The privacy URL must contain the policy for this app: https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | Privacy `#changes` | Covered |
| Governing law (Nebraska) on the privacy policy. | Same | Privacy `#governing-law` | Covered |
| Children’s data: the TMS is not directed to children. | Same | Privacy `#children` | Covered |
| EULA parties: MS Express, USDOT 3062879, MC 056299. | The EULA URL must contain the agreement for this app: https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | Terms `#parties` | Covered |
| License grant. | Same | Terms `#license` | Covered |
| License restrictions. | Same | Terms `#license-restrictions` | Covered |
| Acceptable use. | Same | Terms `#acceptable-use` | Covered |
| User accounts and responsibilities. | Same | Terms `#accounts` | Covered |
| Third-party services. QuickBooks is Intuit’s service. The TMS is not affiliated with Intuit. Trademark attribution uses Intuit’s own mark notice: Intuit and QuickBooks are registered trademarks of Intuit Inc. | Intuit’s notice on https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy (“Intuit, QuickBooks, QB, TurboTax, Credit Karma, and Mailchimp are registered trademarks of Intuit Inc.”) | Terms `#third-party` | Covered |
| Disclaimer of warranties. | Same EULA URL requirement: https://help.developer.intuit.com/s/question/0D54R00008NAyCGSA1/end-user-licence-and-privacy-policy | Terms `#warranties` | Covered |
| Limitation of liability. | Same | Terms `#liability` | Covered |
| Indemnity. | Same | Terms `#indemnity` | Covered |
| Termination. | Same | Terms `#termination` | Covered |
| Governing law and venue in Nebraska. | Same | Terms `#law` | Covered |
| Canonical link on each page, a visible link to the other page, and links from the login footer. | So the URLs entered in Intuit are the public pages, and a signed-out user can open them from sign-in. | `alternates.canonical` on each page. Footer of `components/legal-document.tsx`. Login footer in `components/login-canvas.tsx`. | Covered |
| App Store / marketplace listing (name, description, screenshots, pricing, support contact). | JC, October 7, 2026: the app stays private to MS Express and will not be listed on the QuickBooks App Store. What a listing would have required: https://developer.intuit.com/app/developer/qbo/docs/go-live/publish-app/app-store-requirements and https://developer.intuit.com/app/developer/qbo/docs/go-live/list-on-the-app-store and https://developer.intuit.com/app/developer/qbo/docs/go-live/publish-app | Not a page. Production settings still get the real privacy and terms URLs, which Intuit asks for even on an internal app. | N/A, private app |
| Notifiable security breach. | JC, October 7, 2026: MS Express has never had a breach that required notifying customers or any agency. Questionnaire security section: https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire | Portal answer, not page text. | Done |
| Other security questionnaire items that are portal answers, not page text: whether client id and secret are hardcoded, multi-factor authentication, and captcha. | https://docs.codat.io/integrations/accounting/quickbooksonline/qbo-app-assessment-questionnaire (Security section) | Not stated on the privacy page, on purpose. The page does say who can see QuickBooks data (`#no-sale`, `#storage-and-security`). | Portal answers. Do not invent an MFA or captcha claim. |

## URLs to enter in Intuit

| Field | Value |
| --- | --- |
| Host domain | `msetms.mandsloads.com` |
| Privacy policy URL | https://msetms.mandsloads.com/privacy |
| EULA / terms URL | https://msetms.mandsloads.com/terms |
| Launch URL | https://msetms.mandsloads.com/login |
| Connect URL (authorization start, administrator session required) | https://msetms.mandsloads.com/api/integrations/quickbooks/connect |
| Disconnect URL | https://msetms.mandsloads.com/privacy#disconnect |

The in-app buttons that revoke the token are Settings → QuickBooks (`/settings/quickbooks`) and Accounting → QuickBooks (`/accounting/quickbooks`). Both require sign-in, so they are the product controls, not the public URL to paste into Intuit’s Disconnect URL field.

## Open questions

None. JC answered the remaining Intuit questions on October 7, 2026. The app stays private to MS Express and will not be listed on the QuickBooks App Store. MS Express has never had a breach that required notifying customers or any agency. Both answers are in the rows above.
