# MS Express TMS — ranked recommendations

Research and draft only. 23 Sep 2026. Supersedes the earlier artifact that said to rebase PR 90 onto PR 92. **Do not restack those PRs.**

No merge, no Office Update, no deploy, no production database, no fake PrePass rows, no installs.

**Product:** MS Express trucking TMS (this repo, `jcHastings/msetms`). Not the M&S Loads brokerage Ascend / Vooma layer. Ascend strings in this repo are CSV/XLSX import shapes and a BOL layout (`lib/bol-ascend.ts`).

**Office source used:** `eacc18cdeb584983262bf0bc5ee256131aa62e86` on `cursor/prepass-api-pull-97ee`. JC said that SHA is `msetms.mandsloads.com`. This pass did not probe that host (low confidence on the running process; high confidence on the git tree).

**GitHub `main`:** `7922994`, merge of PR 1 on 23 Aug 2026. The office tip is 305 commits ahead of `main`. A merge to `main` does not change the office.

---

## How a row is ranked

| Rank | Means |
| --- | --- |
| **P0** | Do or decide this week. Process, workaround, or a stop-order. No new product tip in this addendum. |
| **P1** | Next tip JC would have to name. One screen or one doc. Not a restack of PR 90 or PR 92. |
| **P2** | Real later work, or blocked until a fact exists. |

| Class | Means |
| --- | --- |
| **process** | JC or CoS action. No git. |
| **workaround** | Use a path that already ships. Do not invent live data. |
| **tip-sized** | One future draft tip could hold it. This PR is not that tip. |
| **research-only** | Stays in this document until a missing fact is filled. |
| **reference-only** | Read if useful. No install, no port, no office tip. |

| Confidence | Means |
| --- | --- |
| **high** | Read in the `eacc18c` tree (or a `gh` listing) this session. |
| **medium** | Code default is clear; the live SQLite row or the running process was not opened. |
| **low** | Not observed. Do not build on it. |

Owners: **JC human** (Update, vendor, money), **CoS** (cadence, backup, no deploy), **TMS Build** (this repo, only after JC names the tip), **Grok Build** (drafts and research; no Update).

---

## 1. Executive summary

P0 is not a new build.

1. Leave **PR 90** (`50c16c7`, Money desk) and **PR 92** (`99b88c9`, Orbcomm Mode) as sibling drafts on `eacc18c`. Do not rebase one onto the other. The office can take **one** of those Updates or **neither**. Taking both is a restack, and this addendum does not do that.
2. PrePass token can stay. Toll Transaction API **403** on account **370972** is an entitlement gap for JoJo. Workaround is CSV/XLSX on `/tolls` plus transponder mapping. Do not fake a live pull.
3. Copy `data/` off the PC before any Update JC does name. There is no backup feature (catalog item 295 only).
4. Tell the desk the sign-in that is in the code: **email + password**. `SHIPPED.md` still says dispatcher PIN `MS Test / 4020` and driver PINs. Whether the live company row still forces email OTP is medium confidence (the flag is set once, then Settings can clear it).
5. Jev stays shadow advise-only. Archify, Ponytail, Ultrafast, and pstack Part 2 stay reference-only. No installs.

P1 items are tip-sized and wait for a **new** JC sentence. They are not patches to PR 90 or PR 92.

---

## 2. Weak and low-confidence items

Do not treat these as facts about the office PC.

