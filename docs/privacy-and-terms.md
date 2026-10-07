# Privacy Policy and Terms of Use

Public URLs: https://msetms.mandsloads.com/privacy and https://msetms.mandsloads.com/terms

The wording below matches `app/privacy/page.tsx` and `app/terms/page.tsx` as of this change. Effective date: October 7, 2026.

## Privacy Policy

This policy explains what information the MS Express TMS holds, how we use QuickBooks Online data, and how we protect it.

Effective October 7, 2026.

### Effective date

This privacy policy is in effect on October 7, 2026. It covers the MS Express TMS at https://msetms.mandsloads.com, including the QuickBooks Online connection.

### Who we are

MS Express is a trucking company (motor carrier USDOT 3062879, MC 056299) in Hastings, Nebraska. We run the MS Express TMS to dispatch our trucks, pay our drivers, and bill our customers. The TMS is for MS Express staff and drivers. It is an internal tool for our own QuickBooks company. It is not offered to other companies.

### QuickBooks data we access

An MS Express administrator connects our own QuickBooks Online company with Intuit's sign-in. The connection uses the accounting scope only (`com.intuit.quickbooks.accounting`). The TMS does not use Intuit's Payments API or Payroll API. We never see or store the Intuit password.

The TMS reads these QuickBooks records, and only these:

- Company name, so the settings screen can show which QuickBooks company is connected.
- Customers, so a TMS customer can be matched to a QuickBooks customer.
- Vendors, so a TMS vendor can be matched to a QuickBooks vendor.
- Products and services (items), so a pay line can be matched to a QuickBooks item.
- Accounts, so a vendor bill can be posted to an expense account.
- Payment terms, so a customer's terms can be matched to a QuickBooks term.
- Invoices, including the invoice id, document number, total, and balance. Comparing the balance with the total tells us whether a payment has already been applied. The TMS does not download a separate payments list, and it does not create payments.

The TMS writes these QuickBooks records:

- Invoices: create a customer invoice, and update an invoice the TMS already sent for that load.
- Bills: create a vendor bill. The TMS does not change a bill after it is created.

### How we use QuickBooks data

We use QuickBooks data only to keep MS Express's own books in step with TMS loads:

- to create and update customer invoices from loads;
- to create vendor bills from TMS bills;
- to read an invoice back, confirm it was saved, and see whether a payment was already applied so we do not overwrite a paid invoice;
- to read the lists above so each TMS customer, item, vendor, account, and term points at the right QuickBooks record.

We do not send QuickBooks data to an AI service.

### Storage and security

- The TMS is hosted on Amazon Web Services in the us-east-1 region.
- Traffic to the TMS is encrypted with HTTPS (TLS).
- The web app is not exposed directly to the internet. Web traffic reaches it through an encrypted tunnel.
- Administrator server access uses SSH keys only. Password sign-in to the server is turned off.
- Office users have roles, so each person sees only what their job allows.
- The QuickBooks OAuth refresh token is stored on the server, not in a web browser, in a file that only the server administrator and the TMS service account can read.
- Off-site backups (Cloudflare R2) are encrypted.
- The server disk that holds the TMS database and the QuickBooks token file is not encrypted at rest today. A move to encrypted storage is planned and is not in place.

### We do not sell, rent, or share QuickBooks data

We do not sell, rent, or share QuickBooks data. We do not use it for advertising. We do not give it to data brokers. The only companies that process it are the hosting and backup providers named below, and only to run the TMS for MS Express. Only signed-in MS Express office staff with a role that allows it can see it in the TMS.

### Subprocessors and hosting

These providers process information so the TMS can run. They do so for MS Express, not for their own marketing:

- Amazon Web Services (us-east-1) hosts the TMS, including the database and the QuickBooks token file.
- Cloudflare provides encryption in transit and the public front of the site.
- Cloudflare R2 stores encrypted off-site backups.
- Email and text providers deliver load and invoice notices. They do not receive the QuickBooks token.
- Fleet tracking and mapping services receive vehicle and address details for dispatch. They do not receive QuickBooks data.
- An AI assistant used by office staff can receive load and dispatch details to answer staff questions. It does not receive QuickBooks data.

We may also disclose information when the law requires it, for example a valid subpoena or a DOT audit.

### How long we keep information

We keep load, billing, and driver records for 10 years to run the business and to meet tax and Department of Transportation record-keeping rules. The QuickBooks refresh token is deleted when an administrator disconnects in the TMS. Encrypted backups are kept for up to 10 years, then deleted, on the same schedule as business records. Deletion requests are honored except where records must be retained by law.

### Deletion on request

Email ar@msloads.com and say what you want deleted. We delete information we are not required to keep. Records we must keep for the 10-year tax or Department of Transportation period stay until that period ends. A deletion request does not disconnect QuickBooks by itself. Use the disconnect steps below for that.

### How to disconnect or revoke access

