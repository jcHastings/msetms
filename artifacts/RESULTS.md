# POD at delivery

Branch `cursor/pod-at-delivery-f27b`. Draft PR only. No Office Update and no live database changes.

**missing_pod applies to every load**, per JC (2026-10-07). msetms is MS Express only. M&S Loads is a bill-to customer, not a brokerage signal. There is no brokerage flag, column, or setting. On the snapshot, 264 billable loads have no POD file and no recorded driver reason, so all 264 stay on the alert. A POD file hides it. “Receiver kept the POD” and “Sent to the customer” clear it. “I’ll upload it later” and “Other” soften it to a low “POD later” alert.

## What changed

- `lib/pod-delivery-shared.ts`, `lib/pod-delivery.ts` — photo or reason on the load (`pod_outcome`, `pod_reason`, `pod_reason_note`, `pod_recorded_at`) and the missing-POD rule.
- `lib/invoice-ready.ts`, `components/invoice-ready-checklist.tsx` — advisory “Invoice ready?” checklist.
- `components/driver-load-actions.tsx`, `components/driver-upload.tsx`, `app/driver/loads/[id]/page.tsx` — Delivered opens the POD sheet (camera/upload, or a one-tap reason).
- `lib/driver-ops.ts`, `lib/driver-actions.ts`, `lib/driver-api.ts` — the same photo or reason is stored from the driver app and the driver API. Omitting it still allows Delivered, so an older app build does not get stuck.
- `lib/exceptions.ts`, `lib/load-timeline.ts` — the alert follows the rule above. The timeline title is “POD at delivery”.
- `lib/db.ts`, `lib/types.ts`, `lib/queries.ts` — additive columns. Existing rows keep working with empty defaults. `rate_con_amount` is stored when a rate-con inbox is applied (`lib/actions.ts`) so a later rate edit does not erase it.
- `components/tms-invoice-panel.tsx`, `components/email-invoice-button.tsx`, `components/send-to-accounting.tsx`, `components/load-editor.tsx`, `components/accounting-hub.tsx`, `components/invoices-acct-table.tsx`, `components/invoice-row-actions.tsx` — checklist on the invoice panel, in the send-to-accounting confirm, and in the email composer. Send stays enabled.
- `scripts/pod-delivery-test.ts`, `package.json` — focused tests in `npm test`.

## How it works

Tapping **Delivered** (delivery check out) opens a full-screen sheet. The driver takes or uploads the POD on the existing upload path, or picks a reason. Other asks for a short note. **Not yet** closes the sheet and does not mark the load delivered. Either a photo or a reason still records Delivered, and the choice is written on the load timeline.

The office checklist is pass or warn for POD (file or driver reason), a BOL file on the load, a lumper receipt when a lumper line exists, arrive and depart times when a detention line exists, and the invoice amount against the rate captured from the rate con. Copy on the checklist: “Advisory only. Send stays available.” No OCR. A viewer sees the checklist. Create invoice and Email invoice render disabled. Send to Accounting Management is not offered. The server still rejects the write.

## How verified

`npm test` passed, including `scripts/pod-delivery-test.ts` and the viewer write guard. `npm run build` passed.

Chrome, against the production build, on a copy of the snapshot database that is not in the repo. No invoice, email, or SMS was sent. Two-factor was off on that copy so sign-in did not email a code.

- Delivered opened the POD sheet. The four reasons were on it. Other required a note before save.
- Not yet left the load at delivery with no POD outcome.
- I’ll upload it later set the load to delivered, stored that reason, and wrote a “POD at delivery” audit row.
- Load 1006237 financials: all five checklist items Pass.
- Load 1006233: all five Check. The confirm dialog still had **Yes, Send Load #1006233 to Accounting** enabled. Cancel left the load on operations.
- QA Bot (viewer) on 1006237: checklist visible, Create invoice and Email invoice disabled, email composer did not open, no send-to-accounting button.

## Screenshots

- `artifacts/driver-delivered-pod-prompt.png` — Delivered sheet, camera/upload and reasons.
- `artifacts/driver-pod-reason-picker.png` — Other, with the note filled in.
- `artifacts/office-checklist-pass.png` — invoice checklist, all Pass.
- `artifacts/office-checklist-warn-send.png` — all Check, send still enabled.
- `artifacts/office-viewer-checklist.png` — same checklist, write actions disabled.

## Open questions

None. missing_pod applies to every load per JC (2026-10-07).

---

---

# Suggested trucks in Assign

Feature 3 (JC approved 2026-10-07). The Assign dialog lists the top 3 trucks for the load. A tap fills driver, truck, and trailer. The dispatcher still presses Assign. Nothing is assigned by itself, and nothing is learned from accept or reject.

Base tip: `baaeee20a28a1228ea0099a71b6745ab7ff713ab`.

## What changed