| ID | Claim that is weak | Why it is weak | What would make it solid |
| --- | --- | --- | --- |
| W1 | The process listening on `msetms.mandsloads.com` is exactly `eacc18c` | JC said so. No server read, no version endpoint checked | JC or CoS reads the build SHA on the PC |
| W2 | Every office user is on email OTP right now | `lib/db.ts` sets `require_dispatcher_2fa = 1` only when `email_otp_shipped` is 0. After that, Settings can turn it off. Live row not opened | CoS looks at Settings → 2-step, or one login |
| W3 | A current Orbcomm export contains Continuous / Start/Stop / Cycle Sentry | PR 92 body: checked-in fixtures are power text (`Power On`, `Shutdown`, CSV `Running` / `Off` / `Shutdown`). No live export was opened | CoS opens one Reefer Status Report and looks for those words |
| W4 | QuickBooks on the office PC is a live realm | Git cannot see `data/qbo-refresh.json`. Code writes `demo-{load_number}-…` when no session (`lib/integrations/quickbooks.ts`) | CoS reads one delivered load’s invoice id prefix. Do not copy the refresh token |
| W5 | Twilio A2P still needs public privacy URLs | PR 12 HTML is not on `eacc18c`. No mail or Twilio console was read | JC says whether A2P is already approved |
| W6 | Fuel closeout and toll CSV are or are not being run each week | Features exist. Usage is an office habit, not a commit | CoS says yes or no for the last closed week |
| W7 | Someone is paid from the 3% commission worksheet | `listCommissions` hardcodes `percent = 3` (`lib/accounting.ts`). No pay event was read | JC says the worksheet is a look, or names who is paid |
| W8 | JoJo will enable Toll Transaction API, and for which dates | Not in git. Handoff doc: max 31 days per call, start not older than 2 years | JoJo’s reply |
| W9 | A reverse proxy sits in front of the office app | Code difference is real (section A4). Whether it matters depends on the network, which was not inspected | Whoever runs the PC says if Cloudflare or another proxy terminates TLS |
| W10 | Open PR count stays 86 | `gh pr list` on 23 Sep 2026 returned 86 open. The number will drift | Re-list before closing anything |
| W11 | PR 90 and PR 92 smoke results | Taken from those PR bodies. This pass did not re-run `npm test` on either SHA | Re-run only if JC names an Update of that existing SHA |

Everything in the rank table that is not in this list is **high confidence** about the git tree, not about live dollars or live mail.

---

## 3. Do not restack PR 90 or PR 92