An MS Express administrator can disconnect inside the TMS in either place:

- Settings → QuickBooks, the button labeled Disconnect; or
- Accounting → QuickBooks, the button labeled Disconnect From QuickBooks.

That button asks Intuit to revoke the refresh token, then deletes the token file on our server. The file is deleted even if Intuit cannot be reached.

You can also revoke access from QuickBooks Online. Open the Apps page (Connected apps), find this connection, and disconnect it. That tells Intuit to stop honoring the token. Disconnecting only inside QuickBooks does not delete the token file on our server. An administrator should also use the TMS Disconnect button so that file is removed.

To connect again, an administrator signs in at https://msetms.mandsloads.com/login, opens Settings → QuickBooks, and chooses Connect QuickBooks. The connect address is https://msetms.mandsloads.com/api/integrations/quickbooks/connect. It starts Intuit's sign-in only for a signed-in administrator.

### What happens to data after disconnect

- The TMS cannot call QuickBooks until an administrator connects again.
- Loads, invoices, bills, customers, drivers, and the saved QuickBooks ids used for mapping stay in the TMS. They are MS Express business records and follow the 10-year period above.
- Invoices and bills already created in QuickBooks stay in QuickBooks. Disconnect does not delete them there.
- The refresh token file on our server is deleted when the TMS Disconnect button is used.

### Children's data

The TMS is not directed to children under 13. We do not knowingly collect information from children.

### Changes to this policy

If we change this policy, we will post the new version on this page and change the effective date.

### Governing law

This policy is governed by the laws of the State of Nebraska.

### Contact

MS Express
Hastings, Nebraska
Phone: 402-302-0097
Email: ar@msloads.com

Terms of Use: https://msetms.mandsloads.com/terms

## Terms of Use

These are the end-user terms (EULA) for the MS Express TMS, including its QuickBooks Online connection.

Effective October 7, 2026.

### Effective date

These terms are in effect on October 7, 2026. They are the end-user license agreement (EULA) for the MS Express TMS at https://msetms.mandsloads.com.

### Parties

These terms are between MS Express, a motor carrier (USDOT 3062879, MC 056299) in Hastings, Nebraska, and the person who is given a TMS account. By signing in, you agree to these terms.

### License grant

MS Express grants you a limited, non-exclusive, non-transferable license to use the TMS for MS Express business while your account is active.

### License restrictions

You may not copy the TMS, sell it, sublicense it, rent it, or try to reverse engineer it. You may not use it for any business other than MS Express.

### Acceptable use

- Use the TMS only for MS Express business.
- Do not try to reach data or features your role does not allow.
- Do not upload malware or interfere with how the TMS runs.
- Follow the law, including Department of Transportation rules.

### User accounts and responsibilities

- The TMS is for MS Express employees, drivers, and contractors who have an account issued by MS Express. It is not offered to the public.
- Keep your password and sign-in codes private. Do not share your account.
- You are responsible for what is done with your account.
- Tell the office right away if you think someone else has used your account.
- MS Express can change or remove an account at any time.

### Third-party services

An MS Express administrator may connect MS Express's own QuickBooks Online company. QuickBooks Online is a service of Intuit Inc. Intuit and QuickBooks are registered trademarks of Intuit Inc. MS Express and the TMS are not affiliated with, endorsed by, or sponsored by Intuit Inc.

Connecting lets the TMS read and write the QuickBooks data described in the Privacy Policy. MS Express staff remain responsible for reviewing the accounting entries the TMS creates. Intuit's own terms apply to the QuickBooks company.

### Disclaimer of warranties

The TMS is provided "as is" and "as available." To the extent the law allows, MS Express disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the TMS will be uninterrupted or error-free, or that an invoice or bill sent to QuickBooks is free of mistakes. Review those entries before you rely on them.

### Limitation of liability

To the extent the law allows, MS Express is not liable for indirect, incidental, special, or consequential losses from using the TMS or the QuickBooks connection, including lost profits or lost data. This limit applies even if we have been told those losses were possible.

### Indemnity

To the extent the law allows, you will defend and cover MS Express against claims, losses, and reasonable costs that come from your misuse of the TMS, your breach of these terms, or your violation of the law while using the TMS.

### Termination

MS Express can suspend or close your account at any time. You can stop using the TMS at any time. An administrator can disconnect QuickBooks as the Privacy Policy describes. The sections on your data, warranties, liability, indemnity, and governing law still apply after access ends.

### Your data

MS Express owns the business data in the TMS. The Privacy Policy explains how we handle it, including QuickBooks data, retention, deletion, and disconnect.

### Governing law and venue

These terms are governed by the laws of the State of Nebraska. Any dispute will be handled in the state or federal courts located in Nebraska.

### Contact

MS Express
Hastings, Nebraska
Phone: 402-302-0097
Email: ar@msloads.com

Privacy Policy: https://msetms.mandsloads.com/privacy
