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