| PR | SHA | Branch | Base | What it already is |
| --- | --- | --- | --- | --- |
| [90](https://github.com/jcHastings/msetms/pull/90) | `50c16c7` | `cursor/money-desk-phase1-d47b` | `eacc18c` | `/money`: CPM, contribution, soft flags, 13-week sketch labeled not bank-backed, three canned asks. Sends nothing. |
| [92](https://github.com/jcHastings/msetms/pull/92) | `99b88c9` | `cursor/orbcomm-reefer-mode-318c` | `eacc18c` | Orbcomm table: Mode column after Power. Power-only strings do not fill Mode. |

They both edit `app/globals.css` and `scripts/smoke.ts` (diff of each against `eacc18c`). That is an overlap, not a license to rebase.

**Order for CoS:**

- Leave both branches and both draft PRs as they are.
- If JC names **one** Office Update, it is that existing SHA against the current office tip `eacc18c`. Still no restack.
- Do not Update the other one afterward. It would no longer apply cleanly, and fixing that is a restack.
- A later combined desk is a **new** tip JC names. It is not this document, and it is not a rebase of these two PRs by Grok Build.

Money-desk notes that would have been patches on PR 90 (quarter CPM blank above 20,000 miles, empty tolls) stay **research-only** until that new tip exists. The 20,000-mile rule is already on the office tip in `lib/fuel-mpg.ts` (`odometerDeltaMiles` returns null when `delta > 20_000`). It does not require PR 90 to be true.

---

## 4. PrePass 403 — workarounds only

**High confidence, from `lib/prepass-client.ts` and `docs/handoff/prepass-tolls-phase1.md`.**

- Token: `POST https://api.prepass.com/auth/v1/token` with header `client_id` / `client_secret`, one retry as `grant_type=client_credentials`.
- Transactions: `GET https://api.prepass.com/tolltransaction/v1/transactions` with `accountNumbers` from `PREPASS_ACCOUNT_NUMBER`. JC locked the account as **370972**.
- Token HTTP 401/403 copy: “PrePass rejected the client credentials.”
- Transactions HTTP 401/403 copy: “PrePass rejected the access token.”
- JC’s office fact: token OK, Toll Transaction API 403. The second sentence is the wrong diagnosis when the token call already succeeded. That wording bug is a future tip (P1.1). It is not a reason to rotate `PREPASS_CLIENT_SECRET`.

**Workarounds that already ship on `eacc18c`:**

1. Import CSV or XLSX on `/tolls` (`POST /api/tolls/import`, `importTollsFromText`). Dedup key already exists on `toll_transactions`.
2. Map `trucks.prepass_transponder_id`. Match order is transponder, then the driver on `drivers.truck_id`. Blank map leaves rows unassigned on purpose.
3. Assign unknown rows by hand on the same screen.
4. Keep Pull PrePass API unused while it returns 403. A failed pull must stay a failure. Do not convert 403 into an empty successful import, and do not insert placeholder toll rows.

**Not a workaround:** scraping the PrePass portal, replaying a saved JSON body as if it were today’s pull, or copying another account’s transactions.

Even after JoJo enables the API, one call covers at most 31 days and the default window in code is 14 days. History still wants files. That limit is in the handoff doc, not a guess.

---

## 5. Ranked recommendations

### P0 — this week

**P0.1 Leave PR 90 and PR 92 unstacked.**  
Class: process. Impact: prevents a bad Office Update. Evidence: both diffs touch `app/globals.css` and `scripts/smoke.ts`; bases are both `eacc18c`. Confidence: high. Owner: JC human decides at most one Update; CoS does not rebase; Grok Build does not open a combine branch.

**P0.2 Do not merge or Update `main`-based PRs.**  
Class: process. Impact: `main` is not the office. Evidence: `main` is `7922994`; open PRs with base `main` on 23 Sep 2026 include 2, 3, 4, 5, 6, 7, 8, 9, 12, 34, 62, 63, 64, 80, 83, 84, 85, 91 (count is W10). Confidence: high on the list that day. Owner: CoS. Closing them is P2.7 and waits for JC to say “close.”

**P0.3 Back up `data/` before any Update.**  
Class: process. Impact: data-loss. Evidence: one SQLite file (`TMS_DB_PATH` or `data/tms.db`), uploads under `data/uploads/`, QBO refresh in `data/qbo-refresh.json`. `migrate()` in `lib/db.ts` runs on every `getDb()`. No backup/restore screen (catalog 295). Confidence: high that the feature is absent; medium that the PC has only one copy (disk layout not seen). Owner: CoS.

**P0.4 PrePass: CSV/XLSX, no fake pull.**  
Class: workaround. Impact: money-wrong if tolls are missing or invented. Evidence: section 4. Confidence: high. Owner: CoS imports the portal file; JC human asks JoJo about account 370972; TMS Build does not add synthetic rows.

**P0.5 Fill transponder ids from the PrePass device list.**  
Class: workaround. Impact: desk-now on `/tolls`; unassigned tolls stay unassigned until this is done. Evidence: `docs/handoff/prepass-tolls-phase1.md` match order. Confidence: high on the rule; low on how many trucks are already mapped (W6). Owner: CoS. JC spot-checks one week of rows.

**P0.6 Tell the desk the coded sign-in.**  
Class: process. Impact: desk-now (lockout if someone follows `SHIPPED.md`). Evidence: `app/login/page.tsx` subtitle “Sign in with email and password.” `app/driver/login/page.tsx` asks for the email and password dispatch set. `SHIPPED.md` Sign-in still says dispatcher PIN `MS Test / 4020`, authenticator-at-login, 2-step default off, and driver PINs. Confidence: high on the contradiction; medium on whether live 2FA is still forced (W2). Owner: CoS, this week, no deploy.

**P0.7 Look at one invoice id prefix.**  
Class: research-only. Impact: money-wrong if a `demo-` id is treated as Intuit. Evidence: `sendLoadToQuickbooks` demo id pattern in `lib/integrations/quickbooks.ts`. Confidence: low on which prefix the office has (W4). Owner: CoS. Do not paste tokens.

**P0.8 Standing build rules (no new tip).**  
Class: research-only. Impact: stops the next patch from crossing a product line. Evidence: cited beside each rule.

- New `/api` route checks a session. `middleware.ts` matcher excludes `api`. Confidence: high.
- Driver attachment route 404s customer-rate documents (`app/api/attachments/[id]/route.ts`). Do not show customer rate on `/driver`. Confidence: high.
- Samsara is not the reefer source (`PRODUCT_CATALOG.md` item 179; separate clients). Confidence: high.
- Do not widen PrePass (`costCenters` must not be sent with account 370972; handoff doc). Confidence: high.
- Rate-con fields stay blank when the packet does not have them (`SHIPPED.md` item 13). Confidence: high.
- Fuel closeout and fuel audit do not text drivers (`docs/fuel-closeout.md`, `SHIPPED.md`). Confidence: high.
- Owner-operator pay is not a QuickBooks bill (`SHIPPED.md` Accounting). Confidence: high.

Owner: TMS Build and Grok Build on any future tip JC names.

**P0.9 Product boundary.**  
Class: process. Impact: stops brokerage work landing in the carrier database. Evidence: backhaul excludes house customer “M&S Loads” (`lib/backhaul-shared.ts`); `SHIPPED.md` skips AscendCarrierPortal, DAT, and pixel-perfect Ascend. Confidence: high. Owner: JC human, CoS, every build agent.

**P0.10 Reference-only and shadow-only.**  
Class: reference-only. Impact: none until JC reopens them by name. Evidence: no Archify, Ponytail, Ultrafast, or pstack matches in `eacc18c` docs or TS; “Jev” appears only inside a `package-lock.json` hash. Confidence: high that they are not installed in this tree. Owner: nobody installs them. Jev may advise in shadow and does not commit.

### P1 — next named tip (not a restack)

**P1.1 PrePass transactions-403 banner.**  
Class: tip-sized. Impact: stops a credential rotation that would not fix entitlement. Evidence: `transactionsFailureMessage` in `lib/prepass-client.ts` (section 4). Confidence: high. Owner: TMS Build after JC names a banner tip. Acceptance: token HTTP 200 plus transactions HTTP 403 does not say the client secret was rejected, does say CSV still works, and writes **zero** toll rows.

**P1.2 Sign-in and “not office deploy” doc repair.**  
Class: tip-sized. Impact: desk-now the next time someone reads `SHIPPED.md`. Evidence: P0.6; `docs/driver-api-v1.md` says the BFF is “Not office deploy” while `/api/driver/v1/*` and `DriverAssistSheet` are in `eacc18c`; `SHIPPED.md` “Skipped … Master Loads” fights `lib/master-load.ts` and the Master tab (the skip meant Ascend’s product). Confidence: high. Owner: TMS Build when JC allows a doc tip. A doc tip still changes the office only if JC Updates it. Until then CoS uses P0.6.

**P1.3 HOS-short on the existing inbox.**  
Class: tip-sized. Impact: desk-now for a driver with no drive time left. Evidence: `/safety` flags live Samsara `driveRemainingMs <= 0` or `timeUntilBreakMs <= 0` (`lib/safety.ts`). `EXCEPTION_KINDS` in `lib/exceptions.ts` are `reefer`, `late`, `detention`, `missing_contact`, `gps_quiet`, `missing_pod`, `invoice_send`, `compliance`, `unassigned`. No HOS kind. Confidence: high. Owner: TMS Build after JC says yes. Acceptance: demo clocks do not create the row; a live zero-drive clock on an active load appears once; ack uses `exception_states`.

**P1.4 Label `/ifta` as an estimate.**  
Class: tip-sized. Impact: money-wrong at quarter filing if someone files the page. Evidence: per-load refresh uses Samsara IFTA or a labeled demo (`lib/integrations/ifta.ts`). The quarter page uses routing miles plus fuel-transaction states (`lib/ifta-quarter.ts`, `app/ifta/page.tsx`). Confidence: high. Owner: TMS Build after JC names it. Acceptance: the page says it is not the Samsara jurisdiction filing. Do not invent jurisdiction miles.

**P1.5 Mocked PrePass contract test on `npm test`.**  
Class: tip-sized. Impact: later, keeps the 403 path from being “fixed” into a fake success. Evidence: `scripts/prepass-api-pull-test.ts` exists and is not in `package.json` `test`. CI is `scripts/smoke.ts` plus `scripts/driver-api-v1-test.ts` (`.github/workflows/test.yml`). Confidence: high that it is outside CI; medium that the script never calls the network (not re-read line by line this pass — read it before adding). Owner: TMS Build only if the test stays on a mock fetch.

**P1.6 Customer billing email hygiene.**  
Class: process. Impact: auto-invoice cannot send without a billing or main email (`lib/auto-invoice.ts`, `SHIPPED.md`). Confidence: high on the rule; low on which customers are missing email (books not opened). Owner: CoS.

**P1.7 Share-link expiry.**  
Class: process. Impact: `/l/` and `/t/` sit outside office middleware by design (`middleware.ts`). Trailer links require an expiry in `SHIPPED.md`. Confidence: high. Owner: CoS sets a short expiry when minting. No code.

### P2 — later or blocked

**P2.1 Quarter CPM / MPG blank above 20,000 miles.**  
Class: research-only until a new money tip. Impact: a long quarter shows n/a, not zero. Evidence: `lib/fuel-mpg.ts`. PR 90 inherits it and must not be patched here. Confidence: high. Owner: JC human decides whether blank is acceptable. Do not raise the cap in this pass; the cap is what drops a bad odometer jump.

**P2.2 Commission worksheet label.**  
Class: tip-sized. Impact: money-wrong only if someone pays from it (W7). Evidence: hardcoded 3, not `default_gross_margin_percent`. Confidence: high on the code; low on use. Owner: JC says whether 3% stays. TMS Build only then.

**P2.3 OO settlement statement.**  
Class: tip-sized, large. Impact: later. Evidence: `lib/settlement.ts` stores rate × percent and accounting can mark `settlements` paid. No deduction list, statement PDF, or 1099. Catalog 247–259. Confidence: high. Owner: JC scopes it. Not part of PR 90.

**P2.4 Samsara jurisdiction quarter rollup.**  
Class: tip-sized, large. Impact: filing. Evidence: section P1.4. Confidence: high that it does not exist. Owner: JC picks the filing source first (Samsara report vs TMS).

**P2.5 Per-customer detention free time.**  
Class: tip-sized. Impact: later. Evidence: `DETENTION_FREE_MS` is 2 hours (`lib/detention-clock.ts`); geofence is 2 miles (`GEOFENCE_MILES` in `lib/geofence.ts`). Confidence: high. Owner: JC only if a contract names another free time.

**P2.6 Orbcomm Mode vs the load’s paperwork mode.**  
Class: research-only. Impact: noisy inbox if built blind. Evidence: `loads.reefer_mode` is the confirmation order (`lib/reefer-shared.ts`); `reefer_readings.operating_mode` is telemetry. Live cycle text is W3. Owner: nobody, until W3 is answered and JC asks. PR 92 already displays telemetry when the string contains it; do not restack it to add this comparison.

**P2.7 Close superseded PRs; fast-forward `main` only if JC says that sentence.**  
Class: process. Impact: a shorter queue. Evidence: section P0.2. Confidence: high on the problem; the close list must be re-checked (W10). Owner: JC says close. CoS closes. Do not merge them. Fast-forward `main` to the office SHA only after those PRs are closed, and only if JC asks.

**P2.8 PR 91 (`IftaReport.error`).**  
Class: research-only. Impact: none on the desk. Evidence: on `eacc18c`, `saveIftaReport` still accepts `error?` and stores `input.error ?? ""`; `persistReport` never passes `error`. Failures throw. The open PR’s base is `main`, so merging it does not touch the office. Confidence: high. Owner: ignore. Do not retarget it onto PR 90 or PR 92.

**P2.9 One login factor.**  
Class: research-only. Impact: desk-now only if admins think authenticator enrollment is the login gate. Evidence: login path is email OTP (`lib/dispatcher-actions.ts` / `lib/dispatcher-email-otp.ts`); `verifyTotpCode` is enrollment, not the post-password check. Live flag is W2. Confidence: high on the split; medium on production. Owner: JC picks email OTP or authenticator. No tip until then.

**P2.10 Office login IP vs driver API IP.**  
Class: tip-sized, small. Impact: low on a single PC; higher if a client can spoof `X-Forwarded-For` (W9). Evidence: `requestClientIp` in `lib/login-audit.ts` returns the first forwarded-for value with no `TRUSTED_PROXY` check. `lib/driver-api.ts` documents that forwarded-for is used only when `TRUSTED_PROXY` is set. Confidence: high on the code. Owner: TMS Build only on a future auth tip.

**P2.11 a11y pass.**  
Class: research-only. Impact: later. Evidence: no a11y, WCAG, or B1–B4 checklist in repo markdown. Known small defects if JC later names them: `/desk` handoff textarea has a placeholder and no `<label>` (`app/desk/page.tsx`); board tabs are links with `aria-current`, not a tab widget (`components/board-toolbar.tsx`). Confidence: high that the checklist is absent; the two defects were seen in source, not with a screen reader. Owner: JC writes the four items first. Taste Skill (`.agents/skills/design-taste-frontend/SKILL.md`) says it is not for dashboards. Do not restyle the desk with it.

**P2.12 SMS legal HTML.**  
Class: tip-sized, blocked. Impact: unknown (W5). Evidence: `docs/sms-privacy.html`, `docs/sms-terms.html`, `docs/sms-opt-in-form.html` exist on PR 12’s branch `cursor/sms-legal-pages-792d` and are not in `eacc18c`. No `/privacy` route on the office tip. Owner: JC confirms A2P still needs URLs. Do not merge PR 12 into `main`.

**P2.13 Copy-only backup script.**  
Class: tip-sized. Impact: data-loss, after P0.3 is already a human copy. Evidence: section P0.3. Owner: TMS Build only if JC asks. The script copies to a path JC passes. It does not upload.

**P2.14 Drop unused `driver_api_rate_hits` writes — there are none.**  
Class: tip-sized, tiny. Impact: none. Evidence: table is created in `lib/db.ts` and has no other references. Confidence: high. Owner: ignore until a cleanup night. Not worth an Update.

**P2.15 Do not rewrite `scripts/smoke.ts`.**  
Class: research-only. Impact: the file is 20,777 lines and is the CI gate. A split can hide a regression. Owner: TMS Build adds asserts next to a feature JC named. Repo-wide `npm run lint` is documented in CI as still failing; do not burn an Update on a format-only lint sweep.

**P2.16 Integrations that stay out.**  
Class: reference-only. Impact: none. Evidence: no Motive, Geotab, Carrier Lynx, Thermo King, DAT, Truckstop, EDI 204/214/210, factoring, Clearinghouse API, or DVIR client under `lib/` at `eacc18c`. Drug tests are manual CRUD on `/compliance`. Fuel is FleetOne file import (`lib/fuel-fleetone.ts`), not a live card API. Owner: JC human. Native iOS/Android stays parked (`docs/handoff/apple-dev-driver.md`, fixture default off). Do not run `ensure-apple-dev-driver` on the office database.

---

## 6. What JC can Update without a restack

| Choice | Result | This addendum |
| --- | --- | --- |
| Update neither | Office stays `eacc18c`. Both drafts remain ready. | Preferred if JC wants zero deploy this week. |
| Update PR 92 only | Office becomes `99b88c9` if that SHA is what JC names. Mode column ships. Money desk stays draft and **does not move**. | Allowed. Not a restack. |
| Update PR 90 only | Office becomes `50c16c7` if that SHA is what JC names. `/money` ships. Orbcomm Mode stays draft and **does not move**. | Allowed. Not a restack. Toll dollars on that desk follow whatever CSV is already imported. API 403 must not be filled with fake rows. |
| Update both | Requires a restack. | **Do not.** |

Acceptance if JC names one of those existing SHAs: CoS already has an off-box copy of `data/`. The other PR is still open and still based on `eacc18c`. No new combine commit exists.

---

## 7. Architecture (short)

**Keep.** One Next.js 16 process, Node ≥ 22.13, `npm start` via `scripts/start-standalone.mjs`, one SQLite file (`node:sqlite`, WAL). TMS normalizes Samsara, Orbcomm, fuel files, PrePass files, and QuickBooks. It does not replace them.

**Evolve, later.** A single written office SHA (P0.1). Backup copies (P0.3, optional P2.13). Honest PrePass errors (P1.1). HOS on the inbox that already exists (P1.3).

**Do not split.** Do not extract driver API, accounting, or Mike into other services. Do not put brokerage Vooma in this database. Do not move to Postgres while one PC is the only writer. Agents do not open the office `tms.db`.

---

## 8. Competitive gaps (what is worth doing)

| Other product | Gap that is real in this tree | Rank | Ignore |
| --- | --- | --- | --- |
| Samsara | HOS lives on `/safety`, not the inbox | P1.3 | Rebuilding ELD or live video. Stills already exist (`lib/integrations/samsara-still.ts`) |
| Motive / Geotab | No adapter | P2.16 | A second GPS |
| McLeod / TMW | Settlements and filing are thin | P2.3, P2.4 | Full GL, payroll, multi-company |
| Ascend | Import dialect only | P0.9 | Portal, DAT, pixel match |
| Rose Rocket | Customer login portal and inbound mail are absent | not scheduled | `/l/` and `/t/` already cover a copied link |
| DAT / Truckstop | No posting | P2.16 | Public capacity |
| Comdata / EFS | No live money-code API | P2.16 | File import already buckets money code and DEF |
| QuickBooks | TMS invoices the customer rate; books stay in QBO | P0.7 | A second ledger |

---

## 9. Risk register

| ID | Risk | Rank | Confidence | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Restack or double Update of PR 90 and PR 92 | P0.1 | high | Section 6 |
| K2 | Only copy of `data/tms.db` | P0.3 | high feature gap; medium on disk count | CoS copy |
| K3 | Rotating a good PrePass token, or faking 403 into rows | P0.4, P1.1 | high | CSV; banner tip writes zero rows |
| K4 | Money sketch read as the bank, if PR 90 is the one Update | P0.1 | high on the PR 90 banner text | JC reads the banner; no bank work |
| K5 | Quarter miles filed from `/ifta` | P1.4 | high | Label, and CoS does not file from that page today |
| K6 | Desk follows PIN 4020 | P0.6 | high | CoS tells them email + password |
| K7 | New API route with no session check | P0.8 | high | Review rule |
| K8 | `demo-` invoice treated as Intuit | P0.7 | low until looked at | One load, prefix only |
| K9 | Apple Dev driver row in the office DB | P2.16 | high that the fixture is off by default; low that nobody will run the script | Do not run it |
| K10 | Brokerage scope in this repo | P0.9 | high | Stop the work |
| K11 | Reference stacks get installed | P0.10 | high they are absent now | No installs |

No incident counts and no mail rows are in this report. None were queried.

---

## 10. Sources

- Tree `eacc18c`: `lib/db.ts` (2FA one-shot update), `lib/prepass-client.ts`, `lib/fuel-mpg.ts`, `lib/exceptions.ts`, `lib/accounting.ts` `listCommissions`, `lib/integrations/ifta.ts`, `lib/integrations/quickbooks.ts`, `lib/login-audit.ts` `requestClientIp`, `lib/driver-api.ts` trusted-proxy comment, `middleware.ts`, `app/login/page.tsx`, `app/driver/login/page.tsx`, `SHIPPED.md`, `docs/handoff/prepass-tolls-phase1.md`, `docs/driver-api-v1.md`, `docs/handoff/apple-dev-driver.md`, `package.json` test script, `.github/workflows/test.yml`.
- PR 90 and PR 92 bodies and file lists via `gh pr view` on 23 Sep 2026. Diff names via `git diff --name-only eacc18c 50c16c7` and `eacc18c 99b88c9`.
- `gh pr list` the same day for the `main`-based set.

Supermemory was not used.

### Still open (same as the weak list)

W1 running SHA, W2 live 2FA row, W3 Orbcomm cycle text, W4 QBO prefix, W5 A2P, W6 whether last week’s CSV and closeout were filed, W7 who the 3% is for, W8 JoJo’s date, W9 proxy, W10 PR count drift, W11 re-run of smoke on 90/92 only if JC names that Update.

This pass did not Office Update, merge, restack, push product code, call PrePass, or open the office database.