- `lib/assign-suggestions.ts` — ranking and the board builder. Weights and the Samsara budget live here.
- `lib/assign-suggestion-shared.ts` — the row shape the dialog can import without opening the database.
- `lib/stops.ts` — `listPickupStops()` reads the first pickup per load and does not run geofence arrival writes.
- `components/assign-dialog.tsx` — suggestion list, one-tap fill, view-only lock.
- `app/board/page.tsx` — ranks from the fleet snapshot the board already loaded. Viewers see Assign with selection locked.
- `app/globals.css` — suggestion buttons (44px, focus ring, selected and caution states).
- `scripts/assign-suggestions-test.ts` — ranking, missing data, budget, and source checks.
- `package.json` — that test runs first in `npm test`.

No migration. No new table. No message is sent.

## How a suggestion is ranked

Lower score is better. Trucks are sorted by tier, then score, then unit number. The dialog shows 3.

Tiers:

1. Free truck with a driver who can be assigned.
2. Shown lower: overlapping another load, no driver, or driver off duty. Still selectable when the truck itself is in service. The reason says why.
3. Out of service, in maintenance, or inactive. Left out of the top 3 when three better trucks exist. If the fleet is shorter than that, they fill the list with the button disabled.

Overlap is a time window on hold, assigned, or rolling loads, for the same truck or the same driver. A window that only touches (one ends when the next starts) is not an overlap, so back-to-back is allowed. `assertAssetFree` stays a no-op; trucks may sit on more than one load when the times do not overlap.

Score (mile-equivalents, `ASSIGN_SUGGESTION_WEIGHTS`):

- Empty miles: straight-line miles from the truck's current GPS to the pickup, via Mike's `rankTrucksToCoords` / `haversineMiles`. Unknown GPS scores as 250 miles. The reason still says "miles unknown".
- HOS: hours short of an 11-hour drive clock, times 15. Unknown HOS scores as 6 hours short of 11 for sort only. The reason says "HOS unknown". Clocks come from `hosForAssignedTruck`. Demo clocks are ignored.
- Reefer: 0 if a suitable reefer is hooked or is the driver's last trailer on this truck or unassigned; 40 if a loose reefer can be taken; 120 if the only reefer is on another truck; 180 if none. A dry load says "reefer not needed" and fills the driver's last assignable trailer when there is one. Need is `resolveReeferSpec` on the load's equipment, mode, setpoint, instructions, and temperature. The load's current truck or trailer type is not passed in, so a dry load on a reefer trailer does not look like a reefer load.
- Docs: 0 for "docs OK"; 60 for "docs expiring"; 220 for "expired docs", "failed test", or "docs blocked". Alerts are `collectAssignmentAlerts`. Hard blocks are `assignmentHardBlocks` with the workflow settings already in the app (expired-doc blocks default off).

Driver on the truck, in order: roster `assigned_driver_id`, then the live Samsara driver for that truck, then the driver on that truck's latest open load. Off-duty and inactive drivers are not filled into the form.

One line, pieces dropped when they do not apply:

`62 empty mi · 7h 40m drive left · reefer 5312 · docs OK`

