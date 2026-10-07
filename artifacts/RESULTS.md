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

Focused rank of the test fleet: **7ms** (asserted under 50ms). Two runs return the same rows; there is no accept/reject table.

Samsara budget: **1200ms**. The budget test hangs a promise for 80ms of a 1200ms cap and returns the fallback with `timedOut` in under 1000ms. A fast promise wins and is not marked timed out.

## How verified

- `scripts/assign-suggestions-test.ts`: order (miles, then HOS, reefer, docs), hard blocks, stale GPS, no token, demo HOS ignored, timeout phrase, out of service disabled, back-to-back not overlapping, off duty, dry load, pickup point, dialog and board source strings.
- `npm test` and `npm run build`: see the PR update after the full run.
- Screenshots under `artifacts/` (office board only; the driver app does not use this dialog).

## Screenshots

- `artifacts/assign-suggestions.png` — dispatcher, Assign dialog, top 3 with reasons.
- `artifacts/assign-suggestions-missing-data.png` — same dialog when live Samsara is not usable (stale GPS, HOS unknown).
- `artifacts/assign-suggestions-viewer.png` — viewer, suggestions visible, select and Assign disabled.

## Open questions for JC

- Empty miles in the reason are straight-line (Mike), not Google road miles. Road miles stay on the existing assign path (`refreshEmptyMilesAround`) so the dialog does not call Google or write the load. Change `ASSIGN_SUGGESTION_WEIGHTS` if the stand-in for unknown miles (250) or the HOS and reefer weights should move.
- Out-of-service trucks are omitted from the top 3 when three better trucks exist. Overlapping trucks are shown lower, not hidden, when they make the cut.
- GPS age uses the company setting `alert_gps_quiet_hours` (default 2), same threshold as the inbox quiet rule.
- Driver identity falls through to the open load because the snapshot rarely sets `drivers.truck_id`.
- Two drivers can share one `last_trailer_id`, so two rows can name the same reefer. The tap still fills that trailer; the dispatcher confirms.
- Accounting can still open an enabled Assign button (`canWrite` is true). The server still blocks accounting from assigning. This change only locks viewer and read-only, which is what the request asked for.
