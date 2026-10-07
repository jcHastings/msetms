# Gusto paystubs

Branch `cursor/gusto-paystubs-c1fe` off `baaeee20` (draft PR #117, `cursor/live-qa-leftovers-7a2e`). Draft only. No live Gusto call. No credentials in the repo.

## Paystub PDF needs Embedded approval

**A paystub PDF is not available on an App Integration.** Gusto’s comparison table marks “Retrieve a Paystub/Tax Form (PDF)” as unavailable for App Integrations and available for Gusto Embedded.

https://docs.gusto.com/app-integrations/docs/app-integrations-vs-embedded-payroll

The PDF call itself is published only under Embedded, scope `pay_stubs:read`, and the OpenAPI marks the operation `embedded`:

`GET https://api.gusto-demo.com/v1/payrolls/{payroll_id}/employees/{employee_id}/pay_stub`

https://docs.gusto.com/embedded-payroll/reference/get-v1-payrolls-payroll_uuid-employees-employee_uuid-pay_stub

The response is `application/pdf`. A list of paystub links is the same restriction: https://docs.gusto.com/embedded-payroll/reference/get-v1-employees-employee_uuid-pay_stubs

This build still proxies that GET through the server. Until Embedded access is approved, Download returns an empty result and the office card says so. Weekly gross and net do not need that PDF. They come from processed payrolls, which App Integrations can retrieve.

## Integration type

msetms should use an **App Integration with company-admin OAuth**, not Embedded. MS Express already runs payroll in Gusto. This screen only reads it. Embedded means the product runs payroll itself and the employee never uses Gusto’s app. https://docs.gusto.com/app-integrations/docs/app-integrations-vs-embedded-payroll

**Partner approval, review, and production access are required. A fee is not published.**

- The API is restricted to App Integration and Embedded partners. A Gusto customer connecting their own company systems directly is listed as **not currently supported**. Gusto points that case at the Gusto CLI or Gusto MCP. https://docs.gusto.com/app-integrations/docs/introduction
- Production keys require an approved **Production Pre-Approval and Security Review**. Gusto says this is not a formality and not every application is approved. Apply from the introduction page (“Apply for Production Pre-Approval”) and from the comparison page (“To apply for an App Integration”).
- After pre-approval, demo keys come from an app in the Developer Portal (https://dev.gusto.com) once a redirect URI is set. QA uses the Partner Checklist, sent to developer@gusto.com. Production keys are issued after that review.
- Scopes are assigned during review, tested in demo, and enforced in production. Extra scopes go through developer@gusto.com. https://docs.gusto.com/app-integrations/docs/scopes
- No App Integration fee is stated on those pages. Embedded is a separate partnership application on the same comparison page. Any Embedded commercial fee is not published there.

## OAuth, refresh, and hosts

https://docs.gusto.com/app-integrations/docs/oauth2

https://docs.gusto.com/app-integrations/docs/authentication

- Authorize: `GET {base}/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, and `state`. The code expires in 10 minutes. Only a primary admin or a full-access admin can approve. Since API version `v2023-05-01`, one token is one company.
- Exchange: `POST {base}/oauth/token` JSON, `grant_type=authorization_code`, plus `client_id`, `client_secret`, `redirect_uri`, and `code`. Response: `access_token`, `token_type` bearer, `expires_in` 7200, `refresh_token`.
- Refresh: same URL, `grant_type=refresh_token`. The refresh token works once. The previous refresh token is revoked when the new access token is first used.
- Demo base: `https://api.gusto-demo.com`. Production base: `https://api.gusto.com`.
- Changing a **production** redirect URI is an email to developer@gusto.com. Demo redirects can be edited in the Developer Portal.

This app also sends `scope` on the authorize URL (read-only names below). Gusto’s sample authorize link does not include `scope`; scopes are assigned at review. If their portal rejects the parameter, drop it. That is an open question below.

## Read-only scopes

Requested, and nothing else:

- `companies:read`
- `employees:read`
- `payrolls:read`
- `contractors:read`
- `pay_stubs:read` (the PDF scope; unused until Embedded approval)

`employees:read` does not include compensation rates. Those need `compensations:read`, which this app does not request. Scope names are `resource:action`. https://docs.gusto.com/app-integrations/docs/scopes

There is no code path that creates, updates, prepares, submits, or cancels a payroll. The HTTP client allows GET on the read paths below, and POST only to `/oauth/token`.

## Endpoints

Demo host `https://api.gusto-demo.com`. Header `X-Gusto-API-Version` defaults to `2026-06-15` (`GUSTO_API_VERSION`).

| Need | Method and path | Scope | Docs |
| --- | --- | --- | --- |
| Who authorized | `GET /v1/token_info` | token | https://docs.gusto.com/app-integrations/docs/authentication |
| Company name | `GET /v1/companies/{company_id}` | `companies:read` | https://docs.gusto.com/app-integrations/reference/get-v1-companies |
| Employees | `GET /v1/companies/{company_id}/employees` | `employees:read` | https://docs.gusto.com/app-integrations/reference/get-v1-employees |
| Contractors | `GET /v1/companies/{company_uuid}/contractors` | `contractors:read` | https://docs.gusto.com/app-integrations/reference/get-v1-companies-company_id-contractors |
| Processed payrolls | `GET /v1/companies/{company_id}/payrolls` | `payrolls:read` | https://docs.gusto.com/app-integrations/reference/get-v1-companies-company_id-payrolls |
| Gross and net on a payroll | `GET /v1/companies/{company_id}/payrolls/{payroll_id}` | `payrolls:read` | https://docs.gusto.com/app-integrations/reference/get-v1-companies-company_id-payrolls-payroll_id |
| Contractor payments (read) | `GET /v1/companies/{company_id}/contractor_payments` | `payrolls:read` | https://docs.gusto.com/app-integrations/reference/get-v1-companies-company_id-contractor_payments |
| Paystub PDF | `GET /v1/payrolls/{payroll_id}/employees/{employee_id}/pay_stub` | `pay_stubs:read` | Embedded only. Link at the top of this file. |

The payroll list defaults to processed regular payrolls. This sync asks for `processing_statuses=processed` and `payroll_types=regular,off_cycle`, about 18 months back. The single-payroll payload carries `employee_compensations[].gross_pay` and `net_pay` as decimal strings, plus `check_date` and `pay_period.start_date` / `end_date`. Gusto’s sample amounts are gross `2791.25` and net `1953.31`. Net is present on processed payrolls.

Contractor payments are a read on the App Integrations reference. Creating a contractor payment (“Pay a Contractor”) is Embedded-only, and this app never does that. A payment has `wage_total`, `date`, and `status` (`Funded` or `Unfunded`). There is no `net_pay`. This app stores `wage_total` as both gross and net, leaves reimbursement out, and skips `Unfunded`.

## What changed

- `lib/integrations/gusto-read.ts` — scopes, allowed paths, parsers, email-then-name match.
- `lib/integrations/gusto.ts` — OAuth, refresh, sync, mapping, public status, PDF stream. Tokens stay in `gusto_connection`. Public status and driver JSON omit them. Errors redact token and secret fields.
- `lib/gusto-actions.ts` — sync, disconnect, link, unlink. Each starts with `requireSettingsEditor()`.
- `app/api/integrations/gusto/connect/route.ts` and `callback/route.ts` — admin OAuth. State is checked with `timingSafeEqual` before any token POST.
- `app/api/driver/paystubs/route.ts` and `app/api/driver/paystubs/[id]/pdf/route.ts` — the signed-in driver only. Another driver’s row is 403. A missing row, or a contractor payment (no PDF), is 404.
- `app/settings/gusto/page.tsx` and `app/settings/gusto/mapping/page.tsx` — office card and mapping.
- `app/driver/paystubs/page.tsx` and a Paystubs tile on `app/driver/page.tsx`.
- `lib/db.ts` — additive tables `gusto_connection`, `gusto_people`, `gusto_driver_links`, `gusto_pay_lines`. Unique on driver, source, and Gusto id.
- `lib/env.ts` and `.env.example` — `GUSTO_CLIENT_ID`, `GUSTO_CLIENT_SECRET`, `GUSTO_ENV` (`demo` unless the value is exactly `production`), `GUSTO_REDIRECT_URI` (default `https://msetms.mandsloads.com/api/integrations/gusto/callback`).
- Settings nav, layout, and the viewer route list so a viewer can open Gusto read-only. `scripts/gusto-test.ts` and the viewer write-route list.

The repo stores QuickBooks tokens in a private file, not with app-level encryption. Gusto follows the database, in `gusto_connection`, and never returns those columns to the browser. Disconnect deletes the token row and keeps people, links, and pay lines.

No SMS, email, or push is sent to drivers.

## How it works

Office admins (and managers, because `isAdminRole` includes manager) see Connect, the company name, last sync, Disconnect, and Sync now. Viewers see the same card with those actions disabled. The server still rejects the write. Employee mapping stays a link so a viewer can look, not edit.

Sync is manual. It pulls employees, then contractors, replaces the Gusto people list, and auto-matches only drivers who are not already linked: email, then name. An admin can override or unlink. A later sync does not replace an existing link. Unmatched people and unmatched drivers both stay on the mapping screen.

Pay lines are upserted. Running sync twice does not duplicate them. The PDF is streamed from Gusto through the server and is not stored.

Company drivers see Paystubs: latest net on top, then check date, pay period, gross, net, and Download PDF. A driver who is not mapped, or a company that is not connected, gets an empty state.

Owner-operators (`driver_type` owner operator, company name used when matching) do not get W-2 stubs. The screen says “Your pay is on the settlement statement.” Funded contractor payments, when the read API returns them, are listed with no PDF button. The settlement statement itself is the other draft.

## How it was verified

No live Gusto credentials. `npm test` (including `scripts/gusto-test.ts` and the viewer write walk) and `npm run build` passed on this branch before the screenshot pass. Tests use mocked JSON shaped like the documented payloads, including gross `2791.25` / net `1953.31` and contractor payment `04552eb9-7829-4b18-ae96-6983552948df` with `wage_total` `740.00`.

Covered:

- OAuth `state` must match or the token POST is never made.
- Access token, refresh token, and client secret are absent from the public status JSON.
- Auto-match by email, then name. Manual override sticks. Unmatched people stay unmatched.
- Sync twice keeps one row per payroll. A changed net updates that row.
- Gross, net, check date, and pay period map from the payroll payload. Contractor `wage_total` maps to both gross and net.
- Another driver’s list is 403. Another driver’s PDF is 403. A missing PDF is 404.
- Viewer sync, disconnect, link, and unlink throw the existing view-only error. Connect and callback are on the viewer write-route list.
- The client rejects any path outside the read list, and the test double rejects PUT, PATCH, DELETE, and any POST other than `/oauth/token`.

Screenshots used a copy of the attached SQLite snapshot (272 loads, 10 drivers, 7 users). The database and the zip are not in git. Office and driver cookies were minted locally. Connected screens used rows inserted in that copy, not a live Gusto response. The HTML for the connected office page did not contain the token sentinels.

On the viewer page, the DOM for Reconnect, Sync now, and Disconnect is `disabled`, `aria-disabled="true"`, background `#d5dee8`, opacity `0.55`, cursor `not-allowed`. Employee mapping stays a normal link.

## Screenshots

- `artifacts/driver-paystubs-populated.png` — company driver, latest net $1,412.55, two rows, Download PDF.
- `artifacts/driver-paystubs-empty.png` — driver with no Gusto link.
- `artifacts/driver-paystubs-not-connected.png` — same driver app when the office has not connected Gusto.
- `artifacts/driver-paystubs-owner-operator.png` — settlement note, contractor payment $2,200.00, no PDF.
- `artifacts/office-gusto-disconnected.png` — Not connected, Connect Gusto.
- `artifacts/office-gusto-connected.png` — connected company, last sync, Reconnect, Sync now, Disconnect.
- `artifacts/office-gusto-viewer.png` — same card for a viewer; the three write actions are disabled.
- `artifacts/office-gusto-mapping.png` — email and name matches, an unmatched Gusto employee, and unmatched drivers.

## What JC must do to go live

1. Read the own-company restriction before spending time on production. If Gusto will not approve an App Integration for MS Express’s own account, stop here. https://docs.gusto.com/app-integrations/docs/introduction
2. Create a Developer Portal account and an application at https://dev.gusto.com. Demo keys appear after the app exists.
3. Set the redirect URI to `https://msetms.mandsloads.com/api/integrations/gusto/callback`. No wildcard and no `#`. Production redirect changes later go to developer@gusto.com.
4. Put `GUSTO_CLIENT_ID` and `GUSTO_CLIENT_SECRET` in the office `.env`. Leave `GUSTO_ENV=demo` until production keys exist. Do not commit that file.
5. Apply for Production Pre-Approval and the Security Review from https://docs.gusto.com/app-integrations/docs/introduction. Approval is not guaranteed.
6. Have a Gusto primary admin or full-access admin approve the OAuth prompt for the MS Express company.
7. Ask Gusto, during review, for the read scopes listed above. `pay_stubs:read` and the PDF endpoint still need an Embedded partnership: https://docs.gusto.com/app-integrations/docs/app-integrations-vs-embedded-payroll
8. Complete the Partner Checklist and send it to developer@gusto.com. Production keys come after that QA.
9. Set `GUSTO_ENV=production` only after those keys are in the office `.env`.

No App Integration fee is documented. Ask Partnerships what an Embedded PDF partnership costs before promising Download to drivers.

## Open questions for JC

1. Gusto says a customer connecting their own company via the API is not currently supported, and Production Pre-Approval can be denied. Proceed with the App Integration application anyway?
2. Keep Download PDF visible, knowing it fails until Embedded approval, or hide it until that approval exists? The button is visible today, and the office card explains the gap.
3. Will Gusto’s authorize URL reject the `scope` query parameter? The sample link omits it. The constant is `GUSTO_READ_SCOPES` in `lib/integrations/gusto-read.ts`.
4. Contractor payments have `wage_total` and no net. Both columns store that wage, and reimbursement is left out. Is that the number owner-operators should see next to the settlement note?
5. Disconnect keeps historical pay lines. Should disconnect also clear them?
6. Managers can connect and sync, because they already count as admins. Should Gusto be limited to the admin role only?
7. Auto-match does not move a driver who is already linked. Confirm that a wrong automatic match must be fixed by hand.
8. Any driver flagged owner-operator, even with a blank company name, is treated as 1099 and does not see W-2 stubs.
9. Embedded fees are not on the docs pages. Confirm with Partnerships before applying.