Tap calls the same driver change the select uses (owner-operator percent, and that driver's truck and trailer), then sets the suggested truck and trailer so the suggestion wins. Assign and Assign & Dispatch are unchanged. The top row is not pre-selected.

## Missing data

The board does not start a second Samsara call. Suggestions use the fleet snapshot the board already waited for (badges). A cold helper, `loadAssignSuggestionFleet`, stops at `ASSIGN_SUGGESTION_BUDGET_MS` (1200, same as the fuel page engine-hour budget) and falls back to saved Samsara GPS. Demo GPS is ignored.

| Gap | Rank | Reason text |
| --- | --- | --- |
| No Samsara token | Saved Samsara GPS, else unknown miles | `no Samsara token`, and `HOS unknown` |
| Live call did not answer | Saved GPS | `live GPS timed out` |
| GPS older than company quiet hours (default 2) | Still used | `GPS 3h old` (or `GPS Nm old` under an hour) |
| No GPS point | 250-mile stand-in | `miles unknown`, and `no GPS` when a token is set and the call did not time out |
| Pickup city not on the map | Unknown miles | `pickup not on map` |
| No HOS clock | Sort as 6h | `HOS unknown` |

Opening the dialog does not wait on Samsara. The list is already on the page.

## Timings

Focused rank of the test fleet: **8ms** on `npm test` (asserted under 50ms). Two runs return the same rows; there is no accept/reject table.

Samsara budget: **1200ms**. The budget test hangs a promise for 80ms of a 1200ms cap and returns the fallback with `timedOut` in under 1000ms. A fast promise wins and is not marked timed out.

The board page for MSE-1071 rendered in about 4.4s on the first compile, then the dialog opened from data already on the page. Opening Assign did not start another Samsara call.

## How verified

- `scripts/assign-suggestions-test.ts`: order (miles, then HOS, reefer, docs), hard blocks, stale GPS, no token, demo HOS ignored, timeout phrase, out of service disabled, back-to-back not overlapping, off duty, dry load, pickup point, dialog and board source strings.
- `npm test` passed (assign suggestions, viewer role, smoke, driver API, Samsara, trailer custody, relay map, places).
- `npm run build` passed (TypeScript included). The cold fleet helper now returns `{ fleet, timedOut }` from the budget race.
- Office board only. The driver app does not use this dialog.
- Screenshot login used a copy of the snapshot outside the repo. Two-factor was turned off on that copy only, so sign-in did not send a code. `sent_mail` stayed at 11 rows.

## Screenshots

Taken on MSE-1071 (Dodge City, KS → Bronx, NY) from the snapshot. This environment has no Samsara token, so the suggestion lines are the missing-data case: saved GPS about 47 hours old, no live clock.

- `artifacts/assign-suggestions.png` — dispatcher Ana Garcia. Top 3: unit 32 Christopher Howell (161 empty mi), unit 27 Luis Fuentes (398), unit 26 Steve Eller (622). Each line includes `GPS 47h old · no Samsara token · HOS unknown`, a reefer, and `docs OK`. The form still shows the load's current driver until a suggestion is tapped.
- `artifacts/assign-suggestions-filled.png` — one tap on unit 32 fills driver Christopher Howell, truck 32, and reefer MS1522, and marks that row selected. Assign is still required.
- `artifacts/assign-suggestions-missing-data.png` — the same dialog. The reasons are the missing-data case (`GPS 47h old`, `no Samsara token`, `HOS unknown`) because live Samsara is not connected here.
- `artifacts/assign-suggestions-viewer.png` — QA Bot, viewer. Same three suggestions, with the view-only sentence. Driver, truck, trailer, owner-operator %, the suggestion buttons, Assign, and Assign & Dispatch are disabled. Close still works.

## Open questions for JC

- Empty miles in the reason are straight-line (Mike), not Google road miles. Road miles stay on the existing assign path (`refreshEmptyMilesAround`) so the dialog does not call Google or write the load. Change `ASSIGN_SUGGESTION_WEIGHTS` if the stand-in for unknown miles (250) or the HOS and reefer weights should move.
- Out-of-service trucks are omitted from the top 3 when three better trucks exist. Overlapping trucks are shown lower, not hidden, when they make the cut.
- GPS age uses the company setting `alert_gps_quiet_hours` (default 2), same threshold as the inbox quiet rule.
- Driver identity falls through to the open load because the snapshot rarely sets `drivers.truck_id`.
- Two drivers can share one `last_trailer_id`, so two rows can name the same reefer. The tap still fills that trailer; the dispatcher confirms.
- Accounting can still open an enabled Assign button (`canWrite` is true). The server still blocks accounting from assigning. This change only locks viewer and read-only, which is what the request asked for.

---

---

# Driver Got it

Branch `cursor/driver-got-it-ack-5b1a` off tip `baaeee20` (draft PR #117). Draft only. MS Express asset carrier. No texts, email, or WhatsApp.

## What changed

- `lib/dispatch-ack.ts` — fingerprint, Got it stamp, desk-flag rule.
- `lib/db.ts` — additive columns on `loads` (`dispatch_ack_at`, `dispatch_ack_by`, `dispatch_ack_driver_id`, `dispatch_ack_fingerprint`) and `company_profile` (`dispatch_ack_hours` default 12, `dispatch_ack_introduced_at` stamped once on first open).
- `lib/types.ts`, `lib/queries.ts` — load view fields.
- `lib/driver-actions.ts`, `components/driver-got-it.tsx`, `app/globals.css` — one-tap Got it form (56px tall, full width).
- `app/driver/page.tsx`, `app/driver/dispatch/page.tsx`, `app/driver/loads/[id]/page.tsx` — new-dispatch card and quiet acknowledged clock.
- `lib/exceptions.ts` — inbox kind `dispatch_ack` (Ack / Snooze 4h / Resolve). Label “No ack”.
- `lib/load-timeline.ts` — timeline title “Acknowledged dispatch”.
- `components/dispatch-ack-status.tsx`, `components/load-editor.tsx`, `app/board/page.tsx`, `components/workbench-load-card.tsx` — office status.
- `lib/settings.ts`, `lib/settings-actions.ts`, `app/settings/alerts/page.tsx` — hours before pickup, 1–168, default 12.
- `scripts/dispatch-ack-test.ts`, `package.json` — focused test, including the 272-load snapshot.

## How it works

A dispatch is the assigned driver, pickup start, origin text, and shipper location. Changing any of those asks for a new Got it. The old stamp and audit row stay.

The assigned driver taps **Got it**. That writes who and when, records a `dispatch_ack` audit row, and the button becomes “Acknowledged 6:45 AM” (America/New_York). One tap, no second confirm. A second tap does not add another audit row.

Office shows **Acknowledged** with the clock, or **Waiting for Got it**. Inside the window the load line adds “desk flag”. The same chip is on the board. A workbench card shows an Ack row when that card is already on the desk for another reason.

Desk raises **No driver ack** when all of these are true:

- a driver is assigned
- status is still before pickup (`hold`, `assigned`, `dispatched`, `at_pickup`, `loading`)
- the current fingerprint is not acknowledged
- pickup is still in the future
- pickup is strictly after `dispatch_ack_introduced_at` (stamped the first time this build opens the database)
- hours until pickup are at or under the setting (default 12)

Severity is HIGH at 2 hours or less, otherwise MEDIUM. The detail says desk flag only. Nothing is sent.

Picked up, in transit, delivered, completed, accounting, and cancelled loads are not flagged. Unassigned loads are not flagged. Pickups already in the past, including every historical row on the snapshot, are not flagged.

Viewers see the status and the desk item. Desk buttons render disabled. They cannot open Settings. `driverAcknowledgeDispatchAction` requires a driver session. Saving alerts still requires a settings editor.

## How it was verified

`npm test` passed. The ack script prints: `snapshot dispatch_ack flags: 0; historical flagged: 0 of 272 loads`. Viewer guard: 160 office actions and 7 API writes blocked; 8 driver actions stay on driver auth. Smoke passed.

`npm run build` passed.

Browser check on a copy of the snapshot (not committed). Two future dispatches were added for the shots only: ACK-GOT and ACK-FLAG, both assigned to a driver who had no open pre-pickup load. ACK-GOT was tapped. ACK-FLAG stayed open and is the desk item.

## Screenshots

- `driver-new-dispatch.png` — driver home, new dispatch, Got it
- `driver-load-got-it.png` — load page, Got it
- `driver-acknowledged.png` — quiet “Acknowledged” clock
- `office-load-ack.png` — load waiting, desk-flag note, no message sent
- `desk-no-ack.png` — desk item, Ack / Snooze 4h / Resolve
- `board-ack-row.png` — board chip “Waiting for Got it · desk flag”
- `setting-ack-hours.png` — hours before pickup, default 12
- `viewer-load-ack.png` — viewer sees the status, no Got it
- `viewer-desk-no-ack.png` — viewer desk buttons disabled

## Open questions for JC

- Only the primary assigned driver gets Got it. A relay driver on the same load does not.
- A load that is still `dispatched` after its pickup time shows Waiting on the board. It is not flagged. Snapshot load 1006238 is in that state.
- Changing pickup end only, or a street that does not change origin or the shipper location, does not ask for a new Got it.
- The window is 1–168 hours. Default is 12. HIGH starts at 2 hours.
- No-ack lives on the desk inbox. It is not an out-of-tolerance workbench card, so a load with only this flag does not appear on the workbench. The Ack row shows when a card is already there.
- Viewers never reach the Settings page (existing gate). They see ack status and cannot ack or save the hours.

---

---

# Weekly settlements and driver reimbursements

Branch `cursor/weekly-settlements-563a` off `baaeee2` (draft PR #117). This stays one draft PR, stacked on that tip. Approved receipts are lines on the weekly statement, so a second PR would split the net-pay math. Draft only. Nothing here was merged, and no Office Update was installed.

`npm test` and `npm run build` passed. Screenshots are from a copy of the live-shaped snapshot (not committed). Two-factor sign-in was turned off on that copy only. No email, SMS, or push was sent.

## What changed

Office accounting gained a week list, a per-driver statement, deduction items, and a reimbursement review queue. The driver app gained My pay this week, Submit reimbursement, and My reimbursements. Company contact can store USDOT and MC. New tables and columns are additive: `deduction_templates`, `settlement_one_offs`, `settlement_statements`, `driver_reimbursements`, plus `company_profile.usdot` and `company_profile.mc_number`.

Main files: `lib/settlement-statement.ts`, `lib/settlement-statement-pdf.ts`, `lib/settlement-actions.ts`, `lib/reimbursements.ts`, `lib/reimbursement-shared.ts`, `lib/pay-week.ts`, `lib/db.ts`, `app/accounting/settlements`, `app/accounting/deductions`, `app/accounting/reimbursements`, `app/driver/pay`, `app/driver/reimbursements`, `app/api/reimbursements/[id]/receipt`, and the settlement PDF routes.

## How a statement is built

Week is Monday–Sunday, the same bounds as Driver Pay. The statement number is `SS-{YYYYMMDD}-{driver id}` from the week start. Opening a statement does not insert a row. A paid stamp is the only statement record, and it is written only from Mark statement paid.

1. Header. Carrier name and address from the company profile, as stored. USDOT and MC, or “Not on file”. Statement number, week dates, and the paid-record date or “Not marked paid”.
2. Who. Driver name, Company driver or Owner-operator, and the owner-operator company name when there is one.
3. Loads. Load number, pickup → delivery, dates, miles when stored, linehaul or an em dash, and the basis. Owner-operators also get an OO % column. Cancelled loads are left out. A company driver’s customer rate is not the linehaul. Owner-operator linehaul is stored OO pay, or rate times percent when OO pay is empty. A flat-rate driver expense replaces that linehaul and is not added again.
4. Extra pay. Other driver-billed pay items (detention, layover, and the rest as stored), as positive amounts.
5. Reimbursements. Own section. Category, load, Approved or Paid, receipt link, and amount. The note on the page says these are added to net and are not a deduction. Submitted and rejected rows are not on the statement.
6. Deductions. Template lines (fixed, or the amount times the load-line count) and one-time lines for this statement. Inactive templates, including the three seeded examples, do not apply.
7. Totals. Gross, Reimbursements, Total deductions, Net. Net is gross plus reimbursements minus deductions.
8. Footnote. Tax is not calculated. The page does not move money or send a copy to the driver.

Print hides the desk chrome. Save as PDF is the pdfkit file with the same sections. Mark statement paid records a date and flips that week’s approved reimbursements to Paid. It does not call Close period, and it does not send money. A second click keeps the original paid date.

## Reimbursements

The driver form requires a receipt photo (or PDF), a positive amount with at most two decimals (up to $100,000), and one category: lumper, washout, scale, parts, tolls, other. Load is optional and limited to that driver’s own loads. Note is optional. The receipt is stored with the same upload helpers as other owned files. If a load is linked, a copy is also attached to that load. The receipt route checks the reimbursement’s driver before it reads the file. Another driver, even one assigned to the same load, gets 403.

Office review lists pending first, with the receipt, driver, amount, category, load, and note. Approve places the row on the submit week, or the next week that is not already marked paid. Reject requires a reason of at least 3 characters. A viewer sees the queue with Approve and Reject disabled, and `requireWriteRole` still rejects the action.

The driver list shows Submitted, Approved, Rejected (with the reason), and Paid, plus the paid date and the settlement week. Status stays in the app. Nothing is texted or emailed.

## How it was verified

`scripts/settlement-statement-test.ts` covers week bounds, owner-operator linehaul, extra detention, inactive examples, fixed and per-load deductions, a one-off, company-driver customer rate left off the statement, cancelled loads, a flat-rate expense replacing OO pay, amount validation (`0`, blank, negative, `abc`, and `12.345` fail; `12.50` passes), receipt required, another driver’s load rejected, cross-driver receipt 403, viewer approve blocked, the approved total added into net, and mark-paid flipping status once and staying idempotent. The viewer walk includes `lib/settlement-actions.ts` (167 office actions on the last run).

On the snapshot copy, Steve Eller’s week of Sep 21, 2026 shows load MSE-1070 at $4,250.00, reimbursements of $104.50 (washout $40.00 approved and parts $64.50 paid), and net $4,354.50. The driver list shows one of each status, including the rejected scale ticket with the reason. The office queue shows the lumper receipt. Signed in as QA Bot, Approve and Reject are disabled.

## Screenshots

- `artifacts/driver-submit-reimbursement.png`
- `artifacts/driver-reimbursement-statuses.png`
- `artifacts/driver-my-pay.png`
- `artifacts/office-reimbursement-queue.png`
- `artifacts/office-settlement-reimbursement.png`
- `artifacts/office-settlement-list.png`
- `artifacts/office-deduction-settings.png`
- `artifacts/viewer-reimbursement-queue.png`

## Open questions for JC

- The three example deductions (fuel advance $100 fixed for company drivers, escrow $50 per load for owner-operators, ELD / insurance chargeback $35 fixed for company drivers) ship inactive. Turn on only the ones you want, or rename them.
- The company profile on this snapshot still says “M&S Loads”. USDOT and MC stay blank until someone enters them on Company contact. The statement prints “Not on file” rather than a guessed number.
- Statements include operations-desk loads (`SETTLEMENT_INCLUDES_OPERATIONS_LOADS` in `lib/settlement-statement.ts`). Driver Pay Mgmt. does not. Set the constant to false to match that screen.
- A company driver with only a customer rate has no linehaul. The customer rate is not printed as pay.
- A flat-rate driver expense replaces owner-operator pay on that load.
- Statement numbers are `SS-{week start}-{driver id}`, not a sequential SS-1001.
- A per-load deduction multiplies by the number of load lines that week, not by extra-pay lines.
- A fuel-advance fee stored as a driver pay item stays extra pay. It is not converted into a deduction.
- An approval lands on the week the driver submitted, unless that statement is already marked paid. Then it moves to the next open week (up to 16 weeks).
- Rejected items are not reopened from the queue.
- Close period does not mark the statement paid. Those stay separate on purpose.
- No pay button moves money, and there is no bank link or QuickBooks bill.

---

---

---

# Paystub upload

Branch `cursor/gusto-paystubs-c1fe`. Draft only. The Gusto API is not used. No outbound call to Gusto. No token in the repo.

JC’s decision on 2026-10-07: the Gusto API is partner-only, so payday is an upload. An office user downloads the paystub PDFs and the payroll summary from the Gusto website and uploads them here.

## What changed

Removed the OAuth connect card, the callback route, the token exchange, the employee-mapping screen, and the `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET` / `GUSTO_ENV` / `GUSTO_REDIRECT_URI` readers. `.env.example` now has an empty `PAYSTUB_UPLOAD_TOKEN=` and no Gusto client secrets.

Added:

- `app/paystubs/page.tsx` and `components/paystub-upload.tsx` — office upload and review.
- `app/api/paystubs/preview/route.ts` and `app/api/paystubs/commit/route.ts` — signed-in office write. Viewers get 403.
- `app/api/paystubs/upload/route.ts` — bearer token for a script.
- `lib/paystub-shared.ts` — parser, name matcher, and the save/don’t-save decision.
- `lib/paystubs.ts` — files, database, and the upload pipeline.
- `app/driver/paystubs/page.tsx` — that driver’s stored stubs, newest first, latest net, download, and a plain “View in Gusto” link.
- `app/api/driver/paystubs/route.ts` and `app/api/driver/paystubs/[id]/pdf/route.ts` — own stubs only. Another driver’s id is 403.
- `scripts/paystub-test.ts`.

PDFs are stored under the data uploads directory (`uploads/paystubs/files`), not `public/`. Download goes through the signed-in driver route.

The old `gusto_*` tables are still created and are not read. Nothing is dropped.

## Who can do what

Upload and assign: Administrator, Standard, and Accounting. That is the office write set. Viewer and legacy read-only can open Paystubs. Every write control is disabled, and preview/commit return 403 `View-only access`.

Owner-operators are left out of matching and out of the driver dropdown. A script that sends an owner-operator `driver_id` gets `needs_review` and the file is not attached.

## Office screen

Drop many PDFs at once. Optional payroll summary (PDF or CSV) is stored with the pay run and is not parsed. Each PDF is read on the server. The review table shows the match, and the driver, pay date, period, gross, and net can be edited before Save. An unmatched row must be assigned or skipped. A low-confidence name is not pre-selected and is not saved on its own. The same file (sha256) is refused. The same driver and pay date is flagged and is not saved again until the date or driver changes.

Anything the script cannot attach lands in Needs review.

## Upload endpoint

`POST /api/paystubs/upload`

Auth: `Authorization: Bearer <token>`. The token is `PAYSTUB_UPLOAD_TOKEN`. Comparison is sha256 then `timingSafeEqual`, so a wrong length does not throw and does not short-circuit on the raw bytes. The token is not logged. Empty or unset disables the route.

| Status | When |
| --- | --- |
| 503 | Token env is unset or empty. Body: `{ "ok": false, "error": "Paystub upload is disabled." }` |
| 401 | Missing or wrong bearer. Body: `{ "ok": false, "error": "Unauthorized." }` |
| 400 | Not multipart, no PDF, more than 40 PDFs, summary is not PDF/CSV, summary over 15 MB, or `overrides` is not a JSON array. |
| 200 | The request was accepted. Each file has its own status. |
| 500 | Unexpected failure. No token in the body. |

Fields:

- `file` (repeatable). Also accepted as `files`, `pdf`, or `pdfs`. PDF only (`%PDF` header). Max 15 MB each. Max 40 files.
- `summary` optional. PDF or CSV. Max 15 MB. Stored on the pay run when at least one file is stored or queued. Not parsed.
- `overrides` optional JSON array. Objects may include `file`, `driver_id`, `pay_date`, `period_start`, `period_end`, `gross`, `net`. Matched to files by name, in order when names repeat.
- Shorthand, applied to files that have no named override: `driver_id`, `pay_date`, `period_start`, `period_end`, `gross`, `net`.

Per file, `files[]` is one of:

- `stored` — confidently matched, or an explicit company-driver override, with pay date, period start, period end, gross, and net. `paystubId` and `driverId` are set.
- `needs_review` — not attached (`driverId` null). `reason` says why (no match, low confidence, owner-operator, or missing fields). `paystubId` is the queue row.
- `duplicate` — sha256 already on file (`existingId`, no new row), or the same driver and pay date (`paystubId` is a queue row that is not attached).
- `error` — not a PDF, empty, unreadable, over 15 MB, or `driver_id` is not in the fleet. No row.

```json
{
  "ok": true,
  "runId": 12,
  "summary": { "stored": true, "name": "payroll-summary.pdf" },
  "files": [
    {
      "file": "casey-haul.pdf",
      "status": "stored",
      "paystubId": 40,
      "driverId": 3,
      "employeeName": "Casey Haul",
      "payDate": "2026-10-03",
      "periodStart": "2026-09-21",
      "periodEnd": "2026-09-27",
      "gross": "1840.00",
      "net": "1412.55",
      "matchState": "matched"
    }
  ]
}
```

```bash
curl -sS -X POST "https://office-host/api/paystubs/upload" \
  -H "Authorization: Bearer YOUR_PAYSTUB_UPLOAD_TOKEN" \
  -F "file=@/path/casey-haul.pdf;type=application/pdf" \
  -F "file=@/path/jordan-miles.pdf;type=application/pdf" \
  -F "summary=@/path/payroll-summary.pdf;type=application/pdf" \
  -F 'overrides=[{"file":"jordan-miles.pdf","driver_id":12,"pay_date":"2026-10-03","period_start":"2026-09-21","period_end":"2026-09-27","gross":"900.00","net":"700.50"}]'
```

`YOUR_PAYSTUB_UPLOAD_TOKEN` is a placeholder. Do not put a real token in the repo or in this note.

## What the parser can read

A real Gusto “download paystub” PDF was not in the repo, and this pass did not fetch one from Gusto. The parser does not assume a column layout. It looks for these labels, on the same line or the next line:

- Employee name, or `Pay stub for <name>`
- Pay date, check date, payment date
- Pay period (two dates), or period start / period end
- Gross pay, gross earnings, total gross, gross wages (the amount before YTD; a YTD-only amount is left blank)
- Net pay, net earnings, take-home pay, net wages

Dates accepted: `MM/DD/YYYY`, `YYYY-MM-DD`, and `Month D, YYYY`. Money needs a `$`, a thousands comma, or cents.

If a label is missing, that field stays blank and the office has to type it. The name matcher only auto-assigns an exact unique company-driver name. Normalization folds case, apostrophes, periods, hyphens, middle initials, suffixes (Jr/Sr/II/III/IV), and `Last, First`. A last-name-only or partial hit is low confidence: visible, not selected, not saved. Owner-operators are never auto-matched.

## Driver app

`/driver/paystubs` lists that driver’s stored stubs, newest pay date first. The latest net is at the top. Each row has Download PDF. “View in Gusto” is a normal link to `https://app.gusto.com/login` (constant `GUSTO_EMPLOYEE_LOGIN_URL`). It does not call Gusto.

A driver who requests another driver’s stub, or a queued stub that is not theirs, gets 403. An unknown id is 404.

## How it was verified

`npm test` passed (exit 0). That run includes `scripts/viewer-role-test.ts` (preview and commit return 403 for a viewer; 160 office server actions and 9 office API write routes) and `scripts/paystub-test.ts`. The paystub script covers the name matcher, label extraction (including a pdfkit fixture read back with the same PDF text extractor), token 401/503, sha256 duplicate, same driver + pay date, owner-operator exclusion, low-confidence not attached, cross-driver 403, and no Gusto API host left in `app/`, `lib/`, `components/`, or `scripts/`.

`npm run build` passed (exit 0). Routes include `/paystubs`, `/driver/paystubs`, `POST /api/paystubs/upload`, preview, commit, and the driver PDF route.

No messages were sent. The screenshot server used a copy of the uploaded database under `/tmp`, with 2FA turned off on that copy only, and a temporary password that is not in the repo.

## Screenshots

Taken against the uploaded live-shaped database, not committed. Pay amounts are made up. Office login was a temporary password on that copy only.

- `artifacts/office-paystubs-review.png` — auto-matched, needs review, and duplicate pay date in the review table.
- `artifacts/office-paystubs-override.png` — driver override list open on the unmatched row.
- `artifacts/office-paystubs-viewer.png` — viewer, upload and save disabled.
- `artifacts/driver-paystubs.png` — latest net at the top, newest first, Download PDF, and View in Gusto.

## Open questions for JC

1. The real Gusto PDF layout is unknown here. If the downloaded stub does not use the labels above, those fields will be blank until someone pastes one sample (made-up or redacted) we can aim the parser at.
2. Office write access is Administrator, Standard, and Accounting. Say if Accounting should be view-only, or if Standard should not upload.
3. “View in Gusto” goes to `https://app.gusto.com/login`. Replace that constant if the company uses a different employee sign-in URL.
4. Skipping a queued file deletes it, so the same PDF can be uploaded again. A file that was stored, or is still in the queue, is refused by sha256.
5. The payroll summary is stored with the pay run and is not parsed.

---

# Live QA leftovers

Branch `cursor/live-qa-leftovers-7a2e` off tip `99bc192` (Office Update 116). Draft only.

Measured on a copy of the live SQLite snapshot (272 loads, 10 drivers, 7 users). The copy is not committed. No Samsara token was set on this machine, so engine-hour calls return immediately unless a test forces a hang.

## Fuel speed

**Root cause (code).** Two layers.

1. `loadFuelWeekView` called `localWeekRange` for every fuel row on every week scan. Each call built several `Intl.DateTimeFormat` objects. On this copy that was most of the page: the before profile spent **6543 ms** inside the week view, **7783 ms** for the whole fuel data path (rematch, week view, closeout, mpg, idle, audit).
2. `hydrateSamsaraEngineHourWindow` checked its budget only between trucks. Each history request used a **15s** abort that ignored the budget, and the page also waited up to 1.5s on a Samsara fleet call whose result was thrown away. That matches the re-walk **~14.9s** (week math plus one hung history call) better than the seeded-data ~5s claim.

**Fix.** Memoize `localWeekRange` by week start. Pass the budget abort into the history fetch. Drop the unused fleet wait.

**Timings (copy of the live DB, no token).**

| Path | Before | After |
| --- | --- | --- |
| Data path, cold (`tsx` script, same steps as the page) | 7783 ms (week view 6543 ms) | 1037 ms |
| Week view only, warm | — | 183 ms |
| `GET /fuel` on the dev server, first hit | — | 4.86 s (includes compile) |
| `GET /fuel` on the dev server, second hit | — | 2.92 s |

Smoke covers a hung history call: with a 80 ms budget the hydrate returns in under 1s and fetches nothing. On a live host with a token, a stuck vehicle is now cut off at the 1200 ms page budget instead of 15s.

## Viewer financials lock

**Root cause (code).** `ViewOnlyGuard` set `disabled` in a client effect. Server HTML and the next React render both painted the rate input and Save as enabled. The server already rejected the write.

**Fix.** The financials form takes `readOnly` from the role. The customer rate (and the other money inputs) render `disabled`, `aria-disabled`, and `title="View-only access"`. Save is omitted. Create invoice is disabled. Disabled fields use a gray background so the lock is visible. `requireWriteRole` is unchanged.

**Verified.** Signed in as QA Bot (viewer) on a copy of the live DB, `GET /loads/500?tab=financials` (MSE-1071):

- `#rate` is `disabled`, title `View-only access`
- no Save button
- Create invoice is `disabled`
- the note "View-only. You cannot change this rate." is in the document

Screenshot: `viewer-financials.png`.

## Desk and on-time vs missing arrivals

**Root cause (code).** On-time treated `updated_at` against `delivery_end + 30 min`. Imported completed loads were touched recently and their windows are in the past, so almost every one looked late. SQL on the snapshot matched the reports screen exactly: **1 on time / 263 late** of 264 delivered+completed loads. Desk "Late to pickup" did the same kind of thing for active loads: a blank `driver_progress` plus a past pickup window was late, even when the stops already had on-time arrivals. MSE-1071 is `at_delivery`, pickup arrived `2026-09-20T14:49` before `18:00`, delivery arrived `2026-09-23T13:03` before `18:00`, and `driver_progress` is blank. That is why Desk said Running late and the board, which never read that signal, showed no badge.

**Fix.** A load is late only when a pickup or delivery stop has a non-empty `arrived_at` after that window. A blank arrival is left out, not marked late and not an attention item. Reports use the last delivery stop's arrival, with the same 30 minute grace, and skip the load when that arrival is blank. The board Running late pill is the same late inbox item Desk uses.

**After, on the live copy.**

- On-time report: **18 loads with a delivery arrival, 15 late, 3 on time, 17%**. The other delivered/completed loads have no last-delivery arrival and are excluded.
- Those 15 late rows are **data, not missing arrivals**. Examples: load 1005961 window `2026-06-16T17:00`, arrived `2026-09-29T02:44`; 1005974 window `2026-06-22T17:00`, arrived `2026-09-16T13:40`.
- Desk inbox: **4 loads fine, 267 need attention**. Late items: **none** (MSE-1071 is not late on Desk or the board).
- What remains is mostly **data**: `missing_pod` 264. The attachments table has one row, kind `other`, and zero `pod` rows. The other open items are reefer 1, gps quiet 1, compliance 1, unassigned 1, Samsara 10.

## A. Search Enter vs click

**Root cause (code).** Enter and the Search button both submit one form, but the handler searched React state. Enter could run before that state had the typed query, so `q` was still empty and the search returned the 7 live loads. A click happened after the re-render, so `q` was `1006198`. With Archived unchecked, delivered loads were hidden, and the click correctly returned 0. Load 1006198 is `delivered` and shows LATE on Reports.

A saved search in `sessionStorage` could also paint those 7 loads back over a new result.

**Fix.** Submit reads `FormData`, so Enter and the button use the same fields. A restored session does not overwrite a search that just ran. An exact load number is included even when Archived is off (other filters still apply). Browsing with an empty query still honors the Archived checkbox.

**Verified.** `searchLoads({ q: "1006198", includeArchived: false })` returns that one delivered load. In the browser, Enter and the Search button each showed **1 load**, 1006198, DELIVERED. Screenshot: `search-enter.png`.

## B. Desk Unassigned vs Needs a unit, and the board late badge

**Root cause (code).** The Unassigned loads KPI counted `status = 'available'` (**1**, MSE-1070, which has truck 19). Needs a unit lists active loads with no truck (**2**: 1006238 dispatched, 1006240 in transit). The board never rendered Desk's late item, so MSE-1071 could be late on Desk and unmarked on the board.

**Fix.** The KPI counts active loads with `truck_id IS NULL`, the same set as Needs a unit. Both links open the active board, where those two rows are visible (the old link was the available-status tab, which hid them). The board late pill uses the Desk late items.

**After, on the live copy.** KPI **2**, Needs a unit **· 2**, load numbers 1006238 and 1006240. No Running late pill on MSE-1071, matching Desk.

**Still a different definition, called out.** The inbox kind `unassigned` still means `status = available` (MSE-1070, which has a truck). It is not the Needs a unit list. That exception is one of the 267 attention items. It was not the KPI the re-walk counted as 1.

## C. Desk Ack / Snooze / Resolve for viewers

**Root cause (code).** Those controls were normal submit buttons. `exceptionAction` already calls `requireLoadEditor`, which rejects a viewer, but the HTML looked clickable.

**Fix.** The desk inbox passes `readOnly` for a view-only role. The note field and Ack, Snooze 4h, and Resolve render disabled with the same view-only title. The server check is unchanged.

**Verified.** QA Bot desk HTML: 278 Ack buttons, all `disabled` with `title="View-only access"`. The page reads **4 loads fine · 267 need attention**.

## Tests and build

`npm test` passed (viewer-role, smoke, driver API, Samsara address/routes/safety, trailer custody, relay map, places pin).

`npm run build` passed (`next build` and standalone asset copy) on this same tree.
